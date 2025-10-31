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

pub use admin::*;
pub use channels::*;
pub use core::*;
pub use events::*;
pub use invites::*;
pub use webhooks::*;

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
