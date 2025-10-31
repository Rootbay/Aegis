use super::{
    ensure_server_owner, get_initialized_state, sanitize_optional_string, sanitize_required_string,
};
use crate::commands::state::AppStateContainer;
use aep::database::{self, ServerWebhook, ServerWebhookPatch};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerWebhookResponse {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<ServerWebhook> for ServerWebhookResponse {
    fn from(value: ServerWebhook) -> Self {
        ServerWebhookResponse {
            id: value.id,
            server_id: value.server_id,
            name: value.name,
            url: value.url,
            channel_id: value.channel_id,
            created_by: value.created_by,
            created_at: value.created_at.to_rfc3339(),
            updated_at: value.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateServerWebhookRequest {
    pub server_id: String,
    pub name: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateServerWebhookRequest {
    pub webhook_id: String,
    pub server_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteServerWebhookRequest {
    pub webhook_id: String,
    pub server_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteServerWebhookResponse {
    pub webhook_id: String,
    pub server_id: String,
}

async fn create_server_webhook_internal(
    state: aegis_shared_types::AppState,
    request: CreateServerWebhookRequest,
) -> Result<ServerWebhook, String> {
    let name = sanitize_required_string(&request.name, "Webhook name")?;
    let url = sanitize_required_string(&request.url, "Webhook URL")?;

    ensure_server_owner(&state, &request.server_id).await?;

    let creator = state.identity.peer_id().to_base58();
    let now = Utc::now();
    let webhook = ServerWebhook {
        id: uuid::Uuid::new_v4().to_string(),
        server_id: request.server_id.clone(),
        name,
        url,
        channel_id: sanitize_optional_string(request.channel_id.clone()),
        created_by: creator,
        created_at: now,
        updated_at: now,
    };

    database::insert_server_webhook(&state.db_pool, &webhook)
        .await
        .map_err(|e| e.to_string())?;

    Ok(webhook)
}

async fn update_server_webhook_internal(
    state: aegis_shared_types::AppState,
    request: UpdateServerWebhookRequest,
) -> Result<ServerWebhook, String> {
    let existing = database::get_server_webhook_by_id(&state.db_pool, &request.webhook_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Webhook not found.".to_string())?;

    if existing.server_id != request.server_id {
        return Err("Webhook does not belong to the specified server.".into());
    }

    ensure_server_owner(&state, &existing.server_id).await?;

    let mut patch = ServerWebhookPatch::default();

    if let Some(name) = request.name {
        let sanitized = sanitize_required_string(&name, "Webhook name")?;
        patch.name = Some(sanitized);
    }

    if let Some(url) = request.url {
        let sanitized = sanitize_required_string(&url, "Webhook URL")?;
        patch.url = Some(sanitized);
    }

    if let Some(channel_id) = request.channel_id {
        patch.channel_id = Some(sanitize_optional_string(channel_id));
    }

    patch.updated_at = Some(Utc::now());

    database::update_server_webhook(&state.db_pool, &request.webhook_id, patch)
        .await
        .map_err(|e| e.to_string())
}

async fn delete_server_webhook_internal(
    state: aegis_shared_types::AppState,
    request: DeleteServerWebhookRequest,
) -> Result<ServerWebhook, String> {
    let existing = database::get_server_webhook_by_id(&state.db_pool, &request.webhook_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Webhook not found.".to_string())?;

    if existing.server_id != request.server_id {
        return Err("Webhook does not belong to the specified server.".into());
    }

    ensure_server_owner(&state, &existing.server_id).await?;

    database::delete_server_webhook(&state.db_pool, &request.webhook_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(existing)
}

#[tauri::command]
pub async fn list_server_webhooks(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<ServerWebhookResponse>, String> {
    let state = get_initialized_state(&state_container).await?;
    ensure_server_owner(&state, &server_id).await?;

    let webhooks = database::list_server_webhooks(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(webhooks
        .into_iter()
        .map(ServerWebhookResponse::from)
        .collect())
}

#[tauri::command]
pub async fn create_server_webhook(
    request: CreateServerWebhookRequest,
    state_container: State<'_, AppStateContainer>,
    app: AppHandle,
) -> Result<ServerWebhookResponse, String> {
    let state = get_initialized_state(&state_container).await?;
    let webhook = create_server_webhook_internal(state.clone(), request).await?;
    let response: ServerWebhookResponse = webhook.into();
    app.emit("server-webhook-created", response.clone())
        .map_err(|e| e.to_string())?;
    Ok(response)
}

#[tauri::command]
pub async fn update_server_webhook(
    request: UpdateServerWebhookRequest,
    state_container: State<'_, AppStateContainer>,
    app: AppHandle,
) -> Result<ServerWebhookResponse, String> {
    let state = get_initialized_state(&state_container).await?;
    let webhook = update_server_webhook_internal(state.clone(), request).await?;
    let response: ServerWebhookResponse = webhook.into();
    app.emit("server-webhook-updated", response.clone())
        .map_err(|e| e.to_string())?;
    Ok(response)
}

#[tauri::command]
pub async fn delete_server_webhook(
    request: DeleteServerWebhookRequest,
    state_container: State<'_, AppStateContainer>,
    app: AppHandle,
) -> Result<DeleteServerWebhookResponse, String> {
    let state = get_initialized_state(&state_container).await?;
    let webhook = delete_server_webhook_internal(state.clone(), request).await?;
    let response = DeleteServerWebhookResponse {
        webhook_id: webhook.id,
        server_id: webhook.server_id,
    };
    app.emit("server-webhook-deleted", response.clone())
        .map_err(|e| e.to_string())?;
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use aegis_shared_types::{
        AppState, FileAclPolicy, FileTransferCommand, IncomingFile, PendingDeviceProvisioning,
        RelayRecord, Server, TrustedDeviceRecord,
    };
    use aep::database::Channel;
    use chrono::Utc;
    use crypto::identity::Identity;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    use tempfile::tempdir;
    use tokio::sync::{mpsc, Mutex};

    fn build_app_state(identity: Identity, db_pool: sqlx::SqlitePool) -> AppState {
        let (network_tx, _network_rx) = mpsc::channel::<Vec<u8>>(8);
        let (file_cmd_tx, _file_cmd_rx) = mpsc::channel::<FileTransferCommand>(8);
        let temp_dir = tempdir().expect("tempdir");
        let app_data_dir: PathBuf = temp_dir.into_path();

        AppState {
            identity,
            network_tx,
            db_pool,
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
            app_data_dir,
            connectivity_snapshot: Arc::new(Mutex::new(None)),
            voice_memos_enabled: Arc::new(AtomicBool::new(true)),
            relays: Arc::new(Mutex::new(Vec::<RelayRecord>::new())),
            trusted_devices: Arc::new(Mutex::new(Vec::<TrustedDeviceRecord>::new())),
            pending_device_bundles: Arc::new(Mutex::new(HashMap::<
                String,
                PendingDeviceProvisioning,
            >::new())),
        }
    }

    async fn seed_server(db_pool: &sqlx::SqlitePool, owner_id: &str) -> Server {
        let server = Server {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Test Server".into(),
            owner_id: owner_id.to_string(),
            created_at: Utc::now(),
            icon_url: None,
            description: None,
            default_channel_id: None,
            allow_invites: Some(true),
            moderation_level: None,
            explicit_content_filter: Some(false),
            transparent_edits: Some(false),
            deleted_message_display: Some("ghost".into()),
            read_receipts_enabled: Some(true),
            channels: Vec::new(),
            categories: Vec::new(),
            members: Vec::new(),
            roles: Vec::new(),
            invites: Vec::new(),
        };

        database::insert_server(db_pool, &server)
            .await
            .expect("insert server");
        database::add_server_member(db_pool, &server.id, owner_id)
            .await
            .expect("add member");

        server
    }

    #[tokio::test]
    async fn create_webhook_persists_record() {
        let temp_dir = tempdir().expect("tempdir");
        let db_path = temp_dir.path().join("webhooks.db");
        let db_pool = aep::database::initialize_db(db_path)
            .await
            .expect("init db");

        let identity = Identity::generate();
        let owner_id = identity.peer_id().to_base58();
        let state = build_app_state(identity.clone(), db_pool.clone());
        let server = seed_server(&db_pool, &owner_id).await;

        let request = CreateServerWebhookRequest {
            server_id: server.id.clone(),
            name: "Build Notifications".into(),
            url: "https://hooks.example.com/build".into(),
            channel_id: None,
        };

        let webhook = create_server_webhook_internal(state.clone(), request)
            .await
            .expect("create webhook");

        assert_eq!(webhook.server_id, server.id);
        assert_eq!(webhook.name, "Build Notifications");
    }

    #[tokio::test]
    async fn update_webhook_applies_changes() {
        let temp_dir = tempdir().expect("tempdir");
        let db_path = temp_dir.path().join("webhooks-update.db");
        let db_pool = aep::database::initialize_db(db_path)
            .await
            .expect("init db");

        let identity = Identity::generate();
        let owner_id = identity.peer_id().to_base58();
        let state = build_app_state(identity.clone(), db_pool.clone());
        let server = seed_server(&db_pool, &owner_id).await;

        let channel = Channel {
            id: uuid::Uuid::new_v4().to_string(),
            server_id: server.id.clone(),
            name: "alerts".into(),
            channel_type: "text".into(),
            private: false,
            category_id: None,
        };
        database::insert_channel(&db_pool, &channel)
            .await
            .expect("insert channel");

        let create_request = CreateServerWebhookRequest {
            server_id: server.id.clone(),
            name: "Build Notifications".into(),
            url: "https://hooks.example.com/build".into(),
            channel_id: Some(channel.id.clone()),
        };

        let webhook = create_server_webhook_internal(state.clone(), create_request)
            .await
            .expect("create webhook");

        let update_request = UpdateServerWebhookRequest {
            webhook_id: webhook.id.clone(),
            server_id: server.id.clone(),
            name: Some("Build Updates".into()),
            url: None,
            channel_id: Some(None),
        };

        let updated = update_server_webhook_internal(state.clone(), update_request)
            .await
            .expect("update webhook");

        assert_eq!(updated.name, "Build Updates");
        assert!(updated.channel_id.is_none());
    }

    #[tokio::test]
    async fn delete_webhook_removes_record() {
        let temp_dir = tempdir().expect("tempdir");
        let db_path = temp_dir.path().join("webhooks-delete.db");
        let db_pool = aep::database::initialize_db(db_path)
            .await
            .expect("init db");

        let identity = Identity::generate();
        let owner_id = identity.peer_id().to_base58();
        let state = build_app_state(identity.clone(), db_pool.clone());
        let server = seed_server(&db_pool, &owner_id).await;

        let create_request = CreateServerWebhookRequest {
            server_id: server.id.clone(),
            name: "Cleanup".into(),
            url: "https://hooks.example.com/cleanup".into(),
            channel_id: None,
        };

        let webhook = create_server_webhook_internal(state.clone(), create_request)
            .await
            .expect("create webhook");

        let delete_request = DeleteServerWebhookRequest {
            webhook_id: webhook.id.clone(),
            server_id: server.id.clone(),
        };

        let removed = delete_server_webhook_internal(state.clone(), delete_request)
            .await
            .expect("delete webhook");

        assert_eq!(removed.id, webhook.id);

        let lookup = database::get_server_webhook_by_id(&db_pool, &webhook.id)
            .await
            .expect("lookup webhook");
        assert!(lookup.is_none());
    }

    #[tokio::test]
    async fn create_webhook_rejects_empty_name() {
        let temp_dir = tempdir().expect("tempdir");
        let db_path = temp_dir.path().join("webhooks-invalid.db");
        let db_pool = aep::database::initialize_db(db_path)
            .await
            .expect("init db");

        let identity = Identity::generate();
        let owner_id = identity.peer_id().to_base58();
        let state = build_app_state(identity.clone(), db_pool.clone());
        let server = seed_server(&db_pool, &owner_id).await;

        let create_request = CreateServerWebhookRequest {
            server_id: server.id.clone(),
            name: "   ".into(),
            url: "https://hooks.example.com/invalid".into(),
            channel_id: None,
        };

        let result = create_server_webhook_internal(state.clone(), create_request).await;
        assert!(result.is_err());
    }
}
