use tauri::State;
use crate::commands::state::AppStateContainer;
use aep::user_service;
use aegis_protocol::AepMessage;
use bs58;

#[tauri::command]
pub async fn get_user(
    id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Option<aegis_shared_types::User>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    user_service::get_user(&state.db_pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_user_profile(
    mut user: aegis_shared_types::User,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    user.public_key = Some(bs58::encode(state.identity.public_key_protobuf_bytes()).into_string());
    user_service::insert_user(&state.db_pool, &user)
        .await
        .map_err(|e| e.to_string())?;

    let user_data_bytes = bincode::serialize(&user).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&user_data_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::ProfileUpdate {
        user: user.clone(),
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())
}
