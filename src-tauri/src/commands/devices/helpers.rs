use std::collections::HashMap;

use aegis_shared_types::{
    AppState, DeviceProvisioningBundle, DeviceProvisioningState, PendingDeviceProvisioning,
};
use chrono::{DateTime, Duration, Utc};
use rand::{seq::SliceRandom, thread_rng};
use tauri::{AppHandle, State};

use crate::commands::state::AppStateContainer;

use super::CommandResult;

const PROVISIONING_TTL_MINUTES: i64 = 10;
const CODE_PHRASE_WORDS: usize = 4;
const CODE_WORD_LIST: &[&str] = &[
    "aurora", "bamboo", "cedar", "drift", "ember", "fable", "gadget", "harbor", "ion", "juniper",
    "kepler", "lumen", "mesa", "nova", "onyx", "prairie", "quartz", "ripple", "solstice", "tundra",
    "umbra", "velvet", "willow", "xenon", "yonder", "zephyr",
];

pub(super) async fn get_app_state(
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<AppState> {
    let guard = state_container.0.lock().await;
    guard
        .as_ref()
        .cloned()
        .ok_or_else(|| "State not initialized".to_string())
}

pub(super) fn normalize_phrase(input: &str) -> String {
    input
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|segment| !segment.is_empty())
        .map(str::to_ascii_lowercase)
        .collect::<Vec<_>>()
        .join(" ")
}

pub(super) fn generate_code_phrase() -> String {
    (0..CODE_PHRASE_WORDS)
        .filter_map(|_| CODE_WORD_LIST.choose(&mut thread_rng()))
        .map(|word| word.to_string())
        .collect::<Vec<_>>()
        .join(" ")
}

pub(super) fn create_bundle(bundle_id: &str, code_phrase: &str) -> DeviceProvisioningBundle {
    let created_at = Utc::now();
    let expires_at = created_at + Duration::minutes(PROVISIONING_TTL_MINUTES);
    let qr_payload = format!(
        "aegis://pair?bundle={}&code={}",
        bundle_id,
        code_phrase.replace(' ', "-")
    );

    DeviceProvisioningBundle {
        bundle_id: bundle_id.to_string(),
        created_at: created_at.to_rfc3339(),
        expires_at: expires_at.to_rfc3339(),
        qr_payload,
        code_phrase: code_phrase.to_string(),
    }
}

pub(super) fn to_state(pending: &PendingDeviceProvisioning) -> DeviceProvisioningState {
    DeviceProvisioningState {
        bundle: pending.bundle.clone(),
        stage: pending.stage,
        requesting_device: pending.requesting_device.clone(),
        status_message: pending.status_message.clone(),
    }
}

pub(super) fn parse_expires_at(bundle: &DeviceProvisioningBundle) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(&bundle.expires_at)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

pub(super) fn is_expired(bundle: &DeviceProvisioningBundle, now: DateTime<Utc>) -> bool {
    parse_expires_at(bundle)
        .map(|expires| expires <= now)
        .unwrap_or(true)
}

pub(super) fn ensure_pending<'a>(
    pending: &'a mut HashMap<String, PendingDeviceProvisioning>,
    bundle_id: &str,
) -> CommandResult<&'a mut PendingDeviceProvisioning> {
    pending
        .get_mut(bundle_id)
        .ok_or_else(|| "Provisioning bundle not found or expired".to_string())
}

pub(super) async fn persist_trusted_devices_snapshot(
    app: &AppHandle,
    state: &AppState,
    snapshot: Vec<aegis_shared_types::TrustedDeviceRecord>,
) -> CommandResult<()> {
    use crate::settings_store;
    use tauri::Manager;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let path = app_data_dir.join("settings.json");
    let mut persisted = settings_store::load_settings(&path).unwrap_or_default();
    persisted.trusted_devices = snapshot;

    if persisted.relays.is_empty() {
        let relays = state.relays.lock().await.clone();
        if !relays.is_empty() {
            persisted.relays = relays;
        }
    }

    settings_store::save_settings(&path, &persisted)?;
    Ok(())
}
