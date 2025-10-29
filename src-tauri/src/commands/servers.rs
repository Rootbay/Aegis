use crate::commands::state::AppStateContainer;
use aegis_protocol::AepMessage;
use aegis_shared_types::AppState;
use aep::database;
use aep::database::{
    ChannelCategory, ChannelDisplayPreference, ServerEvent, ServerEventPatch, ServerInvite,
    ServerMetadataUpdate, ServerModerationUpdate, ServerWebhook, ServerWebhookPatch,
};
use aep::user_service;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendServerInviteResult {
    pub server_id: String,
    pub user_id: String,
    pub already_member: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInviteResponse {
    pub id: String,
    pub server_id: String,
    pub code: String,
    pub created_by: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_uses: Option<i64>,
    pub uses: i64,
}

impl From<ServerInvite> for ServerInviteResponse {
    fn from(value: ServerInvite) -> Self {
        ServerInviteResponse {
            id: value.id,
            server_id: value.server_id,
            code: value.code,
            created_by: value.created_by,
            created_at: value.created_at.to_rfc3339(),
            expires_at: value.expires_at.map(|dt| dt.to_rfc3339()),
            max_uses: value.max_uses,
            uses: value.uses,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelDisplayPreferenceResponse {
    pub channel_id: String,
    pub hide_member_names: bool,
}

impl From<ChannelDisplayPreference> for ChannelDisplayPreferenceResponse {
    fn from(value: ChannelDisplayPreference) -> Self {
        ChannelDisplayPreferenceResponse {
            channel_id: value.channel_id,
            hide_member_names: value.hide_member_names,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelCategoryResponse {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub position: i64,
    pub created_at: String,
}

impl From<ChannelCategory> for ChannelCategoryResponse {
    fn from(value: ChannelCategory) -> Self {
        ChannelCategoryResponse {
            id: value.id,
            server_id: value.server_id,
            name: value.name,
            position: value.position,
            created_at: value.created_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerEventResponse {
    pub id: String,
    pub server_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<String>,
    pub scheduled_for: String,
    pub created_by: String,
    pub created_at: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled_at: Option<String>,
}

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
pub struct DeleteServerWebhookResponse {
    pub webhook_id: String,
    pub server_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerBanUpdate {
    pub server_id: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateChannelCategoryRequest {
    pub server_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteChannelCategoryRequest {
    pub server_id: String,
    pub category_id: String,
}

impl From<ServerEvent> for ServerEventResponse {
    fn from(value: ServerEvent) -> Self {
        ServerEventResponse {
            id: value.id,
            server_id: value.server_id,
            title: value.title,
            description: value.description,
            channel_id: value.channel_id,
            scheduled_for: value.scheduled_for.to_rfc3339(),
            created_by: value.created_by,
            created_at: value.created_at.to_rfc3339(),
            status: value.status,
            cancelled_at: value.cancelled_at.map(|dt| dt.to_rfc3339()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateServerEventRequest {
    pub server_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<String>,
    pub scheduled_for: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateServerEventRequest {
    pub event_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_for: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelServerEventRequest {
    pub event_id: String,
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

fn sanitize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn sanitize_required_string(value: &str, field_name: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(format!("{field_name} cannot be empty."))
    } else {
        Ok(trimmed.to_string())
    }
}

fn parse_schedule(value: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|error| format!("Invalid scheduled time: {error}"))
}

async fn ensure_server_owner(state: &AppState, server_id: &str) -> Result<(), String> {
    let server = database::get_server_by_id(&state.db_pool, server_id)
        .await
        .map_err(|e| e.to_string())?;
    let current_user = state.identity.peer_id().to_base58();
    if server.owner_id != current_user {
        return Err("Only the server owner can manage this resource.".into());
    }
    Ok(())
}

async fn create_channel_category_internal(
    state: AppState,
    request: CreateChannelCategoryRequest,
) -> Result<ChannelCategory, String> {
    let name = sanitize_required_string(&request.name, "Category name")?;

    ensure_server_owner(&state, &request.server_id).await?;

    let position = if let Some(position) = request.position {
        position
    } else {
        let categories =
            database::get_channel_categories_for_server(&state.db_pool, &request.server_id)
                .await
                .map_err(|e| e.to_string())?;
        categories
            .iter()
            .map(|category| category.position)
            .max()
            .map(|value| value + 1)
            .unwrap_or(0)
    };

    let category = ChannelCategory {
        id: Uuid::new_v4().to_string(),
        server_id: request.server_id,
        name,
        position,
        created_at: Utc::now().to_rfc3339(),
    };

    database::insert_channel_category(&state.db_pool, &category)
        .await
        .map_err(|e| e.to_string())?;

    Ok(category)
}

async fn delete_channel_category_internal(
    state: AppState,
    request: DeleteChannelCategoryRequest,
) -> Result<ChannelCategory, String> {
    let existing = database::get_channel_category_by_id(&state.db_pool, &request.category_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Category not found.".to_string())?;

    if existing.server_id != request.server_id {
        return Err("Category does not belong to the specified server.".into());
    }

    ensure_server_owner(&state, &existing.server_id).await?;

    database::delete_channel_category(&state.db_pool, &request.category_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(existing)
}

async fn create_server_event_internal(
    state: AppState,
    request: CreateServerEventRequest,
) -> Result<ServerEvent, String> {
    let title = request.title.trim();
    if title.is_empty() {
        return Err("Event title cannot be empty.".into());
    }

    ensure_server_owner(&state, &request.server_id).await?;

    let scheduled_for = parse_schedule(&request.scheduled_for)?;
    let current_user = state.identity.peer_id().to_base58();
    let event = ServerEvent {
        id: Uuid::new_v4().to_string(),
        server_id: request.server_id.clone(),
        title: title.to_string(),
        description: sanitize_optional_string(request.description),
        channel_id: sanitize_optional_string(request.channel_id),
        scheduled_for,
        created_by: current_user,
        created_at: Utc::now(),
        status: "scheduled".to_string(),
        cancelled_at: None,
    };

    database::insert_server_event(&state.db_pool, &event)
        .await
        .map_err(|e| e.to_string())?;

    Ok(event)
}

async fn update_server_event_internal(
    state: AppState,
    request: UpdateServerEventRequest,
) -> Result<ServerEvent, String> {
    let existing = database::get_server_event_by_id(&state.db_pool, &request.event_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Event not found.".to_string())?;

    ensure_server_owner(&state, &existing.server_id).await?;

    let mut patch = ServerEventPatch::default();

    if let Some(title) = request.title {
        let trimmed = title.trim().to_string();
        if trimmed.is_empty() {
            return Err("Event title cannot be empty.".into());
        }
        patch.title = Some(trimmed);
    }

    if let Some(description) = request.description {
        patch.description = Some(sanitize_optional_string(description));
    }

    if let Some(channel_id) = request.channel_id {
        patch.channel_id = Some(sanitize_optional_string(channel_id));
    }

    if let Some(scheduled_for) = request.scheduled_for {
        let parsed = parse_schedule(&scheduled_for)?;
        patch.scheduled_for = Some(parsed);
    }

    if let Some(status) = request.status {
        let trimmed = status.trim().to_string();
        if trimmed.is_empty() {
            return Err("Event status cannot be empty.".into());
        }
        patch.status = Some(trimmed);
    }

    database::update_server_event(&state.db_pool, &request.event_id, patch)
        .await
        .map_err(|e| e.to_string())
}

async fn cancel_server_event_internal(
    state: AppState,
    event_id: String,
) -> Result<ServerEvent, String> {
    let existing = database::get_server_event_by_id(&state.db_pool, &event_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Event not found.".to_string())?;

    ensure_server_owner(&state, &existing.server_id).await?;

    let mut patch = ServerEventPatch::default();
    patch.status = Some("cancelled".to_string());
    patch.cancelled_at = Some(Some(Utc::now()));

    database::update_server_event(&state.db_pool, &event_id, patch)
        .await
        .map_err(|e| e.to_string())
}

async fn create_server_webhook_internal(
    state: AppState,
    request: CreateServerWebhookRequest,
) -> Result<ServerWebhook, String> {
    let name = sanitize_required_string(&request.name, "Webhook name")?;
    let url = sanitize_required_string(&request.url, "Webhook URL")?;

    ensure_server_owner(&state, &request.server_id).await?;

    let creator = state.identity.peer_id().to_base58();
    let now = Utc::now();
    let webhook = ServerWebhook {
        id: Uuid::new_v4().to_string(),
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
    state: AppState,
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
    state: AppState,
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
pub async fn create_server(
    mut server: database::Server,
    state_container: State<'_, AppStateContainer>,
) -> Result<database::Server, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let owner_id = state.identity.peer_id().to_base58();
    server.owner_id = owner_id.clone();
    server.invites = Vec::new();

    database::insert_server(&state.db_pool, &server)
        .await
        .map_err(|e| e.to_string())?;

    database::add_server_member(&state.db_pool, &server.id, &server.owner_id)
        .await
        .map_err(|e| e.to_string())?;

    let default_channel = database::Channel {
        id: uuid::Uuid::new_v4().to_string(),
        server_id: server.id.clone(),
        name: "general".to_string(),
        channel_type: "text".to_string(),
        private: false,
        category_id: None,
    };
    database::insert_channel(&state.db_pool, &default_channel)
        .await
        .map_err(|e| e.to_string())?;

    server.channels.push(default_channel.clone());
    if let Ok(Some(owner)) = user_service::get_user(&state.db_pool, &server.owner_id).await {
        server.members.push(owner);
    }

    let create_server_data = aegis_protocol::CreateServerData {
        server: server.clone(),
    };
    let create_server_bytes = bincode::serialize(&create_server_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&create_server_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::CreateServer {
        server: server.clone(),
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    Ok(server)
}

#[tauri::command]
pub async fn join_server(
    server_id: String,
    user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();
    if user_id != my_id {
        return Err("Caller identity mismatch".into());
    }

    println!("User {} attempting to join server {}", my_id, server_id);
    database::add_server_member(&state.db_pool, &server_id, &my_id)
        .await
        .map_err(|e| e.to_string())?;

    let join_server_data = aegis_protocol::JoinServerData {
        server_id: server_id.clone(),
        user_id: my_id.clone(),
    };
    let join_server_bytes = bincode::serialize(&join_server_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&join_server_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::JoinServer {
        server_id,
        user_id: my_id,
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
pub async fn leave_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    database::remove_server_member(&state.db_pool, &server_id, &my_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_server_member(
    server_id: String,
    member_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    let requester_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != requester_id {
        return Err("Only server owners can remove members.".into());
    }

    if member_id == server.owner_id {
        return Err("Server owners cannot remove themselves.".into());
    }

    database::remove_server_member(&state.db_pool, &server_id, &member_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_channel(
    channel: database::Channel,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &channel.server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != my_id {
        return Err("Only server owners can create channels.".into());
    }

    let channel_payload = channel.clone();
    let create_channel_data = aegis_protocol::CreateChannelData {
        channel: channel_payload.clone(),
    };
    let create_channel_bytes =
        bincode::serialize(&create_channel_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&create_channel_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::CreateChannel {
        channel: channel_payload,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    database::insert_channel(&state.db_pool, &channel)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_channel_category(
    request: CreateChannelCategoryRequest,
    state_container: State<'_, AppStateContainer>,
    app: AppHandle,
) -> Result<ChannelCategoryResponse, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let category = create_channel_category_internal(state, request).await?;
    let response: ChannelCategoryResponse = category.clone().into();
    app.emit("server-category-created", response.clone())
        .map_err(|e| e.to_string())?;
    Ok(response)
}

#[tauri::command]
pub async fn delete_channel_category(
    request: DeleteChannelCategoryRequest,
    state_container: State<'_, AppStateContainer>,
    app: AppHandle,
) -> Result<ChannelCategoryResponse, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let category = delete_channel_category_internal(state, request).await?;
    let response: ChannelCategoryResponse = category.clone().into();
    app.emit("server-category-deleted", response.clone())
        .map_err(|e| e.to_string())?;
    Ok(response)
}

#[tauri::command]
pub async fn get_servers(
    current_user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::Server>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    database::get_all_servers(&state.db_pool, &current_user_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_channels_for_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::Channel>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    database::get_channels_for_server(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_channel_categories_for_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<ChannelCategoryResponse>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    let categories = database::get_channel_categories_for_server(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(categories
        .into_iter()
        .map(ChannelCategoryResponse::from)
        .collect())
}

#[tauri::command]
pub async fn get_members_for_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<aegis_shared_types::User>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    database::get_server_members(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_server_bans(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::User>, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    ensure_server_owner(&state, &server_id).await?;

    database::get_server_bans(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unban_server_member(
    server_id: String,
    user_id: String,
    state_container: State<'_, AppStateContainer>,
    app: AppHandle,
) -> Result<ServerBanUpdate, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    ensure_server_owner(&state, &server_id).await?;

    database::remove_server_ban(&state.db_pool, &server_id, &user_id)
        .await
        .map_err(|e| e.to_string())?;

    let payload = ServerBanUpdate {
        server_id: server_id.clone(),
        user_id: user_id.clone(),
    };

    app.emit("server-member-unbanned", payload.clone())
        .map_err(|e| e.to_string())?;

    Ok(payload)
}

#[tauri::command]
pub async fn get_server_details(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<database::Server, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_server_events(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<ServerEventResponse>, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let events = database::get_server_events(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(events.into_iter().map(ServerEventResponse::from).collect())
}

#[tauri::command]
pub async fn create_server_event(
    request: CreateServerEventRequest,
    state_container: State<'_, AppStateContainer>,
    app: AppHandle,
) -> Result<ServerEventResponse, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let event = create_server_event_internal(state.clone(), request).await?;
    let response: ServerEventResponse = event.into();
    app.emit("server-event-created", response.clone())
        .map_err(|e| e.to_string())?;
    Ok(response)
}

#[tauri::command]
pub async fn update_server_event(
    request: UpdateServerEventRequest,
    state_container: State<'_, AppStateContainer>,
    app: AppHandle,
) -> Result<ServerEventResponse, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let event = update_server_event_internal(state.clone(), request).await?;
    let response: ServerEventResponse = event.into();
    app.emit("server-event-updated", response.clone())
        .map_err(|e| e.to_string())?;
    Ok(response)
}

#[tauri::command]
pub async fn cancel_server_event(
    request: CancelServerEventRequest,
    state_container: State<'_, AppStateContainer>,
    app: AppHandle,
) -> Result<ServerEventResponse, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let event = cancel_server_event_internal(state.clone(), request.event_id).await?;
    let response: ServerEventResponse = event.into();
    app.emit("server-event-cancelled", response.clone())
        .map_err(|e| e.to_string())?;
    Ok(response)
}

#[tauri::command]
pub async fn list_server_webhooks(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<ServerWebhookResponse>, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

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
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

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
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

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
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

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
    use aegis_shared_types::{AppState, FileAclPolicy, IncomingFile, Server};
    use crypto::identity::Identity;
    use std::collections::HashMap;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    use tempfile::tempdir;
    use tokio::sync::Mutex;

    fn build_app_state(identity: Identity, db_pool: sqlx::Pool<sqlx::Sqlite>) -> AppState {
        let (network_tx, _network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let temp_dir = tempdir().expect("tempdir");
        let app_data_dir = temp_dir.into_path();
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
        }
    }

    async fn seed_server(db_pool: &sqlx::Pool<sqlx::Sqlite>, owner_id: &str) -> Server {
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
            channels: Vec::new(),
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
    async fn create_event_persists_record() {
        let temp_dir = tempdir().expect("tempdir");
        let db_path = temp_dir.path().join("events.db");
        let db_pool = aep::database::initialize_db(db_path)
            .await
            .expect("init db");

        let identity = Identity::generate();
        let owner_id = identity.peer_id().to_base58();
        let state = build_app_state(identity.clone(), db_pool.clone());
        let server = seed_server(&db_pool, &owner_id).await;

        let request = CreateServerEventRequest {
            server_id: server.id.clone(),
            title: "Town Hall".into(),
            description: Some("Monthly update".into()),
            channel_id: None,
            scheduled_for: Utc::now().to_rfc3339(),
        };

        let event = create_server_event_internal(state.clone(), request)
            .await
            .expect("create event");

        let events = database::get_server_events(&state.db_pool, &server.id)
            .await
            .expect("fetch events");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, event.id);
        assert_eq!(events[0].title, "Town Hall");
        assert_eq!(events[0].created_by, owner_id);
    }

    #[tokio::test]
    async fn cancel_event_sets_status_and_timestamp() {
        let temp_dir = tempdir().expect("tempdir");
        let db_path = temp_dir.path().join("events-cancel.db");
        let db_pool = aep::database::initialize_db(db_path)
            .await
            .expect("init db");

        let identity = Identity::generate();
        let owner_id = identity.peer_id().to_base58();
        let state = build_app_state(identity.clone(), db_pool.clone());
        let server = seed_server(&db_pool, &owner_id).await;

        let request = CreateServerEventRequest {
            server_id: server.id.clone(),
            title: "Launch Stream".into(),
            description: None,
            channel_id: None,
            scheduled_for: (Utc::now() + chrono::Duration::hours(2)).to_rfc3339(),
        };

        let event = create_server_event_internal(state.clone(), request)
            .await
            .expect("create event");

        let cancelled = cancel_server_event_internal(state.clone(), event.id.clone())
            .await
            .expect("cancel event");

        assert_eq!(cancelled.status, "cancelled");
        assert!(cancelled.cancelled_at.is_some());

        let refreshed = database::get_server_event_by_id(&state.db_pool, &event.id)
            .await
            .expect("fetch event")
            .expect("event exists");

        assert_eq!(refreshed.status, "cancelled");
        assert!(refreshed.cancelled_at.is_some());
    }

    #[tokio::test]
    async fn create_webhook_persists_record() {
        let temp_dir = tempdir().expect("tempdir");
        let db_path = temp_dir.path().join("webhooks-create.db");
        let db_pool = aep::database::initialize_db(db_path)
            .await
            .expect("init db");

        let identity = Identity::generate();
        let owner_id = identity.peer_id().to_base58();
        let state = build_app_state(identity.clone(), db_pool.clone());
        let server = seed_server(&db_pool, &owner_id).await;

        let request = CreateServerWebhookRequest {
            server_id: server.id.clone(),
            name: "Deploy Hook".into(),
            url: "https://hooks.example.com/deploy".into(),
            channel_id: None,
        };

        let webhook = create_server_webhook_internal(state.clone(), request)
            .await
            .expect("create webhook");

        assert_eq!(webhook.server_id, server.id);
        assert_eq!(webhook.created_by, owner_id);

        let stored = database::get_server_webhook_by_id(&db_pool, &webhook.id)
            .await
            .expect("fetch webhook")
            .expect("webhook exists");

        assert_eq!(stored.name, "Deploy Hook");
    }

    #[tokio::test]
    async fn update_webhook_allows_channel_clear() {
        let temp_dir = tempdir().expect("tempdir");
        let db_path = temp_dir.path().join("webhooks-update.db");
        let db_pool = aep::database::initialize_db(db_path)
            .await
            .expect("init db");

        let identity = Identity::generate();
        let owner_id = identity.peer_id().to_base58();
        let state = build_app_state(identity.clone(), db_pool.clone());
        let server = seed_server(&db_pool, &owner_id).await;

        let channel = database::Channel {
            id: Uuid::new_v4().to_string(),
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

#[tauri::command]
pub async fn send_server_invite(
    server_id: String,
    user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<SendServerInviteResult, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();
    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    if server.owner_id != my_id {
        return Err("Only server owners can send invites".into());
    }

    let already_member = database::server_has_member(&state.db_pool, &server_id, &user_id)
        .await
        .map_err(|e| e.to_string())?;

    if !already_member {
        database::add_server_member(&state.db_pool, &server_id, &user_id)
            .await
            .map_err(|e| e.to_string())?;
    }

    let send_server_invite_data = aegis_protocol::SendServerInviteData {
        server_id: server_id.clone(),
        user_id: user_id.clone(),
    };
    let send_server_invite_bytes =
        bincode::serialize(&send_server_invite_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&send_server_invite_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::SendServerInvite {
        server_id: server_id.clone(),
        user_id: user_id.clone(),
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    Ok(SendServerInviteResult {
        server_id,
        user_id,
        already_member,
    })
}

#[tauri::command]
pub async fn generate_server_invite(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<ServerInviteResponse, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();

    let requester_id = state.identity.peer_id().to_base58();
    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != requester_id {
        return Err("Only server owners can generate invites.".into());
    }

    let code = uuid::Uuid::new_v4().simple().to_string();
    let created_at = Utc::now();

    let invite = database::create_server_invite(
        &state.db_pool,
        &server_id,
        &requester_id,
        &code,
        &created_at,
        None,
        None,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ServerInviteResponse::from(invite))
}

#[tauri::command]
pub async fn get_channel_display_preferences(
    server_id: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<ChannelDisplayPreferenceResponse>, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    let user_id = state.identity.peer_id().to_base58();

    let prefs = database::get_channel_display_preferences_for_user(
        &state.db_pool,
        &user_id,
        server_id.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(prefs
        .into_iter()
        .map(ChannelDisplayPreferenceResponse::from)
        .collect())
}

#[tauri::command]
pub async fn set_channel_display_preferences(
    channel_id: String,
    hide_member_names: bool,
    state_container: State<'_, AppStateContainer>,
) -> Result<ChannelDisplayPreferenceResponse, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    let user_id = state.identity.peer_id().to_base58();

    let preference = database::upsert_channel_display_preference(
        &state.db_pool,
        &user_id,
        &channel_id,
        hide_member_names,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ChannelDisplayPreferenceResponse::from(preference))
}

#[tauri::command]
pub async fn delete_channel(
    channel_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    let channel = database::get_channel_by_id(&state.db_pool, &channel_id)
        .await
        .map_err(|e| e.to_string())?;
    let server = database::get_server_by_id(&state.db_pool, &channel.server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != my_id {
        return Err("Only server owners can delete channels.".into());
    }

    let payload_channel_id = channel_id.clone();
    let delete_channel_data = aegis_protocol::DeleteChannelData {
        channel_id: payload_channel_id.clone(),
    };
    let delete_channel_bytes =
        bincode::serialize(&delete_channel_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&delete_channel_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::DeleteChannel {
        channel_id: payload_channel_id,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    database::delete_channel(&state.db_pool, &channel_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != my_id {
        return Err("Only server owners can delete the server.".into());
    }

    let payload_server_id = server_id.clone();
    let delete_server_data = aegis_protocol::DeleteServerData {
        server_id: payload_server_id.clone(),
    };
    let delete_server_bytes = bincode::serialize(&delete_server_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&delete_server_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::DeleteServer {
        server_id: payload_server_id,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    database::delete_server(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_server_metadata(
    server_id: String,
    metadata: ServerMetadataUpdate,
    state_container: State<'_, AppStateContainer>,
) -> Result<database::Server, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    let requester_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != requester_id {
        return Err("Only server owners can update metadata.".into());
    }

    database::update_server_metadata(&state.db_pool, &server_id, &metadata)
        .await
        .map_err(|e| e.to_string())?;

    database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_server_roles(
    server_id: String,
    roles: Vec<database::Role>,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::Role>, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    let requester_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != requester_id {
        return Err("Only server owners can update roles.".into());
    }

    database::replace_server_roles(&state.db_pool, &server_id, &roles)
        .await
        .map_err(|e| e.to_string())?;

    let mut roles_map = database::get_roles_for_servers(&state.db_pool, &[server_id.clone()])
        .await
        .map_err(|e| e.to_string())?;

    Ok(roles_map.remove(&server_id).unwrap_or_default())
}

#[tauri::command]
pub async fn update_server_channels(
    server_id: String,
    channels: Vec<database::Channel>,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::Channel>, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    let requester_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != requester_id {
        return Err("Only server owners can update channels.".into());
    }

    if channels
        .iter()
        .any(|channel| channel.server_id != server_id)
    {
        return Err("All channels must belong to the target server.".into());
    }

    database::replace_server_channels(&state.db_pool, &server_id, &channels)
        .await
        .map_err(|e| e.to_string())?;

    database::get_channels_for_server(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_server_moderation_flags(
    server_id: String,
    moderation: ServerModerationUpdate,
    state_container: State<'_, AppStateContainer>,
) -> Result<database::Server, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    let requester_id = state.identity.peer_id().to_base58();

    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;

    if server.owner_id != requester_id {
        return Err("Only server owners can update moderation flags.".into());
    }

    database::update_server_moderation(&state.db_pool, &server_id, &moderation)
        .await
        .map_err(|e| e.to_string())?;

    database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}
