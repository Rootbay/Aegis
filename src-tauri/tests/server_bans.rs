use aegis_lib::commands::servers::{
    ban_server_member, list_server_bans, unban_server_member, ServerBanUpdate,
};
use aegis_lib::commands::state::AppStateContainer;
use aegis_shared_types::{
    AppState, ConnectivityEventPayload, FileAclPolicy, FileTransferCommand, IncomingFile,
};
use chrono::Utc;
use crypto::identity::Identity;
use std::collections::HashMap;
use std::sync::{atomic::AtomicBool, Arc};
use std::time::Duration;
use tauri::{test::mock_app, Listener, State};
use tempfile::tempdir;
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

#[tokio::test]
async fn ban_command_persists_ban_and_emits_event() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("bans.db");
    let pool = aep::database::initialize_db(db_path)
        .await
        .expect("initialize db");

    let identity = Identity::generate();
    let owner_id = identity.peer_id().to_base58();
    let target_id = Uuid::new_v4().to_string();
    let server_id = Uuid::new_v4().to_string();

    sqlx::query!(
        "INSERT INTO users (id, username, avatar, is_online, public_key, bio, tag) VALUES (?, ?, ?, ?, ?, ?, ?)",
        owner_id,
        "owner",
        "avatar.png",
        false,
        Option::<String>::None,
        Option::<String>::None,
        Option::<String>::None,
    )
    .execute(&pool)
    .await
    .expect("insert owner");

    sqlx::query!(
        "INSERT INTO users (id, username, avatar, is_online, public_key, bio, tag) VALUES (?, ?, ?, ?, ?, ?, ?)",
        target_id,
        "member",
        "avatar.png",
        false,
        Option::<String>::None,
        Option::<String>::None,
        Option::<String>::None,
    )
    .execute(&pool)
    .await
    .expect("insert member");

    sqlx::query!(
        "INSERT INTO servers (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)",
        server_id,
        "Test Server",
        owner_id,
        Utc::now().to_rfc3339(),
    )
    .execute(&pool)
    .await
    .expect("insert server");

    sqlx::query!(
        "INSERT INTO server_members (server_id, user_id) VALUES (?, ?)",
        server_id,
        target_id,
    )
    .execute(&pool)
    .await
    .expect("insert member");

    let (network_tx, _network_rx) = tokio::sync::mpsc::channel(8);
    let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel::<FileTransferCommand>(8);
    let state = AppState {
        identity: identity.clone(),
        network_tx,
        db_pool: pool.clone(),
        incoming_files: Arc::new(AsyncMutex::new(HashMap::<String, IncomingFile>::new())),
        file_cmd_tx,
        file_acl_policy: Arc::new(AsyncMutex::new(FileAclPolicy::Everyone)),
        app_data_dir: dir.path().to_path_buf(),
        connectivity_snapshot: Arc::new(AsyncMutex::new(None::<ConnectivityEventPayload>)),
        voice_memos_enabled: Arc::new(AtomicBool::new(false)),
        relays: Arc::new(AsyncMutex::new(Vec::new())),
        trusted_devices: Arc::new(AsyncMutex::new(Vec::new())),
        pending_device_bundles: Arc::new(AsyncMutex::new(HashMap::<
            String,
            aegis_shared_types::PendingDeviceProvisioning,
        >::new())),
    };

    let state_container = AppStateContainer(Arc::new(AsyncMutex::new(Some(state))));

    let app = mock_app();
    let app_handle = app.handle();

    let (event_tx, event_rx) = std::sync::mpsc::channel::<String>();
    let listener_id = app_handle.listen("server-member-banned", move |event| {
        if let Some(payload) = event.payload() {
            let _ = event_tx.send(payload.to_string());
        }
    });

    let bans_before = list_server_bans(server_id.clone(), State(&state_container))
        .await
        .expect("list bans before");
    assert!(bans_before.is_empty());

    let payload = ban_server_member(
        server_id.clone(),
        target_id.clone(),
        Some("  Spamming  ".to_string()),
        State(&state_container),
        app_handle.clone(),
    )
    .await
    .expect("ban member");

    assert_eq!(payload.server_id, server_id);
    assert_eq!(payload.user_id, target_id);

    let remaining_members: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) as count FROM server_members WHERE server_id = ? AND user_id = ?",
        server_id,
        target_id
    )
    .fetch_one(&pool)
    .await
    .expect("count members");
    assert_eq!(remaining_members, 0);

    let stored_ban = sqlx::query!(
        "SELECT reason FROM server_bans WHERE server_id = ? AND user_id = ?",
        payload.server_id,
        payload.user_id
    )
    .fetch_one(&pool)
    .await
    .expect("fetch ban");
    assert_eq!(stored_ban.reason, Some("Spamming".to_string()));

    let event_payload = event_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("event emitted");
    let event: ServerBanUpdate = serde_json::from_str(&event_payload).expect("parse event");
    assert_eq!(event.server_id, payload.server_id);
    assert_eq!(event.user_id, payload.user_id);

    app_handle.unlisten(listener_id);

    let bans_after = list_server_bans(server_id.clone(), State(&state_container))
        .await
        .expect("list bans after");
    assert_eq!(bans_after.len(), 1);

    let stored_ids: Vec<String> = bans_after.into_iter().map(|user| user.id).collect();
    assert!(stored_ids.contains(&target_id));
}

#[tokio::test]
async fn unban_command_removes_ban_and_emits_event() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("bans.db");
    let pool = aep::database::initialize_db(db_path)
        .await
        .expect("initialize db");

    let identity = Identity::generate();
    let owner_id = identity.peer_id().to_base58();
    let banned_id = Uuid::new_v4().to_string();
    let server_id = Uuid::new_v4().to_string();

    sqlx::query!(
        "INSERT INTO users (id, username, avatar, is_online, public_key, bio, tag) VALUES (?, ?, ?, ?, ?, ?, ?)",
        owner_id,
        "owner",
        "avatar.png",
        false,
        Option::<String>::None,
        Option::<String>::None,
        Option::<String>::None,
    )
    .execute(&pool)
    .await
    .expect("insert owner");

    sqlx::query!(
        "INSERT INTO users (id, username, avatar, is_online, public_key, bio, tag) VALUES (?, ?, ?, ?, ?, ?, ?)",
        banned_id,
        "banned",
        "avatar.png",
        false,
        Option::<String>::None,
        Option::<String>::None,
        Option::<String>::None,
    )
    .execute(&pool)
    .await
    .expect("insert banned user");

    sqlx::query!(
        "INSERT INTO servers (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)",
        server_id,
        "Test Server",
        owner_id,
        Utc::now().to_rfc3339(),
    )
    .execute(&pool)
    .await
    .expect("insert server");

    sqlx::query!(
        "INSERT INTO server_bans (server_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)",
        server_id,
        banned_id,
        Option::<String>::None,
        Utc::now().to_rfc3339(),
    )
    .execute(&pool)
    .await
    .expect("insert ban");

    let (network_tx, _network_rx) = tokio::sync::mpsc::channel(8);
    let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel::<FileTransferCommand>(8);
    let state = AppState {
        identity: identity.clone(),
        network_tx,
        db_pool: pool.clone(),
        incoming_files: Arc::new(AsyncMutex::new(HashMap::<String, IncomingFile>::new())),
        file_cmd_tx,
        file_acl_policy: Arc::new(AsyncMutex::new(FileAclPolicy::Everyone)),
        app_data_dir: dir.path().to_path_buf(),
        connectivity_snapshot: Arc::new(AsyncMutex::new(None::<ConnectivityEventPayload>)),
        voice_memos_enabled: Arc::new(AtomicBool::new(false)),
        relays: Arc::new(AsyncMutex::new(Vec::new())),
        trusted_devices: Arc::new(AsyncMutex::new(Vec::new())),
        pending_device_bundles: Arc::new(AsyncMutex::new(HashMap::<
            String,
            aegis_shared_types::PendingDeviceProvisioning,
        >::new())),
    };

    let state_container = AppStateContainer(Arc::new(AsyncMutex::new(Some(state))));

    let app = mock_app();
    let app_handle = app.handle();

    let (event_tx, event_rx) = std::sync::mpsc::channel::<String>();
    let listener_id = app_handle.listen("server-member-unbanned", move |event| {
        if let Some(payload) = event.payload() {
            let _ = event_tx.send(payload.to_string());
        }
    });

    let bans_before = list_server_bans(server_id.clone(), State(&state_container))
        .await
        .expect("list bans before");
    assert_eq!(bans_before.len(), 1);

    let payload = unban_server_member(
        server_id.clone(),
        banned_id.clone(),
        State(&state_container),
        app_handle.clone(),
    )
    .await
    .expect("unban member");

    assert_eq!(payload.server_id, server_id);
    assert_eq!(payload.user_id, banned_id);

    let remaining: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) as count FROM server_bans WHERE server_id = ? AND user_id = ?",
        payload.server_id,
        payload.user_id
    )
    .fetch_one(&pool)
    .await
    .expect("count bans");
    assert_eq!(remaining, 0);

    let event_payload = event_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("event emitted");
    let event: ServerBanUpdate = serde_json::from_str(&event_payload).expect("parse event");
    assert_eq!(event.server_id, payload.server_id);
    assert_eq!(event.user_id, payload.user_id);

    app_handle.unlisten(listener_id);

    let bans_after = list_server_bans(server_id, State(&state_container))
        .await
        .expect("list bans after");
    assert!(bans_after.is_empty());
}
