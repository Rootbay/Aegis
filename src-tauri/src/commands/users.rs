use crate::commands::state::AppStateContainer;
use crate::commands::error::{AppError, AppResult};
use aegis_protocol::AepMessage;
use aep::user_service;
use bs58;
use tauri::State;

#[tauri::command]
pub async fn get_user(
    id: String,
    state_container: State<'_, AppStateContainer>,
) -> AppResult<Option<aegis_shared_types::User>> {
    let state = state_container.0.load_full().ok_or(AppError::NotInitialized)?;
    user_service::get_user(&state.db_pool, &id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))
}

#[tauri::command]
pub async fn update_user_profile(
    mut user: aegis_shared_types::User,
    state_container: State<'_, AppStateContainer>,
) -> AppResult<()> {
    let state = state_container.0.load_full().ok_or(AppError::NotInitialized)?;
    let my_id = state.identity.peer_id().to_base58();
    if user.id != my_id {
        return Err(AppError::from("Caller identity mismatch".to_string()));
    }

    let trimmed_avatar = user.avatar.trim().to_owned();
    user.avatar = if trimmed_avatar.is_empty() {
        match user_service::get_user(&state.db_pool, &user.id).await {
            Ok(Some(existing)) => existing.avatar,
            _ => format!(
                "https://api.dicebear.com/8.x/bottts-neutral/svg?seed={}",
                user.id
            ),
        }
    } else {
        trimmed_avatar
    };

    user.public_key = Some(bs58::encode(state.identity.public_key_protobuf_bytes()).into_string());
    user_service::insert_user(&state.db_pool, &user)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

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
        .map_err(AppError::from)
}
