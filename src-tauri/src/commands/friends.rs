use crate::commands::state::AppStateContainer;
use aegis_protocol::AepMessage;
use aep::database::{self, Friendship, FriendshipStatus};
use chrono::Utc;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn send_friend_request(
    current_user_id: String,
    target_user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();
    if current_user_id != my_id {
        return Err("Caller identity mismatch".to_string());
    }

    let now = Utc::now();
    let friendship = Friendship {
        id: Uuid::new_v4().to_string(),
        user_a_id: my_id.clone(),
        user_b_id: target_user_id.clone(),
        status: FriendshipStatus::Pending.to_string(),
        created_at: now,
        updated_at: now,
    };

    database::insert_friendship(&state.db_pool, &friendship)
        .await
        .map_err(|e| e.to_string())?;

    let friend_request_data = aegis_protocol::FriendRequestData {
        sender_id: my_id.clone(),
        target_id: target_user_id.clone(),
    };
    let friend_request_bytes =
        bincode::serialize(&friend_request_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&friend_request_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::FriendRequest {
        sender_id: my_id,
        target_id: target_user_id,
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
pub async fn accept_friend_request(
    friendship_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    let friendship = database::get_friendship_by_id(&state.db_pool, &friendship_id)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(friendship) = friendship {
        database::update_friendship_status(
            &state.db_pool,
            &friendship.id,
            FriendshipStatus::Accepted,
        )
        .await
        .map_err(|e| e.to_string())?;

        let friend_request_response_data = aegis_protocol::FriendRequestResponseData {
            sender_id: friendship.user_b_id.clone(),
            target_id: friendship.user_a_id.clone(),
            accepted: true,
        };
        let friend_request_response_bytes =
            bincode::serialize(&friend_request_response_data).map_err(|e| e.to_string())?;
        let signature = state
            .identity
            .keypair()
            .sign(&friend_request_response_bytes)
            .map_err(|e| e.to_string())?;

        let aep_message = AepMessage::FriendRequestResponse {
            sender_id: friendship.user_b_id,
            target_id: friendship.user_a_id,
            accepted: true,
            signature: Some(signature),
        };
        let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
        state
            .network_tx
            .send(serialized_message)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Friendship not found.".to_string())
    }
}

#[tauri::command]
pub async fn block_user(
    current_user_id: String,
    target_user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();
    if current_user_id != my_id {
        return Err("Caller identity mismatch".to_string());
    }

    let now = Utc::now();
    let friendship_option = database::get_friendship(&state.db_pool, &my_id, &target_user_id)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(friendship) = friendship_option {
        let new_status = if friendship.user_a_id == my_id {
            FriendshipStatus::BlockedByA
        } else {
            FriendshipStatus::BlockedByB
        };
        database::update_friendship_status(&state.db_pool, &friendship.id, new_status)
            .await
            .map_err(|e| e.to_string())?
    } else {
        let friendship = Friendship {
            id: Uuid::new_v4().to_string(),
            user_a_id: my_id.clone(),
            user_b_id: target_user_id.clone(),
            status: FriendshipStatus::BlockedByA.to_string(),
            created_at: now,
            updated_at: now,
        };
        database::insert_friendship(&state.db_pool, &friendship)
            .await
            .map_err(|e| e.to_string())?
    }

    let block_user_data = aegis_protocol::BlockUserData {
        blocker_id: my_id.clone(),
        blocked_id: target_user_id.clone(),
    };
    let block_user_bytes = bincode::serialize(&block_user_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&block_user_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::BlockUser {
        blocker_id: my_id,
        blocked_id: target_user_id,
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
pub async fn unblock_user(
    friendship_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    let friendship = database::get_friendship_by_id(&state.db_pool, &friendship_id)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(friendship) = friendship {
        database::delete_friendship(&state.db_pool, &friendship.id)
            .await
            .map_err(|e| e.to_string())?;

        let unblock_user_data = aegis_protocol::UnblockUserData {
            unblocker_id: friendship.user_a_id.clone(),
            unblocked_id: friendship.user_b_id.clone(),
        };
        let unblock_user_bytes =
            bincode::serialize(&unblock_user_data).map_err(|e| e.to_string())?;
        let signature = state
            .identity
            .keypair()
            .sign(&unblock_user_bytes)
            .map_err(|e| e.to_string())?;

        let aep_message = AepMessage::UnblockUser {
            unblocker_id: friendship.user_a_id,
            unblocked_id: friendship.user_b_id,
            signature: Some(signature),
        };
        let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
        state
            .network_tx
            .send(serialized_message)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Friendship not found.".to_string())
    }
}

#[tauri::command]
pub async fn remove_friendship(
    friendship_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    let friendship = database::get_friendship_by_id(&state.db_pool, &friendship_id)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(friendship) = friendship {
        let (remover_id, removed_id) = if friendship.user_a_id == my_id {
            (friendship.user_a_id.clone(), friendship.user_b_id.clone())
        } else if friendship.user_b_id == my_id {
            (friendship.user_b_id.clone(), friendship.user_a_id.clone())
        } else {
            return Err("Caller identity mismatch".into());
        };

        let remove_friendship_data = aegis_protocol::RemoveFriendshipData {
            remover_id: remover_id.clone(),
            removed_id: removed_id.clone(),
        };
        let remove_friendship_bytes =
            bincode::serialize(&remove_friendship_data).map_err(|e| e.to_string())?;
        let signature = state
            .identity
            .keypair()
            .sign(&remove_friendship_bytes)
            .map_err(|e| e.to_string())?;

        let aep_message = AepMessage::RemoveFriendship {
            remover_id,
            removed_id,
            signature: Some(signature),
        };
        let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
        state
            .network_tx
            .send(serialized_message)
            .await
            .map_err(|e| e.to_string())?;

        database::delete_friendship(&state.db_pool, &friendship.id)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Friendship not found.".to_string())
    }
}

#[tauri::command]
pub async fn get_friendships(
    current_user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::Friendship>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    let my_id = state.identity.peer_id().to_base58();
    if current_user_id != my_id {
        return Err("Caller identity mismatch".into());
    }
    database::get_all_friendships_for_user(&state.db_pool, &my_id)
        .await
        .map_err(|e| e.to_string())
}
