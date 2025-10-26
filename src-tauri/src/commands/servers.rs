use crate::commands::state::AppStateContainer;
use aegis_protocol::AepMessage;
use aep::database;
use aep::database::{ChannelDisplayPreference, ServerInvite};
use aep::user_service;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendServerInviteResult {
    pub server_id: String,
    pub user_id: String,
    pub already_member: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInviteResponse {
    pub id: String,
    pub server_id: String,
    pub code: String,
    pub created_by: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_uses: Option<i64>,
    pub uses: i64,
}

impl From<ServerInvite> for ServerInviteResponse {
    fn from(value: ServerInvite) -> Self {
        ServerInviteResponse {
            id: value.id,
            server_id: value.server_id,
            code: value.code,
            created_by: value.created_by,
            created_at: value.created_at.to_rfc3339(),
            expires_at: value.expires_at.map(|dt| dt.to_rfc3339()),
            max_uses: value.max_uses,
            uses: value.uses,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelDisplayPreferenceResponse {
    pub channel_id: String,
    pub hide_member_names: bool,
}

impl From<ChannelDisplayPreference> for ChannelDisplayPreferenceResponse {
    fn from(value: ChannelDisplayPreference) -> Self {
        ChannelDisplayPreferenceResponse {
            channel_id: value.channel_id,
            hide_member_names: value.hide_member_names,
        }
    }
}

#[tauri::command]
pub async fn create_server(
    mut server: database::Server,
    state_container: State<'_, AppStateContainer>,
) -> Result<database::Server, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
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
        id: uuid::Uuid::new_v4().to_string(),
        server_id: server.id.clone(),
        name: "general".to_string(),
        channel_type: "text".to_string(),
        private: false,
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
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();
    if user_id != my_id {
        return Err("Caller identity mismatch".into());
    }

    println!("User {} attempting to join server {}", my_id, server_id);
    database::add_server_member(&state.db_pool, &server_id, &my_id)
        .await
        .map_err(|e| e.to_string())?;

    let join_server_data = aegis_protocol::JoinServerData {
        server_id: server_id.clone(),
        user_id: my_id.clone(),
    };
    let join_server_bytes = bincode::serialize(&join_server_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&join_server_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::JoinServer {
        server_id,
        user_id: my_id,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn leave_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    database::remove_server_member(&state.db_pool, &server_id, &my_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_channel(
    channel: database::Channel,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &channel.server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != my_id {
        return Err("Only server owners can create channels.".into());
    }

    let channel_payload = channel.clone();
    let create_channel_data = aegis_protocol::CreateChannelData {
        channel: channel_payload.clone(),
    };
    let create_channel_bytes =
        bincode::serialize(&create_channel_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&create_channel_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::CreateChannel {
        channel: channel_payload,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    database::insert_channel(&state.db_pool, &channel)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_servers(
    current_user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::Server>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    database::get_all_servers(&state.db_pool, &current_user_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_channels_for_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::Channel>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    database::get_channels_for_server(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_members_for_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<aegis_shared_types::User>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    database::get_server_members(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_server_details(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<database::Server, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_server_invite(
    server_id: String,
    user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<SendServerInviteResult, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();
    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    if server.owner_id != my_id {
        return Err("Only server owners can send invites".into());
    }

    let already_member = database::server_has_member(&state.db_pool, &server_id, &user_id)
        .await
        .map_err(|e| e.to_string())?;

    if !already_member {
        database::add_server_member(&state.db_pool, &server_id, &user_id)
            .await
            .map_err(|e| e.to_string())?;
    }

    let send_server_invite_data = aegis_protocol::SendServerInviteData {
        server_id: server_id.clone(),
        user_id: user_id.clone(),
    };
    let send_server_invite_bytes =
        bincode::serialize(&send_server_invite_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&send_server_invite_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::SendServerInvite {
        server_id,
        user_id,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    Ok(SendServerInviteResult {
        server_id,
        user_id,
        already_member,
    })
}

#[tauri::command]
pub async fn generate_server_invite(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<ServerInviteResponse, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or("State not initialized")?
        .clone();

    let requester_id = state.identity.peer_id().to_base58();
    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != requester_id {
        return Err("Only server owners can generate invites.".into());
    }

    let code = uuid::Uuid::new_v4().simple().to_string();
    let created_at = Utc::now();

    let invite = database::create_server_invite(
        &state.db_pool,
        &server_id,
        &requester_id,
        &code,
        &created_at,
        None,
        None,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ServerInviteResponse::from(invite))
}

#[tauri::command]
pub async fn get_channel_display_preferences(
    server_id: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<ChannelDisplayPreferenceResponse>, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or("State not initialized")?
        .clone();
    let user_id = state.identity.peer_id().to_base58();

    let prefs = database::get_channel_display_preferences_for_user(
        &state.db_pool,
        &user_id,
        server_id.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(prefs.into_iter().map(ChannelDisplayPreferenceResponse::from).collect())
}

#[tauri::command]
pub async fn set_channel_display_preferences(
    channel_id: String,
    hide_member_names: bool,
    state_container: State<'_, AppStateContainer>,
) -> Result<ChannelDisplayPreferenceResponse, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or("State not initialized")?
        .clone();
    let user_id = state.identity.peer_id().to_base58();

    let preference = database::upsert_channel_display_preference(
        &state.db_pool,
        &user_id,
        &channel_id,
        hide_member_names,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ChannelDisplayPreferenceResponse::from(preference))
}

#[tauri::command]
pub async fn delete_channel(
    channel_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    let channel = database::get_channel_by_id(&state.db_pool, &channel_id)
        .await
        .map_err(|e| e.to_string())?;
    let server = database::get_server_by_id(&state.db_pool, &channel.server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != my_id {
        return Err("Only server owners can delete channels.".into());
    }

    let payload_channel_id = channel_id.clone();
    let delete_channel_data = aegis_protocol::DeleteChannelData {
        channel_id: payload_channel_id.clone(),
    };
    let delete_channel_bytes =
        bincode::serialize(&delete_channel_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&delete_channel_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::DeleteChannel {
        channel_id: payload_channel_id,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    database::delete_channel(&state.db_pool, &channel_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
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
