use std::collections::VecDeque;
use std::io::{Read, Seek, Write};
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;

use libp2p::futures::StreamExt;
use libp2p::swarm::SwarmEvent;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::sync::{mpsc, Mutex};

use aegis_protocol::{AepMessage, ReadReceiptData, TypingIndicatorData};
use aegis_shared_types::{AppState, FileTransferMode};

use super::super::{
    cleanup_incoming_state, load_outgoing_metadata, mode_to_str, persist_incoming_metadata,
    persist_outgoing_metadata, sanitize_filename, write_incoming_chunk, DEFAULT_CHUNK_SIZE,
    MAX_FILE_SIZE_BYTES, MAX_INFLIGHT_FILE_BYTES, MAX_OUTBOX_MESSAGES, MAX_UNAPPROVED_BUFFER_BYTES,
};
use super::network::NetworkResources;
use crate::connectivity::{
    bridge_can_forward_to, emit_bridge_snapshot, note_bridge_forward_attempt,
    note_bridge_forward_failure, note_bridge_forward_success,
};

use scu128::Scu128;

pub(super) fn spawn_swarm_processing<R: Runtime>(
    app: AppHandle<R>,
    network: NetworkResources,
    app_state: AppState,
    db_pool: sqlx::Pool<sqlx::Sqlite>,
    mut net_rx: mpsc::Receiver<Vec<u8>>,
    mut file_rx: mpsc::Receiver<aegis_shared_types::FileTransferCommand>,
    event_tx: mpsc::Sender<AepMessage>,
    outbox: Arc<Mutex<VecDeque<Vec<u8>>>>,
) {
    let NetworkResources {
        shared_swarm,
        router,
        topic,
    } = network;

    let db_pool_clone = db_pool.clone();
    let state_clone_for_aep = app_state.clone();
    let app_for_emit = app.clone();
    let local_peer_id_str = state_clone_for_aep.identity.peer_id().to_base58();
    let topic_task = topic.clone();
    let shared_swarm_task = shared_swarm.clone();
    let outbox_task = outbox.clone();
    let router_task = router.clone();
    let event_tx = event_tx;

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
        loop {
            tokio::select! {
                maybe = net_rx.recv() => {
                    if let Some(data) = maybe {
                        let mut swarm = shared_swarm_task.lock().await;
                        if network::has_any_peers(&swarm) {
                            let mut router_guard = router_task.lock().await;
                            if let Err(e) =
                                network::send_data(&mut swarm, &topic_task, &mut router_guard, data).await
                            {
                                eprintln!("Failed to send data over network: {}", e);
                            }
                        } else {
                            drop(swarm);
                            let mut queue = outbox_task.lock().await;
                            queue.push_back(data);
                            if queue.len() > MAX_OUTBOX_MESSAGES {
                                queue.pop_front();
                            }
                        }
                    }
                }
                file_cmd = file_rx.recv() => {
                    if let Some(cmd) = file_cmd {
                        match cmd {
                            aegis_shared_types::FileTransferCommand::Send { recipient_peer_id, path, mode } => {
                                if let Ok(peer) = recipient_peer_id.parse::<libp2p::PeerId>() {
                                    let file_path = PathBuf::from(&path);
                                    if let Ok(mut f) = std::fs::File::open(&file_path) {
                                        let filename = file_path
                                            .file_name()
                                            .and_then(|s| s.to_str())
                                            .unwrap_or("file")
                                            .to_string();
                                        let safe_filename = sanitize_filename(&filename);
                                        let size = std::fs::metadata(&file_path)
                                            .map(|m| m.len())
                                            .unwrap_or(0);

                                        let mut swarm = shared_swarm_task.lock().await;
                                        let _ = swarm.behaviour_mut().req_res.send_request(
                                            &peer,
                                            network::FileTransferRequest::Init {
                                                filename: filename.clone(),
                                                size,
                                            },
                                        );
                                        drop(swarm);

                                        let mode_label = mode_to_str(mode);
                                        let mut buf = vec![0u8; DEFAULT_CHUNK_SIZE];
                                        let mut index: u64 = 0;
                                        let mut bytes_sent: u64 = 0;
                                        let mut resumed = false;
                                        let mut metadata = super::super::OutgoingResilientMetadata {
                                            next_index: 0,
                                            bytes_sent: 0,
                                            chunk_size: DEFAULT_CHUNK_SIZE,
                                            file_size: size,
                                            safe_filename: safe_filename.clone(),
                                        };
                                        let mut meta_path: Option<PathBuf> = None;

                                        if mode == FileTransferMode::Resilient {
                                            let base_dir = state_clone_for_aep
                                                .app_data_dir
                                                .join(super::super::OUTGOING_STATE_DIR)
                                                .join(&recipient_peer_id);
                                            if let Err(e) = std::fs::create_dir_all(&base_dir) {
                                                eprintln!(
                                                    "Failed to create resilient transfer directory: {}",
                                                    e
                                                );
                                            }
                                            let candidate_meta = base_dir.join(format!("{}.json", safe_filename));
                                            meta_path = Some(candidate_meta.clone());
                                            if candidate_meta.exists() {
                                                match load_outgoing_metadata(&candidate_meta) {
                                                    Ok(existing) => {
                                                        metadata = super::super::OutgoingResilientMetadata {
                                                            next_index: existing.next_index,
                                                            bytes_sent: existing.bytes_sent,
                                                            chunk_size: if existing.chunk_size == 0 {
                                                                DEFAULT_CHUNK_SIZE
                                                            } else {
                                                                existing.chunk_size
                                                            },
                                                            file_size: size,
                                                            safe_filename: safe_filename.clone(),
                                                        };
                                                        index = metadata.next_index;
                                                        bytes_sent = metadata.bytes_sent.min(size);
                                                        if index > 0 {
                                                            let seek_to = index.saturating_mul(DEFAULT_CHUNK_SIZE as u64);
                                                            if let Err(e) = f.seek(std::io::SeekFrom::Start(seek_to)) {
                                                                eprintln!("Failed to seek file for resume: {}", e);
                                                                index = 0;
                                                                bytes_sent = 0;
                                                                metadata.next_index = 0;
                                                                metadata.bytes_sent = 0;
                                                            } else {
                                                                resumed = true;
                                                            }
                                                        }
                                                    }
                                                    Err(e) => {
                                                        eprintln!(
                                                            "Failed to load outgoing transfer metadata: {}",
                                                            e
                                                        );
                                                    }
                                                }
                                            }
                                            if let Some(path) = meta_path.as_ref() {
                                                if let Err(e) = persist_outgoing_metadata(path, &metadata) {
                                                    eprintln!(
                                                        "Failed to persist outgoing metadata: {}",
                                                        e
                                                    );
                                                }
                                            }
                                        }

                                        let initial_status = if resumed { "resuming" } else { "transferring" };
                                        let initial_progress = if size == 0 {
                                            1.0
                                        } else if bytes_sent == 0 {
                                            0.0
                                        } else {
                                            (bytes_sent as f64 / size as f64).min(1.0)
                                        };
                                        let _ = app_for_emit.emit(
                                            "file-transfer-progress",
                                            serde_json::json!({
                                                "direction": "outgoing",
                                                "peer_id": recipient_peer_id,
                                                "filename": filename.clone(),
                                                "safe_filename": safe_filename.clone(),
                                                "mode": mode_label,
                                                "status": initial_status,
                                                "progress": initial_progress,
                                                "resumed": resumed,
                                                "size": size,
                                            }),
                                        );
                                        if size == 0 {
                                            let mut swarm = shared_swarm_task.lock().await;
                                            let _ = swarm.behaviour_mut().req_res.send_request(
                                                &peer,
                                                network::FileTransferRequest::Complete {
                                                    filename: filename.clone(),
                                                },
                                            );
                                            drop(swarm);
                                            if let Some(path) = meta_path.as_ref() {
                                                let _ = std::fs::remove_file(path);
                                            }
                                            let _ = app_for_emit.emit(
                                                "file-transfer-progress",
                                                serde_json::json!({
                                                    "direction": "outgoing",
                                                    "peer_id": recipient_peer_id,
                                                    "filename": filename.clone(),
                                                    "safe_filename": safe_filename.clone(),
                                                    "mode": mode_label,
                                                    "status": "complete",
                                                    "progress": 1.0,
                                                    "resumed": false,
                                                    "size": size,
                                                }),
                                            );
                                            continue;
                                        }

                                        let mut completed = false;
                                        loop {
                                            let n = match f.read(&mut buf) {
                                                Ok(n) => n,
                                                Err(e) => {
                                                    eprintln!("Failed to read file chunk: {}", e);
                                                    0
                                                }
                                            };
                                            if n == 0 {
                                                break;
                                            }
                                            let chunk = buf[..n].to_vec();
                                            let mut swarm = shared_swarm_task.lock().await;
                                            let _request_id = swarm.behaviour_mut().req_res.send_request(
                                                &peer,
                                                network::FileTransferRequest::Chunk {
                                                    filename: filename.clone(),
                                                    index,
                                                    data: chunk,
                                                },
                                            );
                                            drop(swarm);
                                            bytes_sent = bytes_sent.saturating_add(n as u64);
                                            if let Some(path) = meta_path.as_ref() {
                                                metadata.next_index = index + 1;
                                                metadata.bytes_sent = bytes_sent;
                                                metadata.chunk_size = DEFAULT_CHUNK_SIZE;
                                                metadata.file_size = size;
                                                if let Err(e) = persist_outgoing_metadata(path, &metadata) {
                                                    eprintln!(
                                                        "Failed to update outgoing metadata: {}",
                                                        e
                                                    );
                                                }
                                            }
                                            let progress = if size == 0 {
                                                1.0
                                            } else {
                                                (bytes_sent as f64 / size as f64).min(1.0)
                                            };
                                            let _ = app_for_emit.emit(
                                                "file-transfer-progress",
                                                serde_json::json!({
                                                    "direction": "outgoing",
                                                    "peer_id": recipient_peer_id,
                                                    "filename": filename.clone(),
                                                    "safe_filename": safe_filename.clone(),
                                                    "mode": mode_label,
                                                    "status": "transferring",
                                                    "progress": progress,
                                                    "resumed": false,
                                                    "size": size,
                                                }),
                                            );
                                            index += 1;
                                        }

                                        if bytes_sent >= size {
                                            completed = true;
                                        }

                                        if completed {
                                            let mut swarm = shared_swarm_task.lock().await;
                                            let _ = swarm.behaviour_mut().req_res.send_request(
                                                &peer,
                                                network::FileTransferRequest::Complete {
                                                    filename: filename.clone(),
                                                },
                                            );
                                            drop(swarm);
                                            if let Some(path) = meta_path.as_ref() {
                                                let _ = std::fs::remove_file(path);
                                            }
                                            let _ = app_for_emit.emit(
                                                "file-transfer-progress",
                                                serde_json::json!({
                                                    "direction": "outgoing",
                                                    "peer_id": recipient_peer_id,
                                                    "filename": filename.clone(),
                                                    "safe_filename": safe_filename.clone(),
                                                    "mode": mode_label,
                                                    "status": "complete",
                                                    "progress": 1.0,
                                                    "resumed": false,
                                                    "size": size,
                                                }),
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                event = async {
                    let mut guard = shared_swarm_task.lock().await;
                    guard.select_next_some().await
                } => {
                    match event {
                        SwarmEvent::NewListenAddr { .. } => {}
                        SwarmEvent::Behaviour(network::ComposedEvent::Gossipsub(g_event)) => {
                            if let libp2p::gossipsub::GossipsubEvent::Message { propagation_source, message, .. } = g_event {
                                if message.topic == topic_task.hash() {
                                    {
                                        let mut router_guard = router_task.lock().await;
                                        router_guard.observe_peer(propagation_source.clone());
                                    }
                                    let payload_opt = match bincode::deserialize::<network::RoutedFrame>(&message.data) {
                                        Ok(network::RoutedFrame::Broadcast { origin, payload }) => {
                                            if let Ok(origin_peer) = libp2p::PeerId::from_str(&origin) {
                                                let mut router_guard = router_task.lock().await;
                                                router_guard.observe_peer(origin_peer);
                                            }
                                            Some(payload)
                                        }
                                        Ok(network::RoutedFrame::Routed { envelope }) => {
                                            let local_peer_id = state_clone_for_aep.identity.peer_id().clone();
                                            let path_peers: Vec<libp2p::PeerId> = envelope
                                                .path
                                                .iter()
                                                .filter_map(|value| libp2p::PeerId::from_str(value).ok())
                                                .collect();
                                            {
                                                let mut router_guard = router_task.lock().await;
                                                for peer in &path_peers {
                                                    router_guard.observe_peer(peer.clone());
                                                }
                                            }
                                            if envelope.destination != local_peer_id_str {
                                                let next_hop = path_peers
                                                    .iter()
                                                    .position(|peer| peer == &local_peer_id)
                                                    .and_then(|idx| path_peers.get(idx + 1).cloned());
                                                if let Some(next_peer) = next_hop {
                                                    if bridge_can_forward_to(&next_peer).await {
                                                        note_bridge_forward_attempt().await;
                                                        let mut failure: Option<String> = None;
                                                        let frame = network::RoutedFrame::Routed {
                                                            envelope: envelope.clone(),
                                                        };
                                                        match bincode::serialize(&frame) {
                                                            Ok(bytes) => {
                                                                let publish_outcome = {
                                                                    let mut swarm_guard =
                                                                        shared_swarm_task.lock().await;
                                                                    swarm_guard
                                                                        .behaviour_mut()
                                                                        .gossipsub
                                                                        .publish(topic_task.clone(), bytes)
                                                                };

                                                                match publish_outcome {
                                                                    Ok(_) => {
                                                                        note_bridge_forward_success()
                                                                            .await;
                                                                        if let Err(err) =
                                                                            emit_bridge_snapshot(&app_for_emit)
                                                                                .await
                                                                        {
                                                                            eprintln!(
                                                                                "Failed to emit bridge snapshot: {}",
                                                                                err
                                                                            );
                                                                        }
                                                                    }
                                                                    Err(error) => {
                                                                        failure = Some(format!(
                                                                            "Forwarding to {} failed: {}",
                                                                            next_peer.to_base58(),
                                                                            error
                                                                        ));
                                                                    }
                                                                }
                                                            }
                                                            Err(error) => {
                                                                failure = Some(format!(
                                                                    "Forwarding serialization failed: {}",
                                                                    error
                                                                ));
                                                            }
                                                        }

                                                        if let Some(message) = failure {
                                                            note_bridge_forward_failure(
                                                                message.clone(),
                                                            )
                                                            .await;
                                                            if let Err(err) =
                                                                emit_bridge_snapshot(&app_for_emit)
                                                                    .await
                                                            {
                                                                eprintln!(
                                                                    "Failed to emit bridge snapshot: {}",
                                                                    err
                                                                );
                                                            }
                                                            eprintln!("{}", message);
                                                        }
                                                    }
                                                }
                                                continue;
                                            }
                                            {
                                                let mut router_guard = router_task.lock().await;
                                                if !path_peers.is_empty() {
                                                    router_guard.record_route_success(
                                                        &path_peers,
                                                        Some(envelope.metrics.total_latency_ms),
                                                    );
                                                }
                                            }
                                            Some(envelope.payload.clone())
                                        }
                                        Err(_) => Some(message.data.clone()),
                                    };
                                    if let Some(payload_bytes) = payload_opt {
                                        match bincode::deserialize::<AepMessage>(&payload_bytes) {
                                            Ok(aep_message) => {
                                                match aep_message.clone() {
                                                AepMessage::FileTransferRequest { .. } => {}
                                                AepMessage::FileTransferChunk { .. } => {}
                                                AepMessage::FileTransferComplete { .. } => {}
                                                AepMessage::PrekeyBundle { user_id, bundle, signature } => {
                                                    if let Ok(Some(user)) = aep::user_service::get_user(&db_pool_clone, &user_id).await {
                                                        if let Some(pk_b58) = user.public_key {
                                                            if let Ok(bytes) = bs58::decode(pk_b58).into_vec() {
                                                                if let Ok(public_key) = libp2p::identity::PublicKey::from_protobuf_encoding(&bytes) {
                                                                    let ok_sig = signature.as_ref().map(|sig| public_key.verify(&bundle, sig)).unwrap_or(false);
                                                                    if ok_sig {
                                                                        if let Ok(bundle_obj) = bincode::deserialize::<e2ee::PrekeyBundle>(&bundle) {
                                                                            let arc = e2ee::init_global_manager();
                                                                            {
                                                                                let mut mgr = arc.lock();
                   let _ = mgr.add_remote_bundle(&user_id, bundle_obj);
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                                AepMessage::EncryptedChatMessage { sender, recipient, init, enc_header, enc_content, signature } => {
                                                    let ok_sig = (|| {
                                                        let user_opt = futures::executor::block_on(aep::user_service::get_user(&db_pool_clone, &sender)).ok()?;
                                                        let user = user_opt?;
                                                        let pk_b58 = user.public_key?;
                                                        let bytes = bs58::decode(pk_b58).into_vec().ok()?;
                                                        let public_key = libp2p::identity::PublicKey::from_protobuf_encoding(&bytes).ok()?;
                                                        let payload = bincode::serialize(&(sender.clone(), recipient.clone(), &enc_header, &enc_content)).ok()?;
                                                        let sig = signature.as_ref()?;
                                                        Some(public_key.verify(&payload, sig))
                                                    })().unwrap_or(false);
                                                    if ok_sig {
                                                        let my_id = state_clone_for_aep.identity.peer_id().to_base58();
                                                        if recipient == my_id {
                                                            let plaintext_opt = {
                                                                let arc = e2ee::init_global_manager();
                                                                let mut mgr = arc.lock();
                                                                let packet = e2ee::EncryptedPacket { init, enc_header, enc_content };
                                                                mgr.decrypt_from(&sender, &packet).ok()
                                                            };
                                                            if let Some(plaintext) = plaintext_opt {
                                                                let chat_id = sender.clone();
                                                                let message_id = Scu128::new().to_string();
                                                                let timestamp = chrono::Utc::now();
                                                                let mut db_attachments = Vec::new();
                                                                let mut attachment_data = Vec::new();
                                                                let (content, reply_to_message_id, reply_snapshot_author, reply_snapshot_snippet) =
                                                                    if let Ok(payload) = bincode::deserialize::<crate::commands::messages::EncryptedDmPayload>(&plaintext) {
                                                                        for descriptor in payload.attachments.into_iter() {
                                                                            if descriptor.data.is_empty() {
                                                                                continue;
                                                                            }
                                                                            let data_len = descriptor.data.len() as u64;
                                                                            let effective_size = if descriptor.size == 0 { data_len } else { descriptor.size };
                                                                            let sanitized_size = if effective_size == data_len {
                                                                                effective_size
                                                                            } else {
                                                                                data_len
                                                                            };
                                                                            let attachment_id = Scu128::new().to_string();
                                                                            let attachment = aep::database::Attachment {
                                                                                id: attachment_id,
                                                                                message_id: message_id.clone(),
                                                                                name: descriptor.name.clone(),
                                                                                content_type: descriptor.content_type.clone(),
                                                                                size: sanitized_size,
                                                                            };
                                                                            db_attachments.push(attachment.clone());
                                                                            attachment_data.push(aep::database::AttachmentWithData {
                                                                                metadata: attachment,
                                                                                data: descriptor.data,
                                                                            });
                                                                        }
                                                                        (
                                                                            payload.content,
                                                                            payload.reply_to_message_id,
                                                                            payload.reply_snapshot_author,
                                                                            payload.reply_snapshot_snippet,
                                                                        )
                                                                    } else {
                                                                        (
                                                                            match String::from_utf8(plaintext.clone()) {
                                                                                Ok(text) => text,
                                                                                Err(_) => String::from_utf8_lossy(&plaintext).to_string(),
                                                                            },
                                                                            None,
                                                                            None,
                                                                            None,
                                                                        )
                                                                    };

                                                                let new_message = aep::database::Message {
                                                                    id: message_id,
                                                                    chat_id,
                                                                    sender_id: sender.clone(),
                                                                    content,
                                                                    timestamp,
                                                                    read: false,
                                                                    pinned: false,
                                                                    attachments: db_attachments,
                                                                    reactions: std::collections::HashMap::new(),
                                                                    reply_to_message_id,
                                                                    reply_snapshot_author,
                                                                    reply_snapshot_snippet,
                                                                    edited_at: None,
                                                                    edited_by: None,
                                                                    expires_at: None,
                                                                };
                                                                if let Err(e) = aep::database::insert_message(&db_pool_clone, &new_message, &attachment_data).await { eprintln!("DB insert error: {}", e); }
                                                            }
                                                        }
                                                    }
                                                }
                                                AepMessage::GroupKeyUpdate { server_id, channel_id, epoch, slots, signature } => {
                                                    let issuer_id = propagation_source.to_base58();
                                                    let ok_sig = (|| {
                                                        let user_opt = futures::executor::block_on(aep::user_service::get_user(&db_pool_clone, &issuer_id)).ok()?;
                                                        let user = user_opt?;
                                                        let pk_b58 = user.public_key?;
                                                        let bytes = bs58::decode(pk_b58).into_vec().ok()?;
                                                        let public_key = libp2p::identity::PublicKey::from_protobuf_encoding(&bytes).ok()?;
                                                        let payload = bincode::serialize(&(issuer_id.clone(), &server_id, &channel_id, epoch, &slots)).ok()?;
                                                        let sig = signature.as_ref()?;
                                                        Some(public_key.verify(&payload, sig))
                                                    })().unwrap_or(false);
                                                    if !ok_sig {
                                                        eprintln!("Invalid signature on group key update from {issuer_id}");
                                                        continue;
                                                    }
                                                    let my_id = state_clone_for_aep.identity.peer_id().to_base58();
                                                    if let Some(slot) = slots.into_iter().find(|s| s.recipient == my_id) {
                                                        let arc = e2ee::init_global_manager();
                                                        let mut mgr = arc.lock();
                                                        let packet = e2ee::EncryptedPacket { init: slot.init, enc_header: slot.enc_header, enc_content: slot.enc_content };
                                                        match mgr.decrypt_from(&my_id, &packet) {
                                                            Ok(key_bytes) => {
                                                                mgr.set_group_key(&server_id, &channel_id, epoch, &key_bytes);
                                                            }
                                                            Err(e) => eprintln!("Failed to decrypt group key for {}: {}", my_id, e),
                                                        }
                                                    }
                                                }
                                                AepMessage::ReadReceipt { chat_id, message_id, reader_id, timestamp, signature } => {
                                                    let signature = match signature {
                                                        Some(sig) => sig,
                                                        None => {
                                                            eprintln!(
                                                                "Missing signature for read receipt from {}",
                                                                reader_id
                                                            );
                                                            continue;
                                                        }
                                                    };

                                                    let receipt = ReadReceiptData {
                                                        chat_id: chat_id.clone(),
                                                        message_id: message_id.clone(),
                                                        reader_id: reader_id.clone(),
                                                        timestamp: timestamp.clone(),
                                                    };

                                                    let payload_bytes = match bincode::serialize(&receipt) {
                                                        Ok(bytes) => bytes,
                                                        Err(err) => {
                                                            eprintln!(
                                                                "Failed to serialize read receipt for {}: {}",
                                                                message_id, err
                                                            );
                                                            continue;
                                                        }
                                                    };

                                                    let verified = if let Ok(Some(user)) =
                                                        aep::user_service::get_user(&db_pool_clone, &reader_id).await
                                                    {
                                                        if let Some(pk_b58) = user.public_key {
                                                            if let Ok(bytes) = bs58::decode(pk_b58).into_vec() {
                                                                if let Ok(public_key) = libp2p::identity::PublicKey::from_protobuf_encoding(&bytes) {
                                                                    public_key.verify(&payload_bytes, &signature)
                                                                } else {
                                                                    false
                                                                }
                                                            } else {
                                                                false
                                                            }
                                                        } else {
                                                            false
                                                        }
                                                    } else {
                                                        false
                                                    };

                                                    if !verified {
                                                        eprintln!(
                                                            "Invalid signature for read receipt {} in chat {}",
                                                            message_id, chat_id
                                                        );
                                                        continue;
                                                    }

                                                    if let Err(err) = aep::database::mark_message_as_read(&db_pool_clone, &message_id).await {
                                                        eprintln!(
                                                            "Failed to mark message {} as read: {}",
                                                            message_id, err
                                                        );
                                                    }

                                                    let timestamp_str = timestamp.to_rfc3339();
                                                    let payload = crate::commands::messages::ReadReceiptEventPayload {
                                                        chat_id,
                                                        message_id,
                                                        reader_id,
                                                        timestamp: timestamp_str,
                                                    };
                                                    if let Err(err) = app_for_emit.emit("message-read", payload) {
                                                        eprintln!("Failed to emit message-read event: {}", err);
                                                    }
                                                }
                                                AepMessage::TypingIndicator { chat_id, user_id, is_typing, timestamp, signature } => {
                                                    let signature = match signature {
                                                        Some(sig) => sig,
                                                        None => {
                                                            eprintln!(
                                                                "Missing signature for typing indicator from {}",
                                                                user_id
                                                            );
                                                            continue;
                                                        }
                                                    };

                                                    let indicator = TypingIndicatorData {
                                                        chat_id: chat_id.clone(),
                                                        user_id: user_id.clone(),
                                                        is_typing,
                                                        timestamp: timestamp.clone(),
                                                    };

                                                    let payload_bytes = match bincode::serialize(&indicator) {
                                                        Ok(bytes) => bytes,
                                                        Err(err) => {
                                                            eprintln!(
                                                                "Failed to serialize typing indicator for chat {}: {}",
                                                                chat_id, err
                                                            );
                                                            continue;
                                                        }
                                                    };

                                                    let verified = if let Ok(Some(user)) =
                                                        aep::user_service::get_user(&db_pool_clone, &user_id).await
                                                    {
                                                        if let Some(pk_b58) = user.public_key {
                                                            if let Ok(bytes) = bs58::decode(pk_b58).into_vec() {
                                                                if let Ok(public_key) = libp2p::identity::PublicKey::from_protobuf_encoding(&bytes) {
                                                                    public_key.verify(&payload_bytes, &signature)
                                                                } else {
                                                                    false
                                                                }
                                                            } else {
                                                                false
                                                            }
                                                        } else {
                                                            false
                                                        }
                                                    } else {
                                                        false
                                                    };

                                                    if !verified {
                                                        eprintln!(
                                                            "Invalid signature for typing indicator in chat {} from {}",
                                                            chat_id, user_id
                                                        );
                                                        continue;
                                                    }

                                                    if let Err(err) = aep::database::upsert_typing_indicator(
                                                        &db_pool_clone,
                                                        &chat_id,
                                                        &user_id,
                                                        is_typing,
                                                        timestamp.clone(),
                                                    )
                                                    .await
                                                    {
                                                        eprintln!(
                                                            "Failed to persist typing indicator for chat {}: {}",
                                                            chat_id, err
                                                        );
                                                    }

                                                    let timestamp_str = timestamp.to_rfc3339();
                                                    let payload = crate::commands::messages::TypingIndicatorEventPayload {
                                                        chat_id,
                                                        user_id,
                                                        is_typing,
                                                        timestamp: timestamp_str,
                                                    };
                                                    if let Err(err) = app_for_emit.emit("typing-indicator", payload) {
                                                        eprintln!("Failed to emit typing-indicator event: {}", err);
                                                    }
                                                }
                                                AepMessage::EncryptedGroupMessage { sender, server_id, channel_id, epoch, nonce, ciphertext, signature } => {
                                                    let ok_sig = (|| {
                                                        let user_opt = futures::executor::block_on(aep::user_service::get_user(&db_pool_clone, &sender)).ok()?;
                                                        let user = user_opt?;
                                                        let pk_b58 = user.public_key?;
                                                        let bytes = bs58::decode(pk_b58).into_vec().ok()?;
                                                        let public_key = libp2p::identity::PublicKey::from_protobuf_encoding(&bytes).ok()?;
                                                        let payload = bincode::serialize(&(sender.clone(), &server_id, &channel_id, epoch, &nonce, &ciphertext)).ok()?;
                                                        let sig = signature.as_ref()?;
                                                        Some(public_key.verify(&payload, sig))
                                                    })().unwrap_or(false);
                                                    if ok_sig {
                                                        let plaintext_opt = {
                                                            let arc = e2ee::init_global_manager();
                                                            let mut mgr = arc.lock();
                                                            mgr.decrypt_group_message(&server_id, &channel_id, &ciphertext).ok()
                                                        };
                                                        if let Some(plaintext) = plaintext_opt {
                                                            let chat_id = channel_id.clone().unwrap_or_else(|| server_id.clone());
                                                            let (content, reply_to_message_id, reply_snapshot_author, reply_snapshot_snippet) =
                                                                if let Ok(payload) = bincode::deserialize::<crate::commands::messages::EncryptedDmPayload>(&plaintext) {
                                                                    (
                                                                        payload.content,
                                                                        payload.reply_to_message_id,
                                                                        payload.reply_snapshot_author,
                                                                        payload.reply_snapshot_snippet,
                                                                    )
                                                                } else {
                                                                    (
                                                                        String::from_utf8_lossy(&plaintext).to_string(),
                                                                        None,
                                                                        None,
                                                                        None,
                                                                    )
                                                                };
                                                                let new_message = aep::database::Message {
                                                                    id: Scu128::new().to_string(),
                                                                    chat_id,
                                                                    sender_id: sender.clone(),
                                                                    content,
                                                                    timestamp: chrono::Utc::now(),
                                                                    read: false,
                                                                    pinned: false,
                                                                    attachments: Vec::new(),
                                                                    reactions: std::collections::HashMap::new(),
                                                                    reply_to_message_id,
                                                                    reply_snapshot_author,
                                                                    reply_snapshot_snippet,
                                                                    edited_at: None,
                                                                    edited_by: None,
                                                                    expires_at: None,
                                                                };
                                                            if let Err(e) = aep::database::insert_message(&db_pool_clone, &new_message, &[]).await { eprintln!("DB insert error: {}", e); }
                                                        }
                                                    }
                                                }
                                                AepMessage::CallSignal { sender_id, recipient_id, call_id, signal } => {
                                                    let my_id = state_clone_for_aep.identity.peer_id().to_base58();
                                                    if recipient_id == my_id {
                                                        if let Err(e) = app_for_emit.emit(
                                                            "call-signal",
                                                            serde_json::json!({
                                                                "senderId": sender_id,
                                                                "callId": call_id,
                                                                "signal": signal,
                                                            }),
                                                        ) {
                                                            eprintln!("Failed to emit call-signal event: {}", e);
                                                        }
                                                    }
                                                }
                                                _ => {
                                                    if let Err(e) = aep::handle_aep_message(
                                                        aep_message.clone(),
                                                        &db_pool_clone,
                                                        state_clone_for_aep.clone(),
                                                    ).await {
                                                        eprintln!("Error handling AEP message: {}", e);
                                                    }
                                                }
                                            }
                                            if let Err(e) = event_tx.send(aep_message.clone()).await {
                                                eprintln!("Failed to send message to frontend channel: {}", e);
                                            }
                                            if let Err(e) = app_for_emit.emit("new-message", aep_message) {
                                                eprintln!("Failed to emit new-message event: {}", e);
                                            }
                                        }
                                        Err(e) => eprintln!("Failed to deserialize AepMessage: {}", e),
                                    }
                                }
                                }
                            }
                        }
                        SwarmEvent::Behaviour(network::ComposedEvent::Mdns(event)) => {
                            match event {
                                libp2p::mdns::MdnsEvent::Discovered(list) => {
                                    let local_peer = state_clone_for_aep.identity.peer_id();
                                    let mut addresses = Vec::new();
                                    {
                                        let mut router_guard = router_task.lock().await;
                                        for (peer_id, addr) in list {
                                            router_guard.observe_peer(peer_id.clone());
                                            router_guard.observe_direct_link(
                                                local_peer.clone(),
                                                peer_id,
                                                network::LinkQuality::default(),
                                            );
                                            addresses.push(addr);
                                        }
                                    }

                                    let mut swarm = shared_swarm_task.lock().await;
                                    for addr in addresses {
                                        let _ = libp2p::swarm::Swarm::dial_addr(&mut *swarm, addr);
                                    }
                                }
                                libp2p::mdns::MdnsEvent::Expired(list) => {
                                    let mut router_guard = router_task.lock().await;
                                    for (peer_id, _) in list {
                                        router_guard.remove_peer(&peer_id);
                                    }
                                }
                            }
                        }
                        SwarmEvent::Behaviour(network::ComposedEvent::ReqRes(event)) => {
                            match event {
                                libp2p::request_response::RequestResponseEvent::Message { peer, message } => {
                                    match message {
                                        libp2p::request_response::RequestResponseMessage::Request { request, channel, .. } => {
                                            let sender_id = peer.to_base58();
                                            match request {
                                                network::FileTransferRequest::Init { filename, size } => {
                                                    let my_id = state_clone_for_aep.identity.peer_id().to_base58();
                                                    let policy = { state_clone_for_aep.file_acl_policy.lock().await.clone() };
                                                    let allowed = match policy {
                                                        aegis_shared_types::FileAclPolicy::Everyone => true,
                                                        aegis_shared_types::FileAclPolicy::FriendsOnly => {
                                                            match aep::database::get_friendship(&db_pool_clone, &my_id, &sender_id).await {
                                                                Ok(Some(fr)) => fr.status == "accepted",
                                                                _ => false,
                                                            }
                                                        }
                                                    };
                                                    if !allowed {
                                                        let mut swarm = shared_swarm_task.lock().await;
                                                        let _ = swarm.behaviour_mut().req_res.send_response(channel, network::FileTransferResponse::Error("Not authorized".into()));
                                                    } else {
                                                        let key = format!("{}:{}", sender_id, filename);
                                                        let safe_name = sanitize_filename(&filename);
                                                        if size > MAX_FILE_SIZE_BYTES {
                                                            let mut swarm = shared_swarm_task.lock().await;
                                                            let _ = swarm.behaviour_mut().req_res.send_response(channel, network::FileTransferResponse::Error("File too large".into()));
                                                            continue;
                                                        }
                                                        let mut inc = state_clone_for_aep.incoming_files.lock().await;
                                                        inc.insert(key.clone(), aegis_shared_types::IncomingFile {
                                                            name: filename.clone(),
                                                            size,
                                                            received_chunks: std::collections::HashMap::new(),
                                                            key: vec![],
                                                            nonce: vec![],
                                                            sender_id: sender_id.clone(),
                                                            accepted: false,
                                                            mode: FileTransferMode::Basic,
                                                            staging_path: None,
                                                            metadata_path: None,
                                                            resumed: false,
                                                        });
                                                        drop(inc);
                                                        let _ = app_for_emit.emit("file-transfer-request", serde_json::json!({
                                                            "sender_id": sender_id,
                                                            "filename": filename,
                                                            "safe_filename": safe_name,
                                                            "size": size
                                                        }));
                                                        let mut swarm = shared_swarm_task.lock().await;
                                                        let _ = swarm.behaviour_mut().req_res.send_response(channel, network::FileTransferResponse::Ack);
                                                    }
                                                }
                                                network::FileTransferRequest::Chunk { filename, index, data } => {
                                                    let key = format!("{}:{}", sender_id, filename);
                                                    let mut inc = state_clone_for_aep.incoming_files.lock().await;
                                                    if let Some(mut file) = inc.remove(&key) {
                                                        let chunk_len = data.len() as u64;
                                                        let replaced_bytes = file
                                                            .received_chunks
                                                            .get(&index)
                                                            .map(|chunk| chunk.len() as u64)
                                                            .unwrap_or(0);
                    let current_total: u64 = file.received_chunks.values().map(|chunk| chunk.len() as u64).sum();
                    let adjusted_total = current_total.saturating_sub(replaced_bytes);
                    let new_total = adjusted_total.saturating_add(chunk_len);
                                                        let inflight_limit = MAX_INFLIGHT_FILE_BYTES.min(file.size);
                                                        let mut error_reason: Option<(&str, bool)> = None;
                                                        if new_total > file.size {
                                                            error_reason = Some(("Size mismatch", false));
                                                        } else if new_total > inflight_limit {
                                                            error_reason = Some(("Transfer too large", false));
                                                        } else if !file.accepted {
                                                            let unapproved_limit = MAX_UNAPPROVED_BUFFER_BYTES.min(inflight_limit);
                                                            if new_total > unapproved_limit {
                                                                error_reason = Some(("Pending approval", true));
                                                            }
                                                        }
                                                        if let Some((reason, notify)) = error_reason {
                                                            let original_name = file.name.clone();
                                                            let safe_name = sanitize_filename(&file.name);
                                                            drop(inc);
                                                            if notify {
                                                                let _ = app_for_emit.emit("file-transfer-denied", serde_json::json!({
                                                                    "sender_id": sender_id,
                                                                    "filename": original_name,
                                                                    "safe_filename": safe_name
                                                                }));
                                                            }
                                                            let mut swarm = shared_swarm_task.lock().await;
                                                            let _ = swarm.behaviour_mut().req_res.send_response(channel, network::FileTransferResponse::Error(reason.into()));
                                                            continue;
                                                        }

                                                        let safe_name = sanitize_filename(&file.name);
                                                        let mode_label = mode_to_str(file.mode);
                                                        let resumed_flag = file.resumed || replaced_bytes > 0;

                                                        if file.mode == FileTransferMode::Resilient {
                                                            if let Some(staging_path) = file.staging_path.clone() {
                                                                if let Err(e) = write_incoming_chunk(&staging_path, index, &data) {
                                                                    eprintln!("Failed to persist incoming chunk: {}", e);
                                                                }
                                                            }
                                                            if let Some(meta_path) = file.metadata_path.clone() {
                                                                let mut metadata = if meta_path.exists() {
                                                                    match std::fs::read(&meta_path) {
                                                                        Ok(bytes) => serde_json::from_slice::<super::super::IncomingResilientMetadata>(&bytes)
                                                                            .unwrap_or_else(|_| super::super::IncomingResilientMetadata::default()),
                                                                        Err(_) => super::super::IncomingResilientMetadata::default(),
                                                                    }
                                                                } else {
                                                                    super::super::IncomingResilientMetadata::default()
                                                                };
                                                                metadata.file_size = file.size;
                                                                metadata.chunk_size = DEFAULT_CHUNK_SIZE;
                                                                metadata.safe_filename = safe_name.clone();
                                                                metadata.chunks.insert(index, data.len());
                                                                if let Err(e) = persist_incoming_metadata(&meta_path, &metadata) {
                                                                    eprintln!("Failed to persist incoming metadata: {}", e);
                                                                }
                                                            }
                                                        }

                                                        file.received_chunks.insert(index, data);
                                                        let progress = if file.size == 0 {
                                                            1.0
                                                        } else {
                                                            (new_total as f64 / file.size as f64).min(1.0)
                                                        };
                                                        file.resumed = false;
                                                        let total_size = file.size;
                                                        inc.insert(key, file);
                                                        drop(inc);
                                                        let mut swarm = shared_swarm_task.lock().await;
                                                        let _ = swarm.behaviour_mut().req_res.send_response(channel, network::FileTransferResponse::Ack);
                                                        drop(swarm);
                                                        let status = if resumed_flag {
                                                            "resuming"
                                                        } else {
                                                            "transferring"
                                                        };
                                                        let _ = app_for_emit.emit(
                                                            "file-transfer-progress",
                                                            serde_json::json!({
                                                                "direction": "incoming",
                                                                "peer_id": sender_id.clone(),
                                                                "filename": filename,
                                                                "safe_filename": safe_name,
                                                                "mode": mode_label,
                                                                "status": status,
                                                                "progress": progress,
                                                                "resumed": resumed_flag,
                                                                "size": total_size,
                                                            }),
                                                        );
                                                    } else {
                                                        drop(inc);
                                                        let mut swarm = shared_swarm_task.lock().await;
                                                        let _ = swarm.behaviour_mut().req_res.send_response(channel, network::FileTransferResponse::Error("Unknown transfer".into()));
                                                    }
                                                }
                                                network::FileTransferRequest::Complete { filename } => {
                                                    let key = format!("{}:{}", sender_id, filename);
                                                    let mut inc = state_clone_for_aep.incoming_files.lock().await;
                                                    if let Some(file) = inc.remove(&key) {
                                                        drop(inc);
                                                        let safe_name = sanitize_filename(&file.name);
                                                        if file.accepted {
                                                            if let Ok(dir) = app_for_emit.path().app_data_dir() {
                                                                let output_path = dir.join(&safe_name);
                                                                if let Ok(mut f) = std::fs::File::create(&output_path) {
                                                                    let mut idx = 0u64;
                                                                    while let Some(chunk) = file.received_chunks.get(&idx) {
                                                                        let _ = f.write_all(chunk);
                                                                        idx += 1;
                                                                    }
                                                                    let total_bytes: u64 = file
                                                                        .received_chunks
                                                                        .values()
                                                                        .map(|chunk| chunk.len() as u64)
                                                                        .sum();
                                                                    if total_bytes != file.size {
                                                                        eprintln!("Received {} bytes for {} but expected {}", total_bytes, safe_name, file.size);
                                                                    }
                                                                    let _ = app_for_emit.emit("file-received", serde_json::json!({
                                                                        "sender_id": sender_id,
                                                                        "filename": file.name.clone(),
                                                                        "safe_filename": safe_name.clone(),
                                                                        "path": output_path.to_string_lossy().to_string()
                                                                    }));
                                                                } else {
                                                                    eprintln!("Failed to create file for received transfer {}", safe_name);
                                                                }
                                                            }
                                                            cleanup_incoming_state(&file.staging_path, &file.metadata_path);
                                                            let mut swarm = shared_swarm_task.lock().await;
                                                            let _ = swarm.behaviour_mut().req_res.send_response(channel, network::FileTransferResponse::Ack);
                                                            let _ = app_for_emit.emit(
                                                                "file-transfer-progress",
                                                                serde_json::json!({
                                                                    "direction": "incoming",
                                                                    "peer_id": sender_id.clone(),
                                                                    "filename": file.name.clone(),
                                                                    "safe_filename": safe_name.clone(),
                                                                    "mode": mode_to_str(file.mode),
                                                                    "status": "complete",
                                                                    "progress": 1.0,
                                                                    "resumed": false,
                                                                    "size": file.size,
                                                                }),
                                                            );
                                                        } else {
                                                            let _ = app_for_emit.emit("file-transfer-denied", serde_json::json!({
                                                                "sender_id": sender_id,
                                                                "filename": file.name.clone(),
                                                                "safe_filename": safe_name
                                                            }));
                                                            let mut swarm = shared_swarm_task.lock().await;
                                                            let _ = swarm.behaviour_mut().req_res.send_response(channel, network::FileTransferResponse::Error("Denied".into()));
                                                            cleanup_incoming_state(&file.staging_path, &file.metadata_path);
                                                        }
                                                    } else {
                                                        drop(inc);
                                                        let mut swarm = shared_swarm_task.lock().await;
                                                        let _ = swarm.behaviour_mut().req_res.send_response(channel, network::FileTransferResponse::Error("Unknown transfer".into()));
                                                    }
                                                }
                                            }
                                        }
                                        libp2p::request_response::RequestResponseMessage::Response { .. } => {}
                                    }
                                }
                                _ => {}
                            }
                        }
                        _ => {}
                    }
                }
                _ = interval.tick() => {
                    {
                        let guard = shared_swarm_task.lock().await;
                        if !network::has_any_peers(&guard) { continue; }
                    }
                    let mut pending = outbox_task.lock().await;
                    if pending.is_empty() { continue; }
                    let mut swarm = shared_swarm_task.lock().await;
                    let mut router_guard = router_task.lock().await;
                    let mut remaining: Vec<Vec<u8>> = Vec::new();
                    for data in pending.drain(..) {
                        if let Err(e) =
                            network::send_data(&mut swarm, &topic_task, &mut router_guard, data.clone()).await
                        {
                            eprintln!("Failed to flush queued data: {}", e);
                            remaining.push(data);
                        }
                    }
                    pending.extend(remaining);
                }
            }
        }
    });
}
