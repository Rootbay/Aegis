use super::get_initialized_state;
use crate::commands::state::AppStateContainer;
use aep::database::{self, ServerMetadataUpdate, ServerModerationUpdate};
use tauri::State;

#[tauri::command]
pub async fn update_server_metadata(
    server_id: String,
    metadata: ServerMetadataUpdate,
    state_container: State<'_, AppStateContainer>,
) -> Result<database::Server, String> {
    let state = get_initialized_state(&state_container).await?;
    let requester_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != requester_id {
        return Err("Only server owners can update metadata.".into());
    }

    database::update_server_metadata(&state.db_pool, &server_id, &metadata)
        .await
        .map_err(|e| e.to_string())?;

    database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_server_roles(
    server_id: String,
    roles: Vec<database::Role>,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::Role>, String> {
    let state = get_initialized_state(&state_container).await?;
    let requester_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != requester_id {
        return Err("Only server owners can update roles.".into());
    }

    database::replace_server_roles(&state.db_pool, &server_id, &roles)
        .await
        .map_err(|e| e.to_string())?;

    let mut roles_map = database::get_roles_for_servers(&state.db_pool, &[server_id.clone()])
        .await
        .map_err(|e| e.to_string())?;

    Ok(roles_map.remove(&server_id).unwrap_or_default())
}

#[tauri::command]
pub async fn update_server_channels(
    server_id: String,
    channels: Vec<database::Channel>,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::Channel>, String> {
    let state = get_initialized_state(&state_container).await?;
    let requester_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != requester_id {
        return Err("Only server owners can update channels.".into());
    }

    if channels
        .iter()
        .any(|channel| channel.server_id != server_id)
    {
        return Err("All channels must belong to the target server.".into());
    }

    database::replace_server_channels(&state.db_pool, &server_id, &channels)
        .await
        .map_err(|e| e.to_string())?;

    database::get_channels_for_server(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_server_moderation_flags(
    server_id: String,
    moderation: ServerModerationUpdate,
    state_container: State<'_, AppStateContainer>,
) -> Result<database::Server, String> {
    let state = get_initialized_state(&state_container).await?;
    let requester_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != requester_id {
        return Err("Only server owners can update moderation flags.".into());
    }

    database::update_server_moderation(&state.db_pool, &server_id, &moderation)
        .await
        .map_err(|e| e.to_string())?;

    database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}
