#![cfg(test)]

use super::moderation::{
    block_user_internal, ignore_user_internal, mute_user_internal, unblock_user_internal,
};
use super::relationships::get_friendships_for_user_internal;
use aegis_shared_types::{
    AppState, FileAclPolicy, IncomingFile, PendingDeviceProvisioning, TrustedDeviceRecord, User,
};
use aep::database::FriendshipStatus;
use aep::{database, user_service};
use bs58;
use chrono::Utc;
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
    let app_data_dir = temp_dir.keep();
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
        pending_device_bundles: Arc::new(Mutex::new(
            HashMap::<String, PendingDeviceProvisioning>::new(),
        )),
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
    let db_pool = database::initialize_db(temp.path().join("block.db"))
        .await
        .expect("init db");

    let identity = Identity::generate();
    let my_id = identity.peer_id().to_base58();
    let public_key = bs58::encode(identity.keypair().public().to_protobuf_encoding()).into_string();
    let target_id = Uuid::new_v4().to_string();

    let me = User {
        id: my_id.clone(),
        username: "Me".into(),
        avatar: "avatar".into(),
        is_online: true,
        public_key: Some(public_key.clone()),
        bio: None,
        tag: None,
        status_message: None,
        location: None,
    };
    let target = User {
        id: target_id.clone(),
        username: "Target".into(),
        avatar: "avatar".into(),
        is_online: true,
        public_key: Some(public_key),
        bio: None,
        tag: None,
        status_message: None,
        location: None,
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
    let db_pool = database::initialize_db(temp.path().join("mute.db"))
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
    let db_pool = database::initialize_db(temp.path().join("ignore.db"))
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
    let db_pool = database::initialize_db(temp.path().join("friends_for_user.db"))
        .await
        .expect("init db");

    let identity = Identity::generate();
    let my_id = identity.peer_id().to_base58();
    let target_id = Uuid::new_v4().to_string();
    let mutual_friend_id = Uuid::new_v4().to_string();
    let pending_friend_id = Uuid::new_v4().to_string();

    let now = Utc::now();

    let mutual_friendship = database::Friendship {
        id: Uuid::new_v4().to_string(),
        user_a_id: target_id.clone(),
        user_b_id: mutual_friend_id.clone(),
        status: FriendshipStatus::Accepted.to_string(),
        created_at: now,
        updated_at: now,
    };

    let pending_friendship = database::Friendship {
        id: Uuid::new_v4().to_string(),
        user_a_id: target_id.clone(),
        user_b_id: pending_friend_id,
        status: FriendshipStatus::Pending.to_string(),
        created_at: now,
        updated_at: now,
    };

    let direct_friendship = database::Friendship {
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

    let sanitized = get_friendships_for_user_internal(app_state, my_id.clone(), target_id.clone())
        .await
        .expect("fetch sanitized friendships");

    assert_eq!(sanitized, vec![mutual_friend_id]);
}

#[tokio::test]
async fn get_friendships_for_user_internal_requires_accepted_friendship() {
    let temp = tempdir().expect("tempdir");
    let db_pool = database::initialize_db(temp.path().join("friends_for_user_denied.db"))
        .await
        .expect("init db");

    let identity = Identity::generate();
    let my_id = identity.peer_id().to_base58();
    let target_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    let pending_friendship = database::Friendship {
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
