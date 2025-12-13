use super::{ensure_server_owner, get_initialized_state, parse_schedule, sanitize_optional_string};
use crate::commands::state::AppStateContainer;
use scu128::Scu128;
use aep::database::{self, ServerEvent, ServerEventPatch};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

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

async fn create_server_event_internal(
    state: aegis_shared_types::AppState,
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
        id: Scu128::new().to_string(),
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
    state: aegis_shared_types::AppState,
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
    state: aegis_shared_types::AppState,
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

#[tauri::command]
pub async fn list_server_events(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<ServerEventResponse>, String> {
    let state = get_initialized_state(&state_container).await?;
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
    let state = get_initialized_state(&state_container).await?;
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
    let state = get_initialized_state(&state_container).await?;
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
    let state = get_initialized_state(&state_container).await?;
    let event = cancel_server_event_internal(state.clone(), request.event_id).await?;
    let response: ServerEventResponse = event.into();
    app.emit("server-event-cancelled", response.clone())
        .map_err(|e| e.to_string())?;
    Ok(response)
}
