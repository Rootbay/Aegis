use crate::commands::state::AppStateContainer;
use aegis_protocol::AepMessage;
use aep::user_service;
use tauri::State;

#[tauri::command]
pub async fn send_presence_update(
    is_online: bool,
    status_message: Option<String>,
    location: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    let peer_id = state.identity.peer_id().to_base58();

    let status_message = status_message.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    let location = location.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });

    let presence_update_data = aegis_protocol::PresenceUpdateData {
        user_id: peer_id.clone(),
        is_online,
        status_message: status_message.clone(),
        location: location.clone(),
    };
    let presence_update_bytes =
        bincode::serialize(&presence_update_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&presence_update_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::PresenceUpdate {
        user_id: peer_id.clone(),
        is_online,
        status_message: status_message.clone(),
        location: location.clone(),
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    user_service::update_user_presence(
        &state.db_pool,
        &peer_id,
        is_online,
        Some(status_message),
        Some(location),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mark_self_presence_local(
    is_online: bool,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    let peer_id = state.identity.peer_id().to_base58();
    user_service::update_user_presence(&state.db_pool, &peer_id, is_online, None, None)
        .await
        .map_err(|e| e.to_string())
}
