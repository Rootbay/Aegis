use crate::commands::state::AppStateContainer;
use crate::connectivity;
use crate::settings_store;
use aegis_shared_types::{
    FileAclPolicy, RelayConfig, RelayHealth, RelayRecord, RelayStatus,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayRegistration {
    pub config: RelayConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayHealthUpdate {
    pub relay_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<RelayStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uptime_percent: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checked_at: Option<String>,
}

#[tauri::command]
pub async fn list_relays(
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<RelayRecord>, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?;
    let relays = state.relays.lock().await.clone();
    Ok(relays)
}

#[tauri::command]
pub async fn register_relay(
    app: tauri::AppHandle,
    payload: RelayRegistration,
    state_container: State<'_, AppStateContainer>,
) -> Result<RelayRecord, String> {
    let mut state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let mut config = payload.config;
    if config.label.trim().is_empty() {
        return Err("Relay label is required".to_string());
    }

    if config.id.trim().is_empty() {
        config.id = Uuid::new_v4().to_string();
    }

    config.urls = config
        .urls
        .into_iter()
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty())
        .collect();

    let mut relays_guard = state.relays.lock().await;
    let record = if let Some(existing) = relays_guard
        .iter_mut()
        .find(|record| record.config.id == config.id)
    {
        existing.config = config.clone();
        existing.clone()
    } else {
        let new_record = RelayRecord {
            config: config.clone(),
            health: RelayHealth::default(),
        };
        relays_guard.push(new_record.clone());
        new_record
    };

    let snapshot = relays_guard.clone();
    drop(relays_guard);

    persist_relays(&state, snapshot).await?;
    let _ = connectivity::emit_bridge_snapshot(&app).await;

    Ok(record)
}

#[tauri::command]
pub async fn remove_relay(
    app: tauri::AppHandle,
    relay_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let mut state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let mut relays_guard = state.relays.lock().await;
    let initial_len = relays_guard.len();
    relays_guard.retain(|record| record.config.id != relay_id);

    if relays_guard.len() == initial_len {
        return Err("Relay not found".to_string());
    }

    let snapshot = relays_guard.clone();
    drop(relays_guard);

    persist_relays(&state, snapshot).await?;
    let _ = connectivity::emit_bridge_snapshot(&app).await;

    Ok(())
}

#[tauri::command]
pub async fn update_relay_health(
    app: tauri::AppHandle,
    payload: RelayHealthUpdate,
    state_container: State<'_, AppStateContainer>,
) -> Result<RelayRecord, String> {
    let mut state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let mut relays_guard = state.relays.lock().await;
    let record = relays_guard
        .iter_mut()
        .find(|record| record.config.id == payload.relay_id)
        .ok_or_else(|| "Relay not found".to_string())?;

    if let Some(status) = payload.status {
        record.health.status = status;
    }
    if payload.latency_ms.is_some() {
        record.health.latency_ms = payload.latency_ms;
    }
    if payload.uptime_percent.is_some() {
        record.health.uptime_percent = payload.uptime_percent;
    }
    if payload.error.is_some() {
        record.health.error = payload.error.clone();
    }
    record.health.last_checked_at = Some(
        payload
            .checked_at
            .unwrap_or_else(|| Utc::now().to_rfc3339()),
    );

    let updated = record.clone();
    let snapshot = relays_guard.clone();
    drop(relays_guard);

    persist_relays(&state, snapshot).await?;
    let _ = connectivity::emit_bridge_snapshot(&app).await;

    Ok(updated)
}

async fn persist_relays(state: &aegis_shared_types::AppState, relays: Vec<RelayRecord>) -> Result<(), String> {
    let settings_path = state.app_data_dir.join("settings.json");
    let mut persisted = settings_store::load_settings(&settings_path)
        .unwrap_or_else(|_| settings_store::PersistedSettings::default());
    persisted.relays = relays;

    if persisted.file_acl_policy.is_none() {
        let guard = state.file_acl_policy.lock().await;
        let value = match &*guard {
            FileAclPolicy::FriendsOnly => "friends_only",
            FileAclPolicy::Everyone => "everyone",
        };
        persisted.file_acl_policy = Some(value.to_string());
    }

    settings_store::save_settings(&settings_path, &persisted).map(|_| ())
}
