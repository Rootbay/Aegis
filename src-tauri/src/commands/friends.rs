use crate::commands::state::AppStateContainer;
use aegis_protocol::AepMessage;
use aegis_shared_types::AppState;
use aep::database::{self, Friendship, FriendshipStatus};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockUserResult {
    pub friendship: database::FriendshipWithProfile,
    pub newly_created: bool,
    pub spam_score: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnblockUserResult {
    pub removed_friendship_id: String,
    pub target_user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MuteUserResult {
    pub target_user_id: String,
    pub muted: bool,
    pub spam_score: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgnoreUserResult {
    pub target_user_id: String,
    pub ignored: bool,
}

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
    spam_score: Option<f32>,
    state_container: State<'_, AppStateContainer>,
) -> Result<BlockUserResult, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    block_user_internal(state, current_user_id, target_user_id, spam_score).await
}

async fn block_user_internal(
    state: AppState,
    current_user_id: String,
    target_user_id: String,
    spam_score: Option<f32>,
) -> Result<BlockUserResult, String> {
    let my_id = state.identity.peer_id().to_base58();
    if current_user_id != my_id {
        return Err("Caller identity mismatch".to_string());
    }

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
            id: Uuid::new_v4().to_string(),
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
) -> Result<UnblockUserResult, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    unblock_user_internal(state, current_user_id, friendship_id).await
}

async fn unblock_user_internal(
    state: AppState,
    current_user_id: String,
    friendship_id: String,
) -> Result<UnblockUserResult, String> {
    let my_id = state.identity.peer_id().to_base58();
    if current_user_id != my_id {
        return Err("Caller identity mismatch".to_string());
    }

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

    let unblock_user_data = aegis_protocol::UnblockUserData {
        unblocker_id: my_id.clone(),
        unblocked_id: target_user_id.clone(),
    };
    let unblock_user_bytes = bincode::serialize(&unblock_user_data).map_err(|e| e.to_string())?;
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
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
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
) -> Result<MuteUserResult, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    mute_user_internal(state, current_user_id, target_user_id, muted, spam_score).await
}

#[tauri::command]
pub async fn ignore_user(
    current_user_id: String,
    target_user_id: String,
    ignored: bool,
    state_container: State<'_, AppStateContainer>,
) -> Result<IgnoreUserResult, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    ignore_user_internal(state, current_user_id, target_user_id, ignored).await
}

async fn ignore_user_internal(
    state: AppState,
    current_user_id: String,
    target_user_id: String,
    ignored: bool,
) -> Result<IgnoreUserResult, String> {
    let my_id = state.identity.peer_id().to_base58();
    if current_user_id != my_id {
        return Err("Caller identity mismatch".to_string());
    }

    if current_user_id == target_user_id {
        return Err("Cannot ignore yourself.".to_string());
    }

    Ok(IgnoreUserResult {
        target_user_id,
        ignored,
    })
}

async fn mute_user_internal(
    state: AppState,
    current_user_id: String,
    target_user_id: String,
    muted: bool,
    spam_score: Option<f32>,
) -> Result<MuteUserResult, String> {
    let my_id = state.identity.peer_id().to_base58();
    if current_user_id != my_id {
        return Err("Caller identity mismatch".to_string());
    }

    if current_user_id == target_user_id {
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
) -> Result<Vec<database::FriendshipWithProfile>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    let my_id = state.identity.peer_id().to_base58();
    if current_user_id != my_id {
        return Err("Caller identity mismatch".into());
    }
    database::get_friendships_with_profiles(&state.db_pool, &my_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_friendships_for_user(
    current_user_id: String,
    target_user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<String>, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    get_friendships_for_user_internal(state, current_user_id, target_user_id).await
}

async fn get_friendships_for_user_internal(
    state: AppState,
    current_user_id: String,
    target_user_id: String,
) -> Result<Vec<String>, String> {
    let my_id = state.identity.peer_id().to_base58();
    if current_user_id != my_id {
        return Err("Caller identity mismatch".into());
    }

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

#[cfg(test)]
mod tests {
    use super::*;
    use aegis_shared_types::{
        AppState,
        FileAclPolicy,
        IncomingFile,
        PendingDeviceProvisioning,
        TrustedDeviceRecord,
        User,
    };
    use aep::user_service;
    use bs58;
    use crypto::identity::Identity;
    use std::collections::HashMap;
    use std::sync::{atomic::AtomicBool, Arc};
    use tempfile::tempdir;
    use tokio::sync::Mutex;
    use tokio::time::{timeout, Duration};
    use uuid::Uuid;

    fn build_app_state(
        identity: Identity,
        db_pool: sqlx::Pool<sqlx::Sqlite>,
    ) -> (AppState, tokio::sync::mpsc::Receiver<Vec<u8>>) {
        let (network_tx, network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let temp_dir = tempdir().expect("tempdir");
        let app_data_dir = temp_dir.into_path();
        let app_state = AppState {
            identity,
            network_tx,
            db_pool,
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
            app_data_dir,
            connectivity_snapshot: Arc::new(Mutex::new(None)),
            voice_memos_enabled: Arc::new(AtomicBool::new(true)),
            relays: Arc::new(Mutex::new(Vec::new())),
            trusted_devices: Arc::new(Mutex::new(Vec::<TrustedDeviceRecord>::new())),
            pending_device_bundles: Arc::new(Mutex::new(HashMap::<
                String,
                PendingDeviceProvisioning,
            >::new())),
        };
        (app_state, network_rx)
    }

    async fn seed_users(db_pool: &sqlx::Pool<sqlx::Sqlite>, me: &User, target: &User) {
        user_service::insert_user(db_pool, me)
            .await
            .expect("insert me");
        user_service::insert_user(db_pool, target)
            .await
            .expect("insert target");
    }

    #[tokio::test]
    async fn block_and_unblock_friend_flow_updates_status() {
        let temp = tempdir().expect("tempdir");
        let db_pool = aep::database::initialize_db(temp.path().join("block.db"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let my_id = identity.peer_id().to_base58();
        let public_key =
            bs58::encode(identity.keypair().public().to_protobuf_encoding()).into_string();
        let target_id = Uuid::new_v4().to_string();

        let me = User {
            id: my_id.clone(),
            username: "Me".into(),
            avatar: "avatar".into(),
            is_online: true,
            public_key: Some(public_key.clone()),
            bio: None,
            tag: None,
        };
        let target = User {
            id: target_id.clone(),
            username: "Target".into(),
            avatar: "avatar".into(),
            is_online: true,
            public_key: Some(public_key),
            bio: None,
            tag: None,
        };

        seed_users(&db_pool, &me, &target).await;

        let (app_state, mut network_rx) = build_app_state(identity.clone(), db_pool.clone());

        let block_result =
            block_user_internal(app_state.clone(), my_id.clone(), target_id.clone(), None)
                .await
                .expect("block user");

        assert!(block_result.newly_created);
        assert_eq!(
            block_result.friendship.friendship.status,
            FriendshipStatus::BlockedByA.to_string()
        );
        assert!(block_result.spam_score.is_none());

        let message = timeout(Duration::from_millis(250), network_rx.recv())
            .await
            .expect("block broadcast")
            .expect("block message");
        assert!(!message.is_empty());

        let unblock_result = unblock_user_internal(
            app_state.clone(),
            my_id.clone(),
            block_result.friendship.friendship.id.clone(),
        )
        .await
        .expect("unblock user");

        assert_eq!(unblock_result.target_user_id, target_id);

        let message = timeout(Duration::from_millis(250), network_rx.recv())
            .await
            .expect("unblock broadcast")
            .expect("unblock message");
        assert!(!message.is_empty());
    }

    #[tokio::test]
    async fn mute_user_internal_validates_identity() {
        let temp = tempdir().expect("tempdir");
        let db_pool = aep::database::initialize_db(temp.path().join("mute.db"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let my_id = identity.peer_id().to_base58();
        let target_id = Uuid::new_v4().to_string();

        let (app_state, _rx) = build_app_state(identity.clone(), db_pool);

        let result = mute_user_internal(app_state, my_id.clone(), target_id.clone(), true, None)
            .await
            .expect("mute user");

        assert!(result.muted);
        assert_eq!(result.target_user_id, target_id);
        assert!(result.spam_score.is_none());
    }

    #[tokio::test]
    async fn ignore_user_internal_validates_identity() {
        let temp = tempdir().expect("tempdir");
        let db_pool = aep::database::initialize_db(temp.path().join("ignore.db"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let my_id = identity.peer_id().to_base58();
        let target_id = Uuid::new_v4().to_string();

        let (app_state, _rx) = build_app_state(identity.clone(), db_pool);

        let result = ignore_user_internal(app_state, my_id.clone(), target_id.clone(), true)
            .await
            .expect("ignore user");

        assert!(result.ignored);
        assert_eq!(result.target_user_id, target_id);
    }

    #[tokio::test]
    async fn get_friendships_for_user_internal_returns_sanitized_ids() {
        let temp = tempdir().expect("tempdir");
        let db_pool = aep::database::initialize_db(temp.path().join("friends_for_user.db"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let my_id = identity.peer_id().to_base58();
        let target_id = Uuid::new_v4().to_string();
        let mutual_friend_id = Uuid::new_v4().to_string();
        let pending_friend_id = Uuid::new_v4().to_string();

        let now = Utc::now();

        let mutual_friendship = Friendship {
            id: Uuid::new_v4().to_string(),
            user_a_id: target_id.clone(),
            user_b_id: mutual_friend_id.clone(),
            status: FriendshipStatus::Accepted.to_string(),
            created_at: now,
            updated_at: now,
        };

        let pending_friendship = Friendship {
            id: Uuid::new_v4().to_string(),
            user_a_id: target_id.clone(),
            user_b_id: pending_friend_id,
            status: FriendshipStatus::Pending.to_string(),
            created_at: now,
            updated_at: now,
        };

        let direct_friendship = Friendship {
            id: Uuid::new_v4().to_string(),
            user_a_id: my_id.clone(),
            user_b_id: target_id.clone(),
            status: FriendshipStatus::Accepted.to_string(),
            created_at: now,
            updated_at: now,
        };

        database::insert_friendship(&db_pool, &mutual_friendship)
            .await
            .expect("insert mutual friendship");
        database::insert_friendship(&db_pool, &pending_friendship)
            .await
            .expect("insert pending friendship");
        database::insert_friendship(&db_pool, &direct_friendship)
            .await
            .expect("insert direct friendship");

        let (app_state, _rx) = build_app_state(identity, db_pool);

        let sanitized =
            get_friendships_for_user_internal(app_state, my_id.clone(), target_id.clone())
                .await
                .expect("fetch sanitized friendships");

        assert_eq!(sanitized, vec![mutual_friend_id]);
    }

    #[tokio::test]
    async fn get_friendships_for_user_internal_requires_accepted_friendship() {
        let temp = tempdir().expect("tempdir");
        let db_pool = aep::database::initialize_db(temp.path().join("friends_for_user_denied.db"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let my_id = identity.peer_id().to_base58();
        let target_id = Uuid::new_v4().to_string();
        let now = Utc::now();

        let pending_friendship = Friendship {
            id: Uuid::new_v4().to_string(),
            user_a_id: my_id.clone(),
            user_b_id: target_id.clone(),
            status: FriendshipStatus::Pending.to_string(),
            created_at: now,
            updated_at: now,
        };

        database::insert_friendship(&db_pool, &pending_friendship)
            .await
            .expect("insert pending friendship");

        let (app_state, _rx) = build_app_state(identity, db_pool);

        let result = get_friendships_for_user_internal(app_state, my_id, target_id).await;

        assert!(result.is_err());
    }
}
