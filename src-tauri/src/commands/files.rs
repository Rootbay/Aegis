use crate::commands::state::AppStateContainer;
use aegis_shared_types::FileTransferMode;
use chrono::Utc;
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use tauri::State;

const INCOMING_STATE_DIR: &str = "incoming_transfers";
const DEFAULT_CHUNK_SIZE: usize = 128 * 1024;

#[tauri::command]
pub async fn send_file(
    recipient_peer_id: String,
    path: String,
    resilient: Option<bool>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let mode = if resilient.unwrap_or(false) {
        FileTransferMode::Resilient
    } else {
        FileTransferMode::Basic
    };
    state
        .file_cmd_tx
        .send(aegis_shared_types::FileTransferCommand::Send {
            recipient_peer_id,
            path,
            mode,
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn approve_file_transfer(
    sender_id: String,
    filename: String,
    resilient: Option<bool>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let key = format!("{}:{}", sender_id, filename);
    let mut guard = state.incoming_files.lock().await;
    if let Some(f) = guard.get_mut(&key) {
        f.accepted = true;
        if resilient.unwrap_or(false) {
            f.mode = FileTransferMode::Resilient;
            let safe_name = sanitize_filename(&filename);
            let base_dir = state.app_data_dir.join(INCOMING_STATE_DIR).join(&sender_id);
            std::fs::create_dir_all(&base_dir).map_err(|e| e.to_string())?;
            let staging_path = base_dir.join(format!("{}.part", safe_name));
            let metadata_path = base_dir.join(format!("{}.json", safe_name));
            let existing_chunks = load_resilient_incoming_from_disk(&metadata_path, &staging_path)?;
            if !existing_chunks.is_empty() {
                f.received_chunks = existing_chunks;
                f.resumed = true;
            }
            f.staging_path = Some(staging_path);
            f.metadata_path = Some(metadata_path.clone());
            let metadata = IncomingResilientMetadata {
                file_size: f.size,
                chunk_size: DEFAULT_CHUNK_SIZE,
                chunks: f
                    .received_chunks
                    .iter()
                    .map(|(idx, chunk)| (*idx, chunk.len()))
                    .collect(),
                safe_filename: safe_name,
            };
            if let Err(e) = persist_incoming_metadata_file(&metadata_path, &metadata) {
                eprintln!("Failed to prime incoming metadata: {}", e);
            }
        } else {
            if let Some(path) = f.staging_path.take() {
                if path.exists() {
                    let _ = std::fs::remove_file(path);
                }
            }
            if let Some(path) = f.metadata_path.take() {
                if path.exists() {
                    let _ = std::fs::remove_file(path);
                }
            }
            f.mode = FileTransferMode::Basic;
            f.resumed = false;
        }
        Ok(())
    } else {
        Err("Pending transfer not found".to_string())
    }
}

#[tauri::command]
pub async fn reject_file_transfer(
    sender_id: String,
    filename: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let key = format!("{}:{}", sender_id, filename);
    let mut guard = state.incoming_files.lock().await;
    if let Some(file) = guard.remove(&key) {
        if let Some(path) = file.staging_path {
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }
        }
        if let Some(path) = file.metadata_path {
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Default)]
struct IncomingResilientMetadata {
    file_size: u64,
    chunk_size: usize,
    chunks: HashMap<u64, usize>,
    safe_filename: String,
}

fn load_resilient_incoming_from_disk(
    metadata_path: &Path,
    data_path: &Path,
) -> Result<HashMap<u64, Vec<u8>>, String> {
    if !metadata_path.exists() || !data_path.exists() {
        return Ok(HashMap::new());
    }

    let bytes = std::fs::read(metadata_path).map_err(|e| e.to_string())?;
    let metadata: IncomingResilientMetadata =
        serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    let chunk_size = if metadata.chunk_size == 0 {
        DEFAULT_CHUNK_SIZE
    } else {
        metadata.chunk_size
    };

    let mut file = std::fs::File::open(data_path).map_err(|e| e.to_string())?;
    let mut chunks = HashMap::new();
    for (index, length) in metadata.chunks.iter() {
        let offset = (*index as u64).saturating_mul(chunk_size as u64);
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; *length];
        file.read_exact(&mut buf).map_err(|e| e.to_string())?;
        chunks.insert(*index, buf);
    }
    Ok(chunks)
}

fn persist_incoming_metadata_file(
    metadata_path: &Path,
    metadata: &IncomingResilientMetadata,
) -> Result<(), String> {
    let bytes = serde_json::to_vec(metadata).map_err(|e| e.to_string())?;
    std::fs::write(metadata_path, bytes).map_err(|e| e.to_string())
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
        format!("file-{}", Utc::now().timestamp())
    } else {
        sanitized
    }
}
