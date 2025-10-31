use crate::commands::state::{with_state_async, AppStateContainer};
use aegis_protocol::{AepMessage, RemoveFriendshipData};
use aegis_shared_types::AppState;
use aep::database::{self, FriendshipStatus};
use tauri::State;

use super::models::CommandResult;
use super::utils::{ensure_caller_identity, serialize};

#[tauri::command]
pub async fn remove_friendship(
    friendship_id: String,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<()> {
    with_state_async(state_container, move |state| {
        let friendship_id = friendship_id.clone();
        async move { remove_friendship_internal(state, friendship_id).await }
    })
    .await
}

async fn remove_friendship_internal(state: AppState, friendship_id: String) -> CommandResult<()> {
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

        let remove_friendship_data = RemoveFriendshipData {
            remover_id: remover_id.clone(),
            removed_id: removed_id.clone(),
        };
        let remove_friendship_bytes = serialize(&remove_friendship_data)?;
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
        let serialized_message = serialize(&aep_message)?;
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
) -> CommandResult<Vec<aep::database::FriendshipWithProfile>> {
    with_state_async(state_container, move |state| {
        let current_user_id = current_user_id.clone();
        async move {
            let my_id = ensure_caller_identity(&state, &current_user_id)?;
            database::get_friendships_with_profiles(&state.db_pool, &my_id)
                .await
                .map_err(|e| e.to_string())
        }
    })
    .await
}

#[tauri::command]
pub async fn get_friendships_for_user(
    current_user_id: String,
    target_user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<Vec<String>> {
    with_state_async(state_container, move |state| {
        let current_user_id = current_user_id.clone();
        let target_user_id = target_user_id.clone();
        async move { get_friendships_for_user_internal(state, current_user_id, target_user_id).await }
    })
    .await
}

pub(super) async fn get_friendships_for_user_internal(
    state: AppState,
    current_user_id: String,
    target_user_id: String,
) -> CommandResult<Vec<String>> {
    let my_id = ensure_caller_identity(&state, &current_user_id)?;

    let accepted_status = FriendshipStatus::Accepted.to_string();

    if target_user_id != my_id {
        let maybe_friendship = database::get_friendship(&state.db_pool, &my_id, &target_user_id)
            .await
            .map_err(|e| e.to_string())?;

        let friendship = maybe_friendship.ok_or_else(|| {
            "You do not have permission to view this user's friendships.".to_string()
        })?;

        if friendship.status != accepted_status {
            return Err("You do not have permission to view this user's friendships.".into());
        }
    }

    let friendships = database::get_all_friendships_for_user(&state.db_pool, &target_user_id)
        .await
        .map_err(|e| e.to_string())?;

    let mut sanitized_ids: Vec<String> = friendships
        .into_iter()
        .filter(|friendship| friendship.status == accepted_status)
        .map(|friendship| {
            if friendship.user_a_id == target_user_id {
                friendship.user_b_id
            } else {
                friendship.user_a_id
            }
        })
        .filter(|friend_id| friend_id != &target_user_id && friend_id != &current_user_id)
        .collect();

    sanitized_ids.sort();
    sanitized_ids.dedup();

    Ok(sanitized_ids)
}
