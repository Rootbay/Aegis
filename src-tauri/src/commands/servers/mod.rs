mod admin;
mod channels;
mod core;
mod events;
mod invites;
mod webhooks;

use crate::commands::state::AppStateContainer;
use aegis_protocol::AepMessage;
use aegis_shared_types::AppState;
use aep::database;
use chrono::{DateTime, Utc};
use tauri::State;

pub use admin::{
    update_server_channels, update_server_metadata, update_server_moderation_flags,
    update_server_roles,
};
pub use channels::{
    create_channel, create_channel_category, delete_channel, delete_channel_category,
    get_channel_categories_for_server, get_channel_display_preferences, get_channels_for_server,
    set_channel_display_preferences, ChannelCategoryResponse, ChannelDisplayPreferenceResponse,
    CreateChannelCategoryRequest, DeleteChannelCategoryRequest,
};
pub use core::{
    create_server, delete_server, get_members_for_server, get_server_details, get_servers,
    join_server, leave_server, list_server_bans, remove_server_member, unban_server_member,
    ServerBanUpdate,
};
pub use events::{
    cancel_server_event, create_server_event, list_server_events, update_server_event,
    CancelServerEventRequest, CreateServerEventRequest, ServerEventResponse,
    UpdateServerEventRequest,
};
pub use invites::{
    generate_server_invite, list_server_invites, redeem_server_invite, revoke_server_invite,
    send_server_invite, RedeemServerInviteResponse, SendServerInviteResult, ServerInviteResponse,
};
pub use webhooks::{
    create_server_webhook, delete_server_webhook, list_server_webhooks, update_server_webhook,
    CreateServerWebhookRequest, DeleteServerWebhookRequest, DeleteServerWebhookResponse,
    ServerWebhookResponse, UpdateServerWebhookRequest,
};

pub(super) fn sanitize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

pub(super) fn sanitize_required_string(value: &str, field_name: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(format!("{field_name} cannot be empty."))
    } else {
        Ok(trimmed.to_string())
    }
}

pub(super) fn parse_schedule(value: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|error| format!("Invalid scheduled time: {error}"))
}

pub(super) async fn get_initialized_state(
    state_container: &State<'_, AppStateContainer>,
) -> Result<AppState, String> {
    let state_guard = state_container.0.lock().await;
    state_guard
        .as_ref()
        .cloned()
        .ok_or_else(|| "State not initialized".to_string())
}

pub(super) async fn ensure_server_owner(state: &AppState, server_id: &str) -> Result<(), String> {
    let server = database::get_server_by_id(&state.db_pool, server_id)
        .await
        .map_err(|e| e.to_string())?;
    let current_user = state.identity.peer_id().to_base58();
    if server.owner_id != current_user {
        return Err("Only the server owner can manage this resource.".into());
    }
    Ok(())
}

pub(super) async fn broadcast_join_event(
    state: &AppState,
    server_id: &str,
    user_id: &str,
) -> Result<(), String> {
    let join_server_data = aegis_protocol::JoinServerData {
        server_id: server_id.to_string(),
        user_id: user_id.to_string(),
    };
    let join_server_bytes = bincode::serialize(&join_server_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&join_server_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::JoinServer {
        server_id: server_id.to_string(),
        user_id: user_id.to_string(),
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())
}
