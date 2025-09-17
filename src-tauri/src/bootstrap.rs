use libp2p::futures::StreamExt;
use libp2p::swarm::SwarmEvent;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tauri::{Emitter, Manager, Runtime, State};
use tokio::sync::{mpsc, Mutex};

use aegis_protocol::AepMessage;
use aegis_shared_types::{AppState, User};
use aep::{database, handle_aep_message, initialize_aep};
use bs58;
use e2ee;
use network::{has_any_peers, initialize_network, send_data, ComposedEvent};
use tokio::sync::mpsc::Sender as TokioSender;

const MAX_OUTBOX_MESSAGES: usize = 256;

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

    let new_state = AppState {
        identity: identity.clone(),
        network_tx: net_tx,
        db_pool: db_pool.clone(),
        incoming_files: Arc::new(Mutex::new(HashMap::new())),
        file_cmd_tx: file_tx,
        file_acl_policy: Arc::new(Mutex::new(initial_acl)),
    };

    *state_container.0.lock().await = Some(new_state.clone());

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
                            aegis_shared_types::FileTransferCommand::Send { recipient_peer_id, path } => {
                                if let Ok(peer) = recipient_peer_id.parse::<libp2p::PeerId>() {
                                    let file_path = std::path::PathBuf::from(path);
                                    if let Ok(mut f) = std::fs::File::open(&file_path) {
                                        use std::io::Read;
                                        let filename = file_path.file_name().and_then(|s| s.to_str()).unwrap_or("file").to_string();
                                        let size = std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);
                                        {
                                            let mut swarm = shared_swarm_task.lock().await;
                                            let _req_id = swarm.behaviour_mut().req_res.send_request(&peer, network::FileTransferRequest::Init { filename: filename.clone(), size });
                                        }
                                        let mut index: u64 = 0;
                                        let mut buf = vec![0u8; 128 * 1024];
                                        loop {
                                            let n = match f.read(&mut buf) { Ok(n) => n, Err(_) => 0 };
                                            if n == 0 { break; }
                                            let chunk = buf[..n].to_vec();
                                            let mut swarm = shared_swarm_task.lock().await;
                                            let _ = swarm.behaviour_mut().req_res.send_request(&peer, network::FileTransferRequest::Chunk { filename: filename.clone(), index, data: chunk });
                                            index += 1;
                                        }
                                        let mut swarm = shared_swarm_task.lock().await;
                                        let _ = swarm.behaviour_mut().req_res.send_request(&peer, network::FileTransferRequest::Complete { filename });
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
                            if let libp2p::gossipsub::GossipsubEvent::Message { message, .. } = g_event {
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
                                                                let new_message = database::Message {
                                                                    id: uuid::Uuid::new_v4().to_string(),
                                                                    chat_id,
                                                                    sender_id: sender.clone(),
                                                                    content: String::from_utf8_lossy(&plaintext).to_string(),
                                                                    timestamp: chrono::Utc::now(),
                                                                    read: false,
                                                                };
                                                                if let Err(e) = database::insert_message(&db_pool_clone, &new_message).await { eprintln!("DB insert error: {}", e); }
                                                            }
                                                        }
                                                    }
                                                }
                                                AepMessage::GroupKeyUpdate { issuer_id, server_id, channel_id, epoch, slots, signature } => {
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
                                                            Err(e) => eprintln!("Failed to decrypt group key: {e}")
                                                        }
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
                                                            };
                                                            if let Err(e) = database::insert_message(&db_pool_clone, &new_message).await { eprintln!("DB insert error: {}", e); }
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
                                                        let safe_name = aegis_shared_types::sanitize_filename(&filename);
                                                        if size > aegis_shared_types::MAX_FILE_SIZE_BYTES {
                                                            let mut swarm = shared_swarm_task.lock().await;
                                                            let _ = swarm.behaviour_mut().req_res.send_response(channel, network::FileTransferResponse::Error("File too large".into()));
                                                            continue;
                                                        }
                                                        let mut inc = state_clone_for_aep.incoming_files.lock().await;
                                                        inc.insert(key.clone(), aegis_shared_types::IncomingFile {
                                                            name: filename.clone(),
                                                            safe_name: safe_name.clone(),
                                                            size,
                                                            received_chunks: std::collections::HashMap::new(),
                                                            key: vec![],
                                                            nonce: vec![],
                                                            sender_id: sender_id.clone(),
                                                            accepted: false,
                                                            buffered_bytes: 0,
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
                                                        let new_total = file.buffered_bytes.saturating_add(chunk_len);
                                                        let inflight_limit = aegis_shared_types::MAX_INFLIGHT_FILE_BYTES.min(file.size);
                                                        let mut error_reason: Option<(&str, bool)> = None;
                                                        if new_total > file.size {
                                                            error_reason = Some(("Size mismatch", false));
                                                        } else if new_total > inflight_limit {
                                                            error_reason = Some(("Transfer too large", false));
                                                        } else if !file.accepted {
                                                            let unapproved_limit = aegis_shared_types::MAX_UNAPPROVED_BUFFER_BYTES.min(inflight_limit);
                                                            if new_total > unapproved_limit {
                                                                error_reason = Some(("Pending approval", true));
                                                            }
                                                        }
                                                        if let Some((reason, notify)) = error_reason {
                                                            let original_name = file.name.clone();
                                                            let safe_name = file.safe_name.clone();
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
                                                        file.buffered_bytes = new_total;
                                                        file.received_chunks.insert(index, data);
                                                        inc.insert(key, file);
                                                        drop(inc);
                                                        let mut swarm = shared_swarm_task.lock().await;
                                                        let _ = swarm.behaviour_mut().req_res.send_response(channel, network::FileTransferResponse::Ack);
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
                                                        if file.accepted {
                                                            if let Ok(dir) = app_for_emit.path().app_data_dir() {
                                                                let output_path = dir.join(&file.safe_name);
                                                                if let Ok(mut f) = std::fs::File::create(&output_path) {
                                                                    use std::io::Write;
                                                                    let mut idx = 0u64;
                                                                    while let Some(chunk) = file.received_chunks.get(&idx) {
                                                                        let _ = f.write_all(chunk);
                                                                        idx += 1;
                                                                    }
                                                                    if file.buffered_bytes != file.size {
                                                                        eprintln!("Received {} bytes for {} but expected {}", file.buffered_bytes, file.safe_name, file.size);
                                                                    }
                                                                    let _ = app_for_emit.emit("file-received", serde_json::json!({
                                                                        "sender_id": sender_id,
                                                                        "filename": file.name.clone(),
                                                                        "safe_filename": file.safe_name.clone(),
                                                                        "path": output_path.to_string_lossy().to_string()
                                                                    }));
                                                                } else {
                                                                    eprintln!("Failed to create file for received transfer {}", file.safe_name);
                                                                }
                                                            }
                                                            let mut swarm = shared_swarm_task.lock().await;
                                                            let _ = swarm.behaviour_mut().req_res.send_response(channel, network::FileTransferResponse::Ack);
                                                        } else {
                                                            let _ = app_for_emit.emit("file-transfer-denied", serde_json::json!({
                                                                "sender_id": sender_id,
                                                                "filename": file.name.clone(),
                                                                "safe_filename": file.safe_name
                                                            }));
                                                            let mut swarm = shared_swarm_task.lock().await;
                                                            let _ = swarm.behaviour_mut().req_res.send_response(channel, network::FileTransferResponse::Error("Denied".into()));
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
        issuer_id,
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
        issuer_id,
        server_id: server_id.to_string(),
        channel_id: channel_id.clone(),
        epoch,
        slots,
        signature: Some(signature),
    };
    let bytes = bincode::serialize(&msg).map_err(|e| e.to_string())?;
    net_tx.send(bytes).await.map_err(|e| e.to_string())
}




