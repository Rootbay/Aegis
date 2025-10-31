use super::{broadcast_join_event, ensure_server_owner, get_initialized_state};
use crate::commands::state::AppStateContainer;
use aegis_protocol::{self, AepMessage};
use aep::{database, user_service};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerBanUpdate {
    pub server_id: String,
    pub user_id: String,
}

#[tauri::command]
pub async fn create_server(
    mut server: database::Server,
    state_container: State<'_, AppStateContainer>,
) -> Result<database::Server, String> {
    let state = get_initialized_state(&state_container).await?;
    let owner_id = state.identity.peer_id().to_base58();
    server.owner_id = owner_id.clone();
    server.invites = Vec::new();

    database::insert_server(&state.db_pool, &server)
        .await
        .map_err(|e| e.to_string())?;

    database::add_server_member(&state.db_pool, &server.id, &server.owner_id)
        .await
        .map_err(|e| e.to_string())?;

    let default_channel = database::Channel {
        id: Uuid::new_v4().to_string(),
        server_id: server.id.clone(),
        name: "general".to_string(),
        channel_type: "text".to_string(),
        private: false,
        category_id: None,
    };
    database::insert_channel(&state.db_pool, &default_channel)
        .await
        .map_err(|e| e.to_string())?;

    server.channels.push(default_channel.clone());
    if let Ok(Some(owner)) = user_service::get_user(&state.db_pool, &server.owner_id).await {
        server.members.push(owner);
    }

    let create_server_data = aegis_protocol::CreateServerData {
        server: server.clone(),
    };
    let create_server_bytes = bincode::serialize(&create_server_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&create_server_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::CreateServer {
        server: server.clone(),
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    Ok(server)
}

#[tauri::command]
pub async fn join_server(
    server_id: String,
    user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = get_initialized_state(&state_container).await?;
    let my_id = state.identity.peer_id().to_base58();
    if user_id != my_id {
        return Err("Caller identity mismatch".into());
    }

    database::add_server_member(&state.db_pool, &server_id, &my_id)
        .await
        .map_err(|e| e.to_string())?;

    broadcast_join_event(&state, &server_id, &my_id).await
}

#[tauri::command]
pub async fn leave_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = get_initialized_state(&state_container).await?;
    let my_id = state.identity.peer_id().to_base58();

    database::remove_server_member(&state.db_pool, &server_id, &my_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_server_member(
    server_id: String,
    member_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = get_initialized_state(&state_container).await?;
    let requester_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != requester_id {
        return Err("Only server owners can remove members.".into());
    }

    if member_id == server.owner_id {
        return Err("Server owners cannot remove themselves.".into());
    }

    database::remove_server_member(&state.db_pool, &server_id, &member_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_servers(
    current_user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::Server>, String> {
    let state = get_initialized_state(&state_container).await?;
    database::get_all_servers(&state.db_pool, &current_user_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_members_for_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<aegis_shared_types::User>, String> {
    let state = get_initialized_state(&state_container).await?;
    database::get_server_members(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_server_bans(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::User>, String> {
    let state = get_initialized_state(&state_container).await?;
    ensure_server_owner(&state, &server_id).await?;

    database::get_server_bans(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unban_server_member(
    server_id: String,
    user_id: String,
    state_container: State<'_, AppStateContainer>,
    app: AppHandle,
) -> Result<ServerBanUpdate, String> {
    let state = get_initialized_state(&state_container).await?;
    ensure_server_owner(&state, &server_id).await?;

    database::remove_server_ban(&state.db_pool, &server_id, &user_id)
        .await
        .map_err(|e| e.to_string())?;

    let payload = ServerBanUpdate {
        server_id: server_id.clone(),
        user_id: user_id.clone(),
    };

    app.emit("server-member-unbanned", payload.clone())
        .map_err(|e| e.to_string())?;

    Ok(payload)
}

#[tauri::command]
pub async fn get_server_details(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<database::Server, String> {
    let state = get_initialized_state(&state_container).await?;
    database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = get_initialized_state(&state_container).await?;
    let my_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != my_id {
        return Err("Only server owners can delete the server.".into());
    }

    let payload_server_id = server_id.clone();
    let delete_server_data = aegis_protocol::DeleteServerData {
        server_id: payload_server_id.clone(),
    };
    let delete_server_bytes = bincode::serialize(&delete_server_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&delete_server_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::DeleteServer {
        server_id: payload_server_id,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    database::delete_server(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}
