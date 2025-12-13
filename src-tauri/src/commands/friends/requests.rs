use crate::commands::state::{with_state_async, AppStateContainer};
use scu128::Scu128;
use aegis_protocol::{AepMessage, FriendRequestData};
use aegis_shared_types::AppState;
use aep::database::{self, Friendship, FriendshipStatus};
use chrono::Utc;
use tauri::State;

use super::models::CommandResult;
use super::utils::{ensure_caller_identity, send_friend_request_response, serialize};

#[tauri::command]
pub async fn send_friend_request(
    current_user_id: String,
    target_user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<()> {
    with_state_async(state_container, move |state| {
        let target_user_id = target_user_id.clone();
        async move {
            let my_id = ensure_caller_identity(&state, &current_user_id)?;
            let now = Utc::now();
            let friendship = Friendship {
                id: Scu128::new().to_string(),
                user_a_id: my_id.clone(),
                user_b_id: target_user_id.clone(),
                status: FriendshipStatus::Pending.to_string(),
                created_at: now,
                updated_at: now,
            };

            database::insert_friendship(&state.db_pool, &friendship)
                .await
                .map_err(|e| e.to_string())?;

            let friend_request_data = FriendRequestData {
                sender_id: my_id.clone(),
                target_id: target_user_id.clone(),
            };
            let friend_request_bytes = serialize(&friend_request_data)?;
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
            let serialized_message = serialize(&aep_message)?;
            state
                .network_tx
                .send(serialized_message)
                .await
                .map_err(|e| e.to_string())
        }
    })
    .await
}

#[tauri::command]
pub async fn accept_friend_request(
    friendship_id: String,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<()> {
    with_state_async(state_container, move |state| {
        let friendship_id = friendship_id.clone();
        async move {
            let friendship = database::get_friendship_by_id(&state.db_pool, &friendship_id)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "Friendship not found.".to_string())?;
            accept_friendship_internal(&state, friendship).await
        }
    })
    .await
}

async fn accept_friendship_internal(
    state: &AppState,
    friendship: database::Friendship,
) -> CommandResult<()> {
    database::update_friendship_status(&state.db_pool, &friendship.id, FriendshipStatus::Accepted)
        .await
        .map_err(|e| e.to_string())?;

    send_friend_request_response(state, &friendship, true).await
}
