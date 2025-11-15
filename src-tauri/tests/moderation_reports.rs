use aegis_lib::commands::moderation::{report_message_internal, ReportMessagePayload};
use aegis_lib::commands::state::AppStateContainer;
use aegis_shared_types::{
    AppState, ConnectivityEventPayload, FileAclPolicy, FileTransferCommand, IncomingFile,
};
use chrono::Utc;
use crypto::identity::Identity;
use serde_json::Value;
use sqlx::Row;
use std::collections::HashMap;
use std::sync::{atomic::AtomicBool, Arc};
use tempfile::tempdir;
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

#[tokio::test]
async fn report_message_command_persists_report_with_context() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("reports.db");
    let pool = aep::database::initialize_db(db_path)
        .await
        .expect("initialize db");

    let applied_migrations: Vec<String> =
        sqlx::query("SELECT version FROM __sqlx_migrations ORDER BY applied_on")
            .map(|row: sqlx::sqlite::SqliteRow| row.get("version"))
            .fetch_all(&pool)
            .await
            .expect("fetch migrations");
    println!("applied migrations: {:?}", applied_migrations);

    let reporter_identity = Identity::generate();
    let reporter_id = reporter_identity.peer_id().to_base58();
    let author_id = Uuid::new_v4().to_string();
    let message_id = Uuid::new_v4().to_string();
    let chat_id = Uuid::new_v4().to_string();
    let message_timestamp = Utc::now().to_rfc3339();

    sqlx::query!(
        "INSERT INTO users (id, username, avatar, is_online, public_key, bio, tag) VALUES (?, ?, ?, ?, ?, ?, ?)",
        reporter_id,
        "reporter",
        "reporter.png",
        false,
        Option::<String>::None,
        Option::<String>::None,
        Option::<String>::None,
    )
    .execute(&pool)
    .await
    .expect("insert reporter");

    sqlx::query!(
        "INSERT INTO users (id, username, avatar, is_online, public_key, bio, tag) VALUES (?, ?, ?, ?, ?, ?, ?)",
        author_id,
        "author",
        "author.png",
        false,
        Option::<String>::None,
        Option::<String>::None,
        Option::<String>::None,
    )
    .execute(&pool)
    .await
    .expect("insert author");

    sqlx::query!(
        "INSERT INTO messages (id, chat_id, sender_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)",
        message_id,
        chat_id,
        author_id,
        "Offensive message",
        message_timestamp,
        false,
    )
    .execute(&pool)
    .await
    .expect("insert message");

    let (network_tx, _network_rx) = tokio::sync::mpsc::channel(8);
    let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel::<FileTransferCommand>(8);

    let state = AppState {
        identity: reporter_identity.clone(),
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
        pending_device_bundles: Arc::new(AsyncMutex::new(HashMap::new())),
    };

    let state_container = AppStateContainer(Arc::new(AsyncMutex::new(Some(state))));

    let surrounding_ids = vec![Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];

    report_message_internal(
        ReportMessagePayload {
            message_id: message_id.clone(),
            reason: "harassment".to_string(),
            description: "Message violates community guidelines".to_string(),
            chat_id: Some(chat_id.clone()),
            chat_type: Some("channel".to_string()),
            chat_name: Some("General".to_string()),
            message_author_id: Some(author_id.clone()),
            message_author_name: Some("Author".to_string()),
            message_excerpt: Some("Offensive message".to_string()),
            message_timestamp: Some(message_timestamp.clone()),
            surrounding_message_ids: Some(surrounding_ids.clone()),
        },
        &state_container,
    )
    .await
    .expect("report message");

    let stored = sqlx::query!(
        "SELECT reporter_id, message_id, reason, description, chat_id, chat_type, chat_name, message_author_id, message_author_name, message_excerpt, message_timestamp, context_json FROM message_reports WHERE message_id = ?",
        message_id
    )
    .fetch_one(&pool)
    .await
    .expect("fetch report");

    assert_eq!(stored.reporter_id, reporter_id);
    assert_eq!(stored.message_id, message_id);
    assert_eq!(stored.reason, "harassment");
    assert_eq!(stored.description, "Message violates community guidelines");
    assert_eq!(stored.chat_id, Some(chat_id));
    assert_eq!(stored.chat_type, Some("channel".to_string()));
    assert_eq!(stored.chat_name, Some("General".to_string()));
    assert_eq!(stored.message_author_id, Some(author_id));
    assert_eq!(stored.message_author_name, Some("Author".to_string()));
    assert_eq!(
        stored.message_excerpt,
        Some("Offensive message".to_string())
    );
    assert_eq!(stored.message_timestamp, Some(message_timestamp));

    let context = stored.context_json.expect("context json");
    let value: Value = serde_json::from_str(&context).expect("parse context");
    let ids = value
        .get("surrounding_message_ids")
        .and_then(|v| v.as_array())
        .expect("array");
    let extracted: Vec<String> = ids
        .iter()
        .map(|entry| entry.as_str().expect("string").to_string())
        .collect();
    assert_eq!(extracted, surrounding_ids);
}
