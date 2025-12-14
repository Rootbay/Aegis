use std::io::{Read, Seek, Write};
use std::path::PathBuf;
use tauri::{Emitter, Manager, Runtime};
use aegis_shared_types::{FileTransferCommand, FileTransferMode, IncomingFile, FileAclPolicy};
use network::{FileTransferRequest, FileTransferResponse};
use super::super::context::AppContext;
use crate::bootstrap::{
    cleanup_incoming_state, load_outgoing_metadata, mode_to_str, persist_incoming_metadata,
    persist_outgoing_metadata, sanitize_filename, write_incoming_chunk,
    DEFAULT_CHUNK_SIZE, MAX_FILE_SIZE_BYTES, MAX_INFLIGHT_FILE_BYTES, MAX_UNAPPROVED_BUFFER_BYTES,
    OutgoingResilientMetadata, IncomingResilientMetadata, OUTGOING_STATE_DIR
};
use std::sync::Arc;

pub async fn handle_command<R: Runtime>(ctx: &Arc<AppContext<R>>, cmd: FileTransferCommand) {
    let FileTransferCommand::Send { recipient_peer_id, path, mode } = cmd;
    if let Ok(peer) = recipient_peer_id.parse::<libp2p::PeerId>() {
        send_file(ctx, peer, path, mode).await;
    }
}

pub async fn handle_incoming_request<R: Runtime>(
    ctx: &Arc<AppContext<R>>, 
    peer: libp2p::PeerId, 
    message: libp2p::request_response::RequestResponseMessage<FileTransferRequest, FileTransferResponse>
) {
    if let libp2p::request_response::RequestResponseMessage::Request { request, channel, .. } = message {
        let sender_id = peer.to_base58();
        match request {
            FileTransferRequest::Init { filename, size } => {
                handle_init(ctx, sender_id, filename, size, channel).await;
            }
            FileTransferRequest::Chunk { filename, index, data } => {
                handle_chunk(ctx, sender_id, filename, index, data, channel).await;
            }
            FileTransferRequest::Complete { filename } => {
                handle_complete(ctx, sender_id, filename, channel).await;
            }
        }
    }
}

async fn handle_init<R: Runtime>(
    ctx: &Arc<AppContext<R>>,
    sender_id: String,
    filename: String,
    size: u64,
    channel: libp2p::request_response::ResponseChannel<FileTransferResponse>
) {
    let my_id = ctx.app_state.identity.peer_id().to_base58();
    let policy = { ctx.app_state.file_acl_policy.lock().await.clone() };
    
    let allowed = match policy {
        FileAclPolicy::Everyone => true,
        FileAclPolicy::FriendsOnly => {
            match aep::database::get_friendship(&ctx.db_pool, &my_id, &sender_id).await {
                Ok(Some(fr)) => fr.status == "accepted",
                _ => false,
            }
        }
    };

    let mut swarm = ctx.network.shared_swarm.lock().await;
    if !allowed {
        let _ = swarm.behaviour_mut().req_res.send_response(channel, FileTransferResponse::Error("Not authorized".into()));
        return;
    }

    if size > MAX_FILE_SIZE_BYTES {
        let _ = swarm.behaviour_mut().req_res.send_response(channel, FileTransferResponse::Error("File too large".into()));
        return;
    }

    let key = format!("{}:{}", sender_id, filename);
    let safe_name = sanitize_filename(&filename);
    
    let mut inc = ctx.app_state.incoming_files.lock().await;
    inc.insert(key, IncomingFile {
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

    let _ = ctx.app.emit("file-transfer-request", serde_json::json!({
        "sender_id": sender_id,
        "filename": filename,
        "safe_filename": safe_name,
        "size": size
    }));
    
    let _ = swarm.behaviour_mut().req_res.send_response(channel, FileTransferResponse::Ack);
}

async fn handle_chunk<R: Runtime>(
    ctx: &Arc<AppContext<R>>,
    sender_id: String,
    filename: String,
    index: u64,
    data: Vec<u8>,
    channel: libp2p::request_response::ResponseChannel<FileTransferResponse>
) {
    let key = format!("{}:{}", sender_id, filename);
    let mut inc = ctx.app_state.incoming_files.lock().await;
    
    let mut swarm_guard = ctx.network.shared_swarm.lock().await;

    if let Some(mut file) = inc.remove(&key) {
        let chunk_len = data.len() as u64;
        let replaced_bytes = file.received_chunks.get(&index).map(|c| c.len() as u64).unwrap_or(0);
        let current_total: u64 = file.received_chunks.values().map(|c| c.len() as u64).sum();
        let new_total = (current_total.saturating_sub(replaced_bytes)).saturating_add(chunk_len);
        let inflight_limit = MAX_INFLIGHT_FILE_BYTES.min(file.size);

        let mut error_reason: Option<(&str, bool)> = None;
        if new_total > file.size {
            error_reason = Some(("Size mismatch", false));
        } else if new_total > inflight_limit {
            error_reason = Some(("Transfer too large", false));
        } else if !file.accepted && new_total > MAX_UNAPPROVED_BUFFER_BYTES.min(inflight_limit) {
            error_reason = Some(("Pending approval", true));
        }

        if let Some((reason, notify)) = error_reason {
            if notify {
                let _ = ctx.app.emit("file-transfer-denied", serde_json::json!({
                    "sender_id": sender_id,
                    "filename": file.name,
                    "safe_filename": sanitize_filename(&file.name)
                }));
            }
            let _ = swarm_guard.behaviour_mut().req_res.send_response(channel, FileTransferResponse::Error(reason.into()));
            return;
        }

        let safe_name = sanitize_filename(&file.name);
        if file.mode == FileTransferMode::Resilient {
            handle_resilient_incoming_chunk(&file, index, &data, &safe_name);
        }

        file.received_chunks.insert(index, data);
        let progress = if file.size == 0 { 1.0 } else { (new_total as f64 / file.size as f64).min(1.0) };
        let resumed_flag = file.resumed || replaced_bytes > 0;
        file.resumed = false;
        
        let _ = ctx.app.emit("file-transfer-progress", serde_json::json!({
            "direction": "incoming",
            "peer_id": sender_id,
            "filename": filename,
            "safe_filename": safe_name,
            "mode": mode_to_str(file.mode),
            "status": if resumed_flag { "resuming" } else { "transferring" },
            "progress": progress,
            "resumed": resumed_flag,
            "size": file.size,
        }));

        inc.insert(key, file);
        let _ = swarm_guard.behaviour_mut().req_res.send_response(channel, FileTransferResponse::Ack);
    } else {
        let _ = swarm_guard.behaviour_mut().req_res.send_response(channel, FileTransferResponse::Error("Unknown transfer".into()));
    }
}

async fn handle_complete<R: Runtime>(
    ctx: &Arc<AppContext<R>>,
    sender_id: String,
    filename: String,
    channel: libp2p::request_response::ResponseChannel<FileTransferResponse>
) {
    let key = format!("{}:{}", sender_id, filename);
    let mut inc = ctx.app_state.incoming_files.lock().await;
    let mut swarm_guard = ctx.network.shared_swarm.lock().await;

    if let Some(file) = inc.remove(&key) {
        let safe_name = sanitize_filename(&file.name);
        if file.accepted {
            finalize_download(ctx, &file, &safe_name, &sender_id);
            let _ = swarm_guard.behaviour_mut().req_res.send_response(channel, FileTransferResponse::Ack);
            let _ = ctx.app.emit("file-transfer-progress", serde_json::json!({
                "direction": "incoming",
                "peer_id": sender_id,
                "filename": file.name,
                "safe_filename": safe_name,
                "mode": mode_to_str(file.mode),
                "status": "complete",
                "progress": 1.0,
                "resumed": false,
                "size": file.size,
            }));
        } else {
            let _ = ctx.app.emit("file-transfer-denied", serde_json::json!({
                "sender_id": sender_id,
                "filename": file.name,
                "safe_filename": safe_name
            }));
            let _ = swarm_guard.behaviour_mut().req_res.send_response(channel, FileTransferResponse::Error("Denied".into()));
        }
        cleanup_incoming_state(&file.staging_path, &file.metadata_path);
    } else {
        let _ = swarm_guard.behaviour_mut().req_res.send_response(channel, FileTransferResponse::Error("Unknown transfer".into()));
    }
}

fn handle_resilient_incoming_chunk(file: &IncomingFile, index: u64, data: &[u8], safe_name: &str) {
    if let Some(staging) = &file.staging_path {
        let _ = write_incoming_chunk(staging, index, data);
    }
    if let Some(meta_path) = &file.metadata_path {
        let mut metadata = if meta_path.exists() {
            std::fs::read(meta_path).ok().and_then(|b| serde_json::from_slice::<IncomingResilientMetadata>(&b).ok()).unwrap_or_default()
        } else {
            IncomingResilientMetadata::default()
        };
        metadata.file_size = file.size;
        metadata.chunk_size = DEFAULT_CHUNK_SIZE;
        metadata.safe_filename = safe_name.to_string();
        metadata.chunks.insert(index, data.len());
        let _ = persist_incoming_metadata(meta_path, &metadata);
    }
}

fn finalize_download<R: Runtime>(ctx: &Arc<AppContext<R>>, file: &IncomingFile, safe_name: &str, sender_id: &str) {
    if let Ok(dir) = ctx.app.path().app_data_dir() {
        let output_path = dir.join(safe_name);
        if let Ok(mut f) = std::fs::File::create(&output_path) {
            let mut idx = 0u64;
            while let Some(chunk) = file.received_chunks.get(&idx) {
                let _ = f.write_all(chunk);
                idx += 1;
            }
            let _ = ctx.app.emit("file-received", serde_json::json!({
                "sender_id": sender_id,
                "filename": file.name,
                "safe_filename": safe_name,
                "path": output_path.to_string_lossy()
            }));
        }
    }
}

async fn send_file<R: Runtime>(ctx: &Arc<AppContext<R>>, peer: libp2p::PeerId, path: String, mode: FileTransferMode) {
    let file_path = PathBuf::from(&path);
    let mut f = match std::fs::File::open(&file_path) { Ok(f) => f, Err(_) => return };
    let filename = file_path.file_name().and_then(|s| s.to_str()).unwrap_or("file").to_string();
    let safe_filename = sanitize_filename(&filename);
    let size = std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);

    {
        let mut swarm = ctx.network.shared_swarm.lock().await;
        let _ = swarm.behaviour_mut().req_res.send_request(&peer, FileTransferRequest::Init { filename: filename.clone(), size });
    }

    let mut index: u64 = 0;
    let mut bytes_sent: u64 = 0;
    let mut resumed = false;
    let mut meta_path: Option<PathBuf> = None;

    if mode == FileTransferMode::Resilient {
        let recipient_str = peer.to_base58();
        let base_dir = ctx.app_state.app_data_dir.join(OUTGOING_STATE_DIR).join(&recipient_str);
        let _ = std::fs::create_dir_all(&base_dir);
        let candidate_meta = base_dir.join(format!("{}.json", safe_filename));
        meta_path = Some(candidate_meta.clone());
        
        if candidate_meta.exists() {
            if let Ok(existing) = load_outgoing_metadata(&candidate_meta) {
                index = existing.next_index;
                bytes_sent = existing.bytes_sent.min(size);
                if index > 0 {
                    if f.seek(std::io::SeekFrom::Start(index * DEFAULT_CHUNK_SIZE as u64)).is_ok() {
                        resumed = true;
                    } else {
                        index = 0; bytes_sent = 0;
                    }
                }
            }
        }
        if let Some(mp) = &meta_path {
             let _ = persist_outgoing_metadata(mp, &OutgoingResilientMetadata {
                next_index: index,
                bytes_sent,
                chunk_size: DEFAULT_CHUNK_SIZE,
                file_size: size,
                safe_filename: safe_filename.clone(),
            });
        }
    }

    emit_progress(ctx, &peer.to_base58(), &filename, &safe_filename, mode, if resumed { "resuming" } else { "transferring" }, bytes_sent, size, resumed);

    if size == 0 {
        send_complete(ctx, &peer, &filename);
        if let Some(mp) = meta_path { let _ = std::fs::remove_file(mp); }
        emit_progress(ctx, &peer.to_base58(), &filename, &safe_filename, mode, "complete", size, size, false);
        return;
    }

    let mut buf = vec![0u8; DEFAULT_CHUNK_SIZE];
    loop {
        let n = match f.read(&mut buf) { Ok(n) if n > 0 => n, _ => break };
        let chunk = buf[..n].to_vec();
        
        {
            let mut swarm = ctx.network.shared_swarm.lock().await;
            let _ = swarm.behaviour_mut().req_res.send_request(&peer, FileTransferRequest::Chunk { filename: filename.clone(), index, data: chunk });
        }

        bytes_sent += n as u64;
        if let Some(mp) = &meta_path {
            let _ = persist_outgoing_metadata(mp, &OutgoingResilientMetadata {
                next_index: index + 1,
                bytes_sent,
                chunk_size: DEFAULT_CHUNK_SIZE,
                file_size: size,
                safe_filename: safe_filename.clone()
            });
        }

        emit_progress(ctx, &peer.to_base58(), &filename, &safe_filename, mode, "transferring", bytes_sent, size, false);
        index += 1;
    }

    send_complete(ctx, &peer, &filename);
    if let Some(mp) = meta_path { let _ = std::fs::remove_file(mp); }
    emit_progress(ctx, &peer.to_base58(), &filename, &safe_filename, mode, "complete", bytes_sent, size, false);
}

fn send_complete<R: Runtime>(ctx: &Arc<AppContext<R>>, peer: &libp2p::PeerId, filename: &str) {
    let mut swarm = ctx.network.shared_swarm.blocking_lock();
    let _ = swarm.behaviour_mut().req_res.send_request(peer, FileTransferRequest::Complete { filename: filename.to_string() });
}

fn emit_progress<R: Runtime>(ctx: &Arc<AppContext<R>>, peer_id: &str, filename: &str, safe_name: &str, mode: FileTransferMode, status: &str, sent: u64, total: u64, resumed: bool) {
    let progress = if total == 0 { 1.0 } else { (sent as f64 / total as f64).min(1.0) };
    let _ = ctx.app.emit("file-transfer-progress", serde_json::json!({
        "direction": "outgoing",
        "peer_id": peer_id,
        "filename": filename,
        "safe_filename": safe_name,
        "mode": mode_to_str(mode),
        "status": status,
        "progress": progress,
        "resumed": resumed,
        "size": total,
    }));
}
