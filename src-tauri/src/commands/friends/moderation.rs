use crate::commands::state::{with_state_async, AppStateContainer};
use scu128::Scu128;
use aegis_protocol::{AepMessage, BlockUserData, UnblockUserData};
use aegis_shared_types::AppState;
use aep::database::{self, Friendship, FriendshipStatus};
use chrono::Utc;
use tauri::State;

use super::models::{
    BlockUserResult, CommandResult, IgnoreUserResult, MuteUserResult, UnblockUserResult,
};
use super::utils::{ensure_caller_identity, serialize};

#[tauri::command]
pub async fn block_user(
    current_user_id: String,
    target_user_id: String,
    spam_score: Option<f32>,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<BlockUserResult> {
    with_state_async(state_container, move |state| {
        let current_user_id = current_user_id.clone();
        let target_user_id = target_user_id.clone();
        async move { block_user_internal(state, current_user_id, target_user_id, spam_score).await }
    })
    .await
}

pub(super) async fn block_user_internal(
    state: AppState,
    current_user_id: String,
    target_user_id: String,
    spam_score: Option<f32>,
) -> CommandResult<BlockUserResult> {
    let my_id = ensure_caller_identity(&state, &current_user_id)?;

    if let Some(score) = spam_score {
        tracing::info!(
            target_user_id = %target_user_id,
            spam_score = score,
            "block_user invoked with spam score"
        );
    }

    let now = Utc::now();
    let friendship_option = database::get_friendship(&state.db_pool, &my_id, &target_user_id)
        .await
        .map_err(|e| e.to_string())?;

    let (friendship_id, newly_created) = if let Some(friendship) = friendship_option {
        let new_status = if friendship.user_a_id == my_id {
            FriendshipStatus::BlockedByA
        } else {
            FriendshipStatus::BlockedByB
        };
        database::update_friendship_status(&state.db_pool, &friendship.id, new_status)
            .await
            .map_err(|e| e.to_string())?;
        (friendship.id, false)
    } else {
        let friendship = Friendship {
            id: Scu128::new().to_string(),
            user_a_id: my_id.clone(),
            user_b_id: target_user_id.clone(),
            status: FriendshipStatus::BlockedByA.to_string(),
            created_at: now,
            updated_at: now,
        };
        let friendship_id = friendship.id.clone();
        database::insert_friendship(&state.db_pool, &friendship)
            .await
            .map_err(|e| e.to_string())?;
        (friendship_id, true)
    };

    let friendship =
        database::get_friendship_with_profile_for_user(&state.db_pool, &friendship_id, &my_id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Failed to load friendship details.".to_string())?;

    let block_user_data = BlockUserData {
        blocker_id: my_id.clone(),
        blocked_id: target_user_id.clone(),
    };
    let block_user_bytes = serialize(&block_user_data)?;
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
    let serialized_message = serialize(&aep_message)?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    Ok(BlockUserResult {
        friendship,
        newly_created,
        spam_score,
    })
}

#[tauri::command]
pub async fn unblock_user(
    current_user_id: String,
    friendship_id: String,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<UnblockUserResult> {
    with_state_async(state_container, move |state| {
        let current_user_id = current_user_id.clone();
        let friendship_id = friendship_id.clone();
        async move { unblock_user_internal(state, current_user_id, friendship_id).await }
    })
    .await
}

pub(super) async fn unblock_user_internal(
    state: AppState,
    current_user_id: String,
    friendship_id: String,
) -> CommandResult<UnblockUserResult> {
    let my_id = ensure_caller_identity(&state, &current_user_id)?;

    let friendship = database::get_friendship_by_id(&state.db_pool, &friendship_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Friendship not found.".to_string())?;

    if friendship.user_a_id != my_id && friendship.user_b_id != my_id {
        return Err("Caller identity mismatch".to_string());
    }

    let target_user_id = if friendship.user_a_id == my_id {
        friendship.user_b_id.clone()
    } else {
        friendship.user_a_id.clone()
    };

    database::delete_friendship(&state.db_pool, &friendship.id)
        .await
        .map_err(|e| e.to_string())?;

    let unblock_user_data = UnblockUserData {
        unblocker_id: my_id.clone(),
        unblocked_id: target_user_id.clone(),
    };
    let unblock_user_bytes = serialize(&unblock_user_data)?;
    let signature = state
        .identity
        .keypair()
        .sign(&unblock_user_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::UnblockUser {
        unblocker_id: my_id,
        unblocked_id: target_user_id.clone(),
        signature: Some(signature),
    };
    let serialized_message = serialize(&aep_message)?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    Ok(UnblockUserResult {
        removed_friendship_id: friendship_id,
        target_user_id,
    })
}

#[tauri::command]
pub async fn mute_user(
    current_user_id: String,
    target_user_id: String,
    muted: bool,
    spam_score: Option<f32>,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<MuteUserResult> {
    with_state_async(state_container, move |state| {
        let current_user_id = current_user_id.clone();
        let target_user_id = target_user_id.clone();
        async move {
            mute_user_internal(state, current_user_id, target_user_id, muted, spam_score).await
        }
    })
    .await
}

#[tauri::command]
pub async fn ignore_user(
    current_user_id: String,
    target_user_id: String,
    ignored: bool,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<IgnoreUserResult> {
    with_state_async(state_container, move |state| {
        let current_user_id = current_user_id.clone();
        let target_user_id = target_user_id.clone();
        async move { ignore_user_internal(state, current_user_id, target_user_id, ignored).await }
    })
    .await
}

pub(super) async fn mute_user_internal(
    state: AppState,
    current_user_id: String,
    target_user_id: String,
    muted: bool,
    spam_score: Option<f32>,
) -> CommandResult<MuteUserResult> {
    let my_id = ensure_caller_identity(&state, &current_user_id)?;

    if my_id == target_user_id {
        return Err("Cannot mute yourself.".to_string());
    }

    if let Some(score) = spam_score {
        tracing::info!(
            target_user_id = %target_user_id,
            spam_score = score,
            "mute_user invoked with spam score"
        );
    }

    Ok(MuteUserResult {
        target_user_id,
        muted,
        spam_score,
    })
}

pub(super) async fn ignore_user_internal(
    state: AppState,
    current_user_id: String,
    target_user_id: String,
    ignored: bool,
) -> CommandResult<IgnoreUserResult> {
    let my_id = ensure_caller_identity(&state, &current_user_id)?;

    if my_id == target_user_id {
        return Err("Cannot ignore yourself.".to_string());
    }

    Ok(IgnoreUserResult {
        target_user_id,
        ignored,
    })
}
