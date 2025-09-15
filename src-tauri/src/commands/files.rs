use tauri::State;
use crate::commands::state::AppStateContainer;

#[tauri::command]
pub async fn send_file(
    recipient_peer_id: String,
    path: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    state
        .file_cmd_tx
        .send(aegis_shared_types::FileTransferCommand::Send { recipient_peer_id, path })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn approve_file_transfer(
    sender_id: String,
    filename: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let key = format!("{}:{}", sender_id, filename);
    let mut guard = state.incoming_files.lock().await;
    if let Some(f) = guard.get_mut(&key) {
        f.accepted = true;
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
    guard.remove(&key);
    Ok(())
}
