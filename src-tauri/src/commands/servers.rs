use crate::commands::state::AppStateContainer;
use aegis_protocol::AepMessage;
use aep::database;
use aep::user_service;
use tauri::State;

#[tauri::command]
pub async fn create_server(
    mut server: database::Server,
    state_container: State<'_, AppStateContainer>,
) -> Result<database::Server, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let owner_id = state.identity.peer_id().to_base58();
    server.owner_id = owner_id.clone();

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
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();
    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    if server.owner_id != my_id {
        return Err("Only server owners can send invites".into());
    }

    database::add_server_member(&state.db_pool, &server_id, &user_id)
        .await
        .map_err(|e| e.to_string())?;

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
        .map_err(|e| e.to_string())
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
    let delete_server_bytes =
        bincode::serialize(&delete_server_data).map_err(|e| e.to_string())?;
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
