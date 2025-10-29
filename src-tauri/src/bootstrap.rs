use libp2p::futures::StreamExt;
use libp2p::swarm::SwarmEvent;
use std::collections::{HashMap, VecDeque};
use std::fs::OpenOptions;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{atomic::AtomicBool, Arc};
use tauri::{Emitter, Manager, Runtime, State};
use tokio::sync::{mpsc, Mutex};

use aegis_protocol::{AepMessage, ReadReceiptData, TypingIndicatorData};
use aegis_shared_types::{AppState, FileTransferMode, User};
use aep::{database, handle_aep_message, initialize_aep};
use bs58;
use e2ee;
use network::{has_any_peers, initialize_network, send_data, ComposedEvent};
use tokio::sync::mpsc::Sender as TokioSender;

use crate::commands::messages::{
    EncryptedDmPayload, ReadReceiptEventPayload, TypingIndicatorEventPayload,
};
use crate::connectivity::spawn_connectivity_task;

const MAX_OUTBOX_MESSAGES: usize = 256;
const MAX_FILE_SIZE_BYTES: u64 = 1_073_741_824; // 1 GiB
const MAX_INFLIGHT_FILE_BYTES: u64 = 536_870_912; // 512 MiB
const MAX_UNAPPROVED_BUFFER_BYTES: u64 = 8_388_608; // 8 MiB
const DEFAULT_CHUNK_SIZE: usize = 128 * 1024;
const OUTGOING_STATE_DIR: &str = "outgoing_transfers";
const INCOMING_STATE_DIR: &str = "incoming_transfers";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
struct OutgoingResilientMetadata {
    next_index: u64,
    bytes_sent: u64,
    chunk_size: usize,
    file_size: u64,
    safe_filename: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
struct IncomingResilientMetadata {
    file_size: u64,
    chunk_size: usize,
    chunks: HashMap<u64, usize>,
    safe_filename: String,
}

pub async fn initialize_app_state<R: Runtime>(
    app: tauri::AppHandle<R>,
    password: &str,
    state_container: State<'_, crate::commands::state::AppStateContainer>,
) -> Result<(), String> {
    let identity = crate::commands::identity::get_or_create_identity(&app, password)?;

    initialize_aep();

    let (swarm, topic) = initialize_network(identity.keypair().clone())
        .await
        .map_err(|e| format!("Failed to initialize network: {}", e))?;
    let shared_swarm = Arc::new(Mutex::new(swarm));

    let (net_tx, mut net_rx) = mpsc::channel::<Vec<u8>>(100);
    let (file_tx, mut file_rx) = mpsc::channel::<aegis_shared_types::FileTransferCommand>(16);
    let (event_tx, mut event_rx) = mpsc::channel::<AepMessage>(100);
    let outbox: Arc<Mutex<VecDeque<Vec<u8>>>> = Arc::new(Mutex::new(VecDeque::new()));

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_data_dir.exists() {
        std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
    }
    let incoming_dir = app_data_dir.join(INCOMING_STATE_DIR);
    if !incoming_dir.exists() {
        std::fs::create_dir_all(&incoming_dir).map_err(|e| e.to_string())?;
    }
    let outgoing_dir = app_data_dir.join(OUTGOING_STATE_DIR);
    if !outgoing_dir.exists() {
        std::fs::create_dir_all(&outgoing_dir).map_err(|e| e.to_string())?;
    }
    let settings_path = app_data_dir.join("settings.json");
    let initial_acl = if let Ok(bytes) = std::fs::read(&settings_path) {
        if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            match json.get("file_acl_policy").and_then(|v| v.as_str()) {
                Some("friends_only") => aegis_shared_types::FileAclPolicy::FriendsOnly,
                _ => aegis_shared_types::FileAclPolicy::Everyone,
            }
        } else {
            aegis_shared_types::FileAclPolicy::Everyone
        }
    } else {
        aegis_shared_types::FileAclPolicy::Everyone
    };
    let db_path = app_data_dir.join("aegis.db");
    let db_pool = database::initialize_db(db_path)
        .await
        .map_err(|e| format!("Failed to initialize database: {}", e))?;

    let connectivity_snapshot = Arc::new(Mutex::new(None));

    let new_state = AppState {
        identity: identity.clone(),
        network_tx: net_tx,
        db_pool: db_pool.clone(),
        incoming_files: Arc::new(Mutex::new(HashMap::new())),
        file_cmd_tx: file_tx,
        file_acl_policy: Arc::new(Mutex::new(initial_acl)),
        app_data_dir: app_data_dir.clone(),
        connectivity_snapshot: connectivity_snapshot.clone(),
        voice_memos_enabled: Arc::new(AtomicBool::new(true)),
    };

    *state_container.0.lock().await = Some(new_state.clone());

    spawn_connectivity_task(
        app.clone(),
        shared_swarm.clone(),
        identity.peer_id(),
        connectivity_snapshot,
    );

    let my_peer_id = identity.peer_id().to_base58();
    let my_pubkey_b58 = bs58::encode(identity.public_key_protobuf_bytes()).into_string();
    let anon_username = format!("anon-{}", &my_peer_id.chars().take(8).collect::<String>());
    let mut ensure_user = User {
        id: my_peer_id.clone(),
        username: anon_username.clone(),
        avatar: String::new(),
        is_online: false,
        public_key: Some(my_pubkey_b58.clone()),
        bio: None,
        tag: None,
    };

    if let Ok(existing) = aep::user_service::get_user(&db_pool, &my_peer_id).await {
        match existing {
            Some(mut u) => {
                if u.public_key.as_deref() != Some(&my_pubkey_b58) {
                    u.public_key = Some(my_pubkey_b58.clone());
                    aep::user_service::insert_user(&db_pool, &u)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                ensure_user = u;
            }
            None => {
                aep::user_service::insert_user(&db_pool, &ensure_user)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    let user_bytes = bincode::serialize(&ensure_user).map_err(|e| e.to_string())?;
    let sig = identity
        .keypair()
        .sign(&user_bytes)
        .map_err(|e| e.to_string())?;
    let profile_msg = AepMessage::ProfileUpdate {
        user: ensure_user.clone(),
        signature: Some(sig),
    };
    let profile_msg_bytes = bincode::serialize(&profile_msg).map_err(|e| e.to_string())?;
    if let Err(e) = new_state.network_tx.send(profile_msg_bytes).await {
        eprintln!("Failed to broadcast initial profile: {}", e);
    }

    let prekey_bytes_to_broadcast = {
        let e2ee_dir = app_data_dir.join("e2ee");
        let mgr_arc = e2ee::init_with_dir(&e2ee_dir);
        let mut mgr = mgr_arc.lock();
        let bundle = mgr.generate_prekey_bundle(8);
        bincode::serialize(&bundle).map_err(|e| e.to_string())?
    };
    let sig = identity
        .keypair()
        .sign(&prekey_bytes_to_broadcast)
        .map_err(|e| e.to_string())?;
    let msg = AepMessage::PrekeyBundle {
        user_id: my_peer_id.clone(),
        bundle: prekey_bytes_to_broadcast,
        signature: Some(sig),
    };
    let bytes = bincode::serialize(&msg).map_err(|e| e.to_string())?;
    if let Err(e) = new_state.network_tx.send(bytes).await {
        eprintln!("Failed to broadcast prekey bundle: {}", e);
    }

    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(message) = event_rx.recv().await {
            if let Err(e) = app_handle.emit("new-message", message) {
                eprintln!("Failed to emit new-message event: {}", e);
            }
        }
    });

    {
        let db_pool_rotate = db_pool.clone();
        let my_id_rotate = identity.peer_id().to_base58();
        let identity_rotate = identity.clone();
        let net_tx_rotate = new_state.network_tx.clone();
        tokio::spawn(async move {
            use std::collections::HashMap as Map;
            let mut last_rotated: Map<String, i64> = Map::new();
            let rotation_interval_secs: i64 = 12 * 60 * 60; // 12h
            let retry_interval_secs: i64 = 60;

            struct Pending {
                server_id: String,
                channel_id: Option<String>,
                _epoch: u64,
                next_ts: i64,
                retries_left: u8,
            }
            let mut pending: Vec<Pending> = Vec::new();
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
            loop {
                let _ = interval.tick().await;
                let now = chrono::Utc::now().timestamp();

                let mut remaining: Vec<Pending> = Vec::new();
                for mut p in pending.drain(..) {
                    if p.retries_left == 0 || p.next_ts > now {
                        remaining.push(p);
                        continue;
                    }
                    if let Err(e) = broadcast_group_key_update(
                        &db_pool_rotate,
                        identity_rotate.clone(),
                        &net_tx_rotate,
                        &p.server_id,
                        &p.channel_id,
                    )
                    .await
                    {
                        eprintln!("Retry group key update failed: {}", e);
                    }
                    p.retries_left -= 1;
                    p.next_ts = now + retry_interval_secs;
                    remaining.push(p);
                }
                pending = remaining;

                match aep::database::get_all_servers(&db_pool_rotate, &my_id_rotate).await {
                    Ok(servers) => {
                        for s in servers {
                            if s.owner_id != my_id_rotate {
                                continue;
                            }
                            for ch in s.channels {
                                let gid = format!("{}:{}", s.id, ch.id);
                                let last = last_rotated.get(&gid).cloned().unwrap_or(0);
                                if now - last < rotation_interval_secs {
                                    continue;
                                }
                                let epoch = now as u64;
                                if let Err(e) = rotate_and_broadcast_group_key(
                                    &db_pool_rotate,
                                    identity_rotate.clone(),
                                    &net_tx_rotate,
                                    &s.id,
                                    &Some(ch.id.clone()),
                                    epoch,
                                )
                                .await
                                {
                                    eprintln!("Group key rotation failed: {}", e);
                                } else {
                                    last_rotated.insert(gid, now);
                                    pending.push(Pending {
                                        server_id: s.id.clone(),
                                        channel_id: Some(ch.id),
                                        _epoch: epoch,
                                        next_ts: now + retry_interval_secs,
                                        retries_left: 3,
                                    });
                                }
                            }
                        }
                    }
                    Err(e) => eprintln!("Failed to load servers for rotation: {}", e),
                }
            }
        });
    }

    let db_pool_clone = db_pool.clone();
    let state_clone_for_aep = new_state.clone();
    let app_for_emit = app.clone();
    let topic_task = topic.clone();
    let shared_swarm_task = shared_swarm.clone();
    let outbox_task = outbox.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
        loop {
            tokio::select! {
                maybe = net_rx.recv() => {
                    if let Some(data) = maybe {
                        let mut swarm = shared_swarm_task.lock().await;
                        if has_any_peers(&swarm) {
                            if let Err(e) = send_data(&mut swarm, &topic_task, data).await {
                                eprintln!("Failed to send data over network: {}", e);
                            }
                        } else {
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

                                        {
                                            let mut swarm = shared_swarm_task.lock().await;
                                            let _ = swarm.behaviour_mut().req_res.send_request(
                                                &peer,
                                                network::FileTransferRequest::Init {
                                                    filename: filename.clone(),
                                                    size,
                                                },
                                            );
                                        }

                                        let mode_label = mode_to_str(mode);
                                        let mut buf = vec![0u8; DEFAULT_CHUNK_SIZE];
                                        let mut index: u64 = 0;
                                        let mut bytes_sent: u64 = 0;
                                        let mut resumed = false;
                                        let mut metadata = OutgoingResilientMetadata {
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
                                                .join(OUTGOING_STATE_DIR)
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
                                                        metadata = OutgoingResilientMetadata {
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
                                                            if let Err(e) = f.seek(SeekFrom::Start(seek_to)) {
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

                                        let initial_status = if resumed {
                                            "resuming"
                                        } else {
                                            "transferring"
                                        };
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
                        SwarmEvent::NewListenAddr { .. } => {
                        }
                        SwarmEvent::Behaviour(ComposedEvent::Gossipsub(g_event)) => {
                            if let libp2p::gossipsub::GossipsubEvent::Message { propagation_source, message, .. } = g_event {
                                if message.topic == topic_task.hash() {
                                    match bincode::deserialize::<AepMessage>(&message.data) {
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
                                                                                let _ = mgr.add_remote_bundle(user_id.clone(), bundle_obj);
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
                                                                let message_id = uuid::Uuid::new_v4().to_string();
                                                                let timestamp = chrono::Utc::now();
                                                                let mut db_attachments = Vec::new();
                                                                let content = if let Ok(payload) = bincode::deserialize::<EncryptedDmPayload>(&plaintext) {
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
                                                                        let attachment_id = uuid::Uuid::new_v4().to_string();
                                                                        db_attachments.push(database::Attachment {
                                                                            id: attachment_id,
                                                                            message_id: message_id.clone(),
                                                                            name: descriptor.name.clone(),
                                                                            content_type: descriptor.content_type.clone(),
                                                                            size: sanitized_size,
                                                                            data: Some(descriptor.data),
                                                                        });
                                                                    }
                                                                    payload.content
                                                                } else {
                                                                    match String::from_utf8(plaintext.clone()) {
                                                                        Ok(text) => text,
                                                                        Err(_) => String::from_utf8_lossy(&plaintext).to_string(),
                                                                    }
                                                                };

                                                                let new_message = database::Message {
                                                                    id: message_id,
                                                                    chat_id,
                                                                    sender_id: sender.clone(),
                                                                    content,
                                                                    timestamp,
                                                                    read: false,
                                                                    pinned: false,
                                                                    attachments: db_attachments,
                                                                    reactions: std::collections::HashMap::new(),
                                                                    edited_at: None,
                                                                    edited_by: None,
                                                                    expires_at: None,
                                                                };
                                                                if let Err(e) = database::insert_message(&db_pool_clone, &new_message).await { eprintln!("DB insert error: {}", e); }
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

                                                    if let Err(err) = database::mark_message_as_read(&db_pool_clone, &message_id).await {
                                                        eprintln!(
                                                            "Failed to mark message {} as read: {}",
                                                            message_id, err
                                                        );
                                                    }

                                                    let timestamp_str = timestamp.to_rfc3339();
                                                    let payload = ReadReceiptEventPayload {
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

                                                    if let Err(err) = database::upsert_typing_indicator(
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
                                                    let payload = TypingIndicatorEventPayload {
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
                                                            let mgr = arc.lock();
                                                            mgr.decrypt_group_message(&server_id, &channel_id, epoch, &nonce, &ciphertext).ok()
                                                        };
                                                        if let Some(plaintext) = plaintext_opt {
                                                            let chat_id = channel_id.clone().unwrap_or_else(|| server_id.clone());
                                                            let new_message = database::Message {
                                                                id: uuid::Uuid::new_v4().to_string(),
                                                                chat_id,
                                                                sender_id: sender.clone(),
                                                                content: String::from_utf8_lossy(&plaintext).to_string(),
                                                                timestamp: chrono::Utc::now(),
                                                                read: false,
                                                                pinned: false,
                                                                attachments: Vec::new(),
                                                                reactions: std::collections::HashMap::new(),
                                                                edited_at: None,
                                                                edited_by: None,
                                                                expires_at: None,
                                                            };
                                                            if let Err(e) = database::insert_message(&db_pool_clone, &new_message).await { eprintln!("DB insert error: {}", e); }
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
                                                    if let Err(e) = handle_aep_message(
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
                        SwarmEvent::Behaviour(ComposedEvent::Mdns(event)) => {
                            match event {
                                libp2p::mdns::MdnsEvent::Discovered(list) => {
                                    let mut swarm = shared_swarm_task.lock().await;
                                    for (_, addr) in list {
                                        let _ = libp2p::swarm::Swarm::dial_addr(&mut *swarm, addr);
                                    }
                                }
                                libp2p::mdns::MdnsEvent::Expired(_) => {}
                            }
                        }
                        SwarmEvent::Behaviour(ComposedEvent::ReqRes(event)) => {
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
                                                                        Ok(bytes) => serde_json::from_slice::<IncomingResilientMetadata>(&bytes)
                                                                            .unwrap_or_else(|_| IncomingResilientMetadata::default()),
                                                                        Err(_) => IncomingResilientMetadata::default(),
                                                                    }
                                                                } else {
                                                                    IncomingResilientMetadata::default()
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
                                                                    use std::io::Write;
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
                        if !has_any_peers(&guard) { continue; }
                    }
                    let mut pending = outbox_task.lock().await;
                    if pending.is_empty() { continue; }
                    let mut swarm = shared_swarm_task.lock().await;
                    let mut remaining: Vec<Vec<u8>> = Vec::new();
                    for data in pending.drain(..) {
                        if let Err(e) = send_data(&mut swarm, &topic_task, data.clone()).await {
                            eprintln!("Failed to flush queued data: {}", e);
                            remaining.push(data);
                        }
                    }
                    pending.extend(remaining);
                }
            }
        }
    });

    Ok(())
}

fn mode_to_str(mode: FileTransferMode) -> &'static str {
    match mode {
        FileTransferMode::Basic => "basic",
        FileTransferMode::Resilient => "resilient",
    }
}

fn load_outgoing_metadata(path: &Path) -> Result<OutgoingResilientMetadata, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

fn persist_outgoing_metadata(
    path: &Path,
    metadata: &OutgoingResilientMetadata,
) -> Result<(), String> {
    let bytes = serde_json::to_vec(metadata).map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

fn load_incoming_resilient_chunks(
    meta_path: &Path,
    data_path: &Path,
) -> Result<(IncomingResilientMetadata, HashMap<u64, Vec<u8>>), String> {
    if !meta_path.exists() || !data_path.exists() {
        return Ok((IncomingResilientMetadata::default(), HashMap::new()));
    }

    let bytes = std::fs::read(meta_path).map_err(|e| e.to_string())?;
    let metadata: IncomingResilientMetadata =
        serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    let chunk_size = if metadata.chunk_size == 0 {
        DEFAULT_CHUNK_SIZE
    } else {
        metadata.chunk_size
    };

    let mut file = std::fs::File::open(data_path).map_err(|e| e.to_string())?;
    let mut chunks: HashMap<u64, Vec<u8>> = HashMap::new();
    for (index, length) in metadata.chunks.iter() {
        let offset = (*index as u64).saturating_mul(chunk_size as u64);
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; *length];
        file.read_exact(&mut buf).map_err(|e| e.to_string())?;
        chunks.insert(*index, buf);
    }

    Ok((metadata, chunks))
}

fn persist_incoming_metadata(
    path: &Path,
    metadata: &IncomingResilientMetadata,
) -> Result<(), String> {
    let bytes = serde_json::to_vec(metadata).map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

fn write_incoming_chunk(path: &Path, index: u64, data: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    let offset = index.saturating_mul(DEFAULT_CHUNK_SIZE as u64);
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| e.to_string())?;
    file.write_all(data).map_err(|e| e.to_string())
}

fn cleanup_incoming_state(staging_path: &Option<PathBuf>, metadata_path: &Option<PathBuf>) {
    if let Some(path) = staging_path {
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }
    if let Some(path) = metadata_path {
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn sanitize_filename(input: &str) -> String {
    let candidate = Path::new(input)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file");

    let mut sanitized = String::with_capacity(candidate.len());
    for ch in candidate.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | ' ' | '(' | ')') {
            sanitized.push(ch);
        } else {
            sanitized.push('_');
        }
    }

    while sanitized.starts_with('.') || sanitized.starts_with('_') {
        sanitized.remove(0);
        if sanitized.is_empty() {
            break;
        }
    }

    sanitized.truncate(128);

    if sanitized.is_empty() || sanitized.chars().all(|c| c == '_' || c == '.') {
        format!("file-{}", chrono::Utc::now().timestamp())
    } else {
        sanitized
    }
}

async fn broadcast_group_key_update(
    db_pool: &sqlx::Pool<sqlx::Sqlite>,
    identity: crypto::identity::Identity,
    net_tx: &TokioSender<Vec<u8>>,
    server_id: &str,
    channel_id: &Option<String>,
) -> Result<(), String> {
    let (epoch, key_bytes) = {
        let arc = e2ee::init_global_manager();
        let mgr = arc.lock();
        mgr.get_group_key(server_id, channel_id)
            .ok_or_else(|| "Missing group key for broadcast".to_string())?
    };
    let issuer_id = identity.peer_id().to_base58();

    let members = aep::database::get_server_members(db_pool, server_id)
        .await
        .map_err(|e| e.to_string())?;
    let mut slots: Vec<aegis_protocol::EncryptedDmSlot> = Vec::new();
    for m in members {
        if m.id == issuer_id {
            continue;
        }
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock();
        if let Ok(pkt) = mgr.encrypt_for(&m.id, &key_bytes) {
            slots.push(aegis_protocol::EncryptedDmSlot {
                recipient: m.id,
                init: pkt.init,
                enc_header: pkt.enc_header,
                enc_content: pkt.enc_content,
            });
        }
    }

    let payload = bincode::serialize(&(issuer_id.clone(), server_id, channel_id, epoch, &slots))
        .map_err(|e| e.to_string())?;
    let signature = identity
        .keypair()
        .sign(&payload)
        .map_err(|e| e.to_string())?;

    let msg = aegis_protocol::AepMessage::GroupKeyUpdate {
        server_id: server_id.to_string(),
        channel_id: channel_id.clone(),
        epoch,
        slots,
        signature: Some(signature),
    };
    let bytes = bincode::serialize(&msg).map_err(|e| e.to_string())?;
    net_tx.send(bytes).await.map_err(|e| e.to_string())
}

async fn rotate_and_broadcast_group_key(
    db_pool: &sqlx::Pool<sqlx::Sqlite>,
    identity: crypto::identity::Identity,
    net_tx: &TokioSender<Vec<u8>>,
    server_id: &str,
    channel_id: &Option<String>,
    epoch: u64,
) -> Result<(), String> {
    let key = {
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock();
        mgr.generate_and_set_group_key(server_id, channel_id, epoch)
    };
    let issuer_id = identity.peer_id().to_base58();

    let members = aep::database::get_server_members(db_pool, server_id)
        .await
        .map_err(|e| e.to_string())?;
    let mut slots: Vec<aegis_protocol::EncryptedDmSlot> = Vec::new();
    for m in members {
        if m.id == issuer_id {
            continue;
        }
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock();
        if let Ok(pkt) = mgr.encrypt_for(&m.id, &key) {
            slots.push(aegis_protocol::EncryptedDmSlot {
                recipient: m.id,
                init: pkt.init,
                enc_header: pkt.enc_header,
                enc_content: pkt.enc_content,
            });
        }
    }

    let payload = bincode::serialize(&(issuer_id.clone(), server_id, channel_id, epoch, &slots))
        .map_err(|e| e.to_string())?;
    let signature = identity
        .keypair()
        .sign(&payload)
        .map_err(|e| e.to_string())?;

    let msg = aegis_protocol::AepMessage::GroupKeyUpdate {
        server_id: server_id.to_string(),
        channel_id: channel_id.clone(),
        epoch,
        slots,
        signature: Some(signature),
    };
    let bytes = bincode::serialize(&msg).map_err(|e| e.to_string())?;
    net_tx.send(bytes).await.map_err(|e| e.to_string())
}
