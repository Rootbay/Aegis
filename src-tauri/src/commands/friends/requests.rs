use crate::commands::state::{with_state_async, AppStateContainer};
use aegis_protocol::{AepMessage, FriendRequestData, FriendRequestResponseData};
use aep::database::{self, Friendship, FriendshipStatus};
use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use super::models::CommandResult;
use super::utils::{ensure_caller_identity, serialize};

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
                .map_err(|e| e.to_string())?;

            if let Some(friendship) = friendship {
                database::update_friendship_status(
                    &state.db_pool,
                    &friendship.id,
                    FriendshipStatus::Accepted,
                )
                .await
                .map_err(|e| e.to_string())?;

                let friend_request_response_data = FriendRequestResponseData {
                    sender_id: friendship.user_b_id.clone(),
                    target_id: friendship.user_a_id.clone(),
                    accepted: true,
                };
                let friend_request_response_bytes = serialize(&friend_request_response_data)?;
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
                let serialized_message = serialize(&aep_message)?;
                state
                    .network_tx
                    .send(serialized_message)
                    .await
                    .map_err(|e| e.to_string())
            } else {
                Err("Friendship not found.".to_string())
            }
        }
    })
    .await
}
