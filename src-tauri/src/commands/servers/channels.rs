use super::{ensure_server_owner, get_initialized_state, sanitize_required_string};
use crate::commands::state::AppStateContainer;
use aegis_protocol::{self, AepMessage};
use aep::database::{self, Channel, ChannelCategory, ChannelDisplayPreference};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

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

async fn create_channel_category_internal(
    state: aegis_shared_types::AppState,
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
    state: aegis_shared_types::AppState,
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

#[tauri::command]
pub async fn create_channel(
    channel: Channel,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = get_initialized_state(&state_container).await?;
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
    let state = get_initialized_state(&state_container).await?;
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
    let state = get_initialized_state(&state_container).await?;
    let category = delete_channel_category_internal(state, request).await?;
    let response: ChannelCategoryResponse = category.clone().into();
    app.emit("server-category-deleted", response.clone())
        .map_err(|e| e.to_string())?;
    Ok(response)
}

#[tauri::command]
pub async fn get_channels_for_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<Channel>, String> {
    let state = get_initialized_state(&state_container).await?;
    database::get_channels_for_server(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_channel_categories_for_server(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<ChannelCategoryResponse>, String> {
    let state = get_initialized_state(&state_container).await?;
    let categories = database::get_channel_categories_for_server(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(categories
        .into_iter()
        .map(ChannelCategoryResponse::from)
        .collect())
}

#[tauri::command]
pub async fn get_channel_display_preferences(
    server_id: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<ChannelDisplayPreferenceResponse>, String> {
    let state = get_initialized_state(&state_container).await?;
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
    let state = get_initialized_state(&state_container).await?;
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
    let state = get_initialized_state(&state_container).await?;
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
