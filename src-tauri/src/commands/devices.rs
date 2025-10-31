use crate::commands::state::AppStateContainer;
use crate::settings_store;
use aegis_shared_types::{
    AppState, DevicePairingStage, DeviceProvisioningBundle, DeviceProvisioningState,
    DeviceTrustStatus, PendingDeviceLink, PendingDeviceProvisioning, TrustedDeviceRecord,
};
use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Duration, Utc};
use rand::seq::SliceRandom;
use rand::thread_rng;
use std::collections::HashMap;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

const PROVISIONING_TTL_MINUTES: i64 = 10;
const CODE_PHRASE_WORDS: usize = 4;
const CODE_WORD_LIST: &[&str] = &[
    "aurora", "bamboo", "cedar", "drift", "ember", "fable", "gadget", "harbor", "ion", "juniper",
    "kepler", "lumen", "mesa", "nova", "onyx", "prairie", "quartz", "ripple", "solstice", "tundra",
    "umbra", "velvet", "willow", "xenon", "yonder", "zephyr",
];

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInventorySnapshot {
    pub trusted_devices: Vec<TrustedDeviceRecord>,
    pub provisioning: Vec<DeviceProvisioningState>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSyncResult {
    pub encrypted_profile: String,
    pub approved_device: TrustedDeviceRecord,
    pub issued_at: String,
    pub message_count: u64,
}

fn normalize_phrase(input: &str) -> String {
    input
        .trim()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|segment| !segment.is_empty())
        .map(|segment| segment.to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join(" ")
}

fn generate_code_phrase() -> String {
    let mut rng = thread_rng();
    (0..CODE_PHRASE_WORDS)
        .map(|_| {
            CODE_WORD_LIST
                .choose(&mut rng)
                .unwrap_or(&"aurora")
                .to_string()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn create_bundle(bundle_id: &str, code_phrase: &str) -> DeviceProvisioningBundle {
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

fn to_state(pending: &PendingDeviceProvisioning) -> DeviceProvisioningState {
    DeviceProvisioningState {
        bundle: pending.bundle.clone(),
        stage: pending.stage,
        requesting_device: pending.requesting_device.clone(),
        status_message: pending.status_message.clone(),
    }
}

fn parse_expires_at(bundle: &DeviceProvisioningBundle) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(&bundle.expires_at)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

fn is_expired(bundle: &DeviceProvisioningBundle, now: DateTime<Utc>) -> bool {
    parse_expires_at(bundle)
        .map(|expires| expires <= now)
        .unwrap_or(true)
}

async fn persist_trusted_devices_snapshot(
    app: &AppHandle,
    state: &AppState,
    snapshot: Vec<TrustedDeviceRecord>,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
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

fn ensure_pending<'a>(
    pending: &'a mut HashMap<String, PendingDeviceProvisioning>,
    bundle_id: &str,
) -> Result<&'a mut PendingDeviceProvisioning, String> {
    pending
        .get_mut(bundle_id)
        .ok_or_else(|| "Provisioning bundle not found or expired".to_string())
}

#[tauri::command]
pub async fn list_trusted_devices(
    state_container: State<'_, AppStateContainer>,
) -> Result<DeviceInventorySnapshot, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    let trusted_devices = state.trusted_devices.lock().await.clone();
    let provisioning = {
        let pending = state.pending_device_bundles.lock().await;
        pending.values().map(to_state).collect()
    };

    Ok(DeviceInventorySnapshot {
        trusted_devices,
        provisioning,
    })
}

#[tauri::command]
pub async fn initiate_device_provisioning(
    display_name: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<DeviceProvisioningState, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    let bundle_id = Uuid::new_v4().to_string();
    let code_phrase = generate_code_phrase();
    let bundle = create_bundle(&bundle_id, &code_phrase);
    let normalized_code = normalize_phrase(&code_phrase);

    let escrow_cipher = state
        .identity
        .to_encrypted_secret(normalized_code.as_bytes())
        .map_err(|e| e.to_string())?;
    let encrypted = general_purpose::STANDARD_NO_PAD.encode(escrow_cipher);

    let mut pending = state.pending_device_bundles.lock().await;
    let status_message = display_name
        .filter(|s| !s.trim().is_empty())
        .map(|label| format!("Provisioning bundle ready for {label}"));
    let record = PendingDeviceProvisioning {
        bundle: bundle.clone(),
        escrow_ciphertext: encrypted,
        stage: DevicePairingStage::BundleIssued,
        requesting_device: None,
        status_message,
        code_hash: normalized_code,
    };
    pending.insert(bundle_id.clone(), record);
    drop(pending);

    Ok(DeviceProvisioningState {
        bundle,
        stage: DevicePairingStage::BundleIssued,
        requesting_device: None,
        status_message: display_name
            .filter(|s| !s.trim().is_empty())
            .map(|label| format!("Share this bundle with {label}")),
    })
}

#[tauri::command]
pub async fn request_device_link(
    bundle_id: String,
    code_phrase: String,
    device_name: String,
    platform: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<DeviceProvisioningState, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    let mut pending_map = state.pending_device_bundles.lock().await;
    let pending = ensure_pending(&mut pending_map, &bundle_id)?;
    let now = Utc::now();
    if is_expired(&pending.bundle, now) {
        pending.stage = DevicePairingStage::Expired;
        pending.status_message = Some("Provisioning bundle expired".into());
        return Err("Provisioning bundle has expired".into());
    }

    let normalized_code = normalize_phrase(&code_phrase);
    if normalized_code != pending.code_hash {
        return Err("Verification code did not match".into());
    }

    let normalized_name = device_name.trim().to_string();
    let normalized_platform = platform.unwrap_or_else(|| "Unknown".into());

    pending.stage = DevicePairingStage::AwaitingApproval;
    pending.status_message = Some("Awaiting approval on primary device".into());
    pending.requesting_device = Some(PendingDeviceLink {
        name: normalized_name.clone(),
        platform: normalized_platform.clone(),
        requested_at: now.to_rfc3339(),
    });

    drop(pending_map);

    {
        let mut devices = state.trusted_devices.lock().await;
        if let Some(existing) = devices.iter_mut().find(|device| device.id == bundle_id) {
            existing.name = normalized_name.clone();
            existing.platform = normalized_platform.clone();
            existing.status = DeviceTrustStatus::PendingApproval;
            existing.last_seen = now.to_rfc3339();
        } else {
            devices.push(TrustedDeviceRecord {
                id: bundle_id.clone(),
                name: normalized_name.clone(),
                platform: normalized_platform.clone(),
                status: DeviceTrustStatus::PendingApproval,
                added_at: now.to_rfc3339(),
                last_seen: now.to_rfc3339(),
                fingerprint: None,
            });
        }
    }

    let pending_map = state.pending_device_bundles.lock().await;
    let response = pending_map
        .get(&bundle_id)
        .map(to_state)
        .ok_or_else(|| "Provisioning bundle not found".to_string())?;
    Ok(response)
}

#[tauri::command]
pub async fn approve_device_request(
    app: AppHandle,
    bundle_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<DeviceProvisioningState, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    let mut pending_map = state.pending_device_bundles.lock().await;
    let pending = ensure_pending(&mut pending_map, &bundle_id)?;
    let now = Utc::now();
    if is_expired(&pending.bundle, now) {
        pending.stage = DevicePairingStage::Expired;
        pending.status_message = Some("Provisioning bundle expired".into());
        return Err("Provisioning bundle has expired".into());
    }

    if pending.requesting_device.is_none() {
        return Err("No device has requested approval for this bundle".into());
    }

    pending.stage = DevicePairingStage::Approved;
    pending.status_message = Some("Approved. Waiting for device to sync.".into());
    drop(pending_map);

    let mut devices = state.trusted_devices.lock().await;
    let mut snapshot = devices.clone();
    if let Some(device) = snapshot.iter_mut().find(|device| device.id == bundle_id) {
        device.status = DeviceTrustStatus::Active;
        device.added_at = now.to_rfc3339();
        device.last_seen = now.to_rfc3339();
    } else {
        snapshot.push(TrustedDeviceRecord {
            id: bundle_id.clone(),
            name: "Linked device".into(),
            platform: "Unknown".into(),
            status: DeviceTrustStatus::Active,
            added_at: now.to_rfc3339(),
            last_seen: now.to_rfc3339(),
            fingerprint: None,
        });
    }
    *devices = snapshot.clone();
    drop(devices);

    persist_trusted_devices_snapshot(&app, &state, snapshot).await?;

    let pending_map = state.pending_device_bundles.lock().await;
    let response = pending_map
        .get(&bundle_id)
        .map(to_state)
        .ok_or_else(|| "Provisioning bundle not found".to_string())?;
    Ok(response)
}

#[tauri::command]
pub async fn decline_device_request(
    app: AppHandle,
    bundle_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    let mut pending_map = state.pending_device_bundles.lock().await;
    if pending_map.remove(&bundle_id).is_none() {
        return Ok(());
    }
    drop(pending_map);

    let mut devices = state.trusted_devices.lock().await;
    devices.retain(|device| device.id != bundle_id);
    let snapshot = devices.clone();
    drop(devices);
    persist_trusted_devices_snapshot(&app, &state, snapshot).await
}

#[tauri::command]
pub async fn complete_device_sync(
    app: AppHandle,
    bundle_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<DeviceSyncResult, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    let mut pending_map = state.pending_device_bundles.lock().await;
    let pending = ensure_pending(&mut pending_map, &bundle_id)?;
    if pending.stage != DevicePairingStage::Approved {
        return Err("Device has not been approved yet".into());
    }
    let now = Utc::now();
    if is_expired(&pending.bundle, now) {
        pending.stage = DevicePairingStage::Expired;
        pending.status_message = Some("Provisioning bundle expired".into());
        return Err("Provisioning bundle has expired".into());
    }
    let escrow = pending.escrow_ciphertext.clone();
    pending.stage = DevicePairingStage::Completed;
    pending.status_message = Some("Sync package retrieved".into());
    let requesting = pending.requesting_device.clone();
    pending_map.remove(&bundle_id);
    drop(pending_map);

    let mut devices = state.trusted_devices.lock().await;
    let mut snapshot = devices.clone();
    let device = snapshot
        .iter_mut()
        .find(|device| device.id == bundle_id)
        .map(|device| {
            device.status = DeviceTrustStatus::Active;
            device.last_seen = now.to_rfc3339();
            if let Some(req) = &requesting {
                device.name = req.name.clone();
                device.platform = req.platform.clone();
            }
            device.clone()
        })
        .unwrap_or_else(|| TrustedDeviceRecord {
            id: bundle_id.clone(),
            name: requesting
                .as_ref()
                .map(|r| r.name.clone())
                .unwrap_or_else(|| "Linked device".into()),
            platform: requesting
                .as_ref()
                .map(|r| r.platform.clone())
                .unwrap_or_else(|| "Unknown".into()),
            status: DeviceTrustStatus::Active,
            added_at: now.to_rfc3339(),
            last_seen: now.to_rfc3339(),
            fingerprint: None,
        });
    if !snapshot.iter().any(|d| d.id == bundle_id) {
        snapshot.push(device.clone());
    }
    *devices = snapshot.clone();
    drop(devices);

    persist_trusted_devices_snapshot(&app, &state, snapshot).await?;

    let message_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM messages")
        .fetch_one(&state.db_pool)
        .await
        .unwrap_or(0);

    Ok(DeviceSyncResult {
        encrypted_profile: escrow,
        approved_device: device,
        issued_at: now.to_rfc3339(),
        message_count: message_count as u64,
    })
}

#[tauri::command]
pub async fn revoke_trusted_device(
    app: AppHandle,
    device_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<TrustedDeviceRecord>, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    let mut devices = state.trusted_devices.lock().await;
    let now = Utc::now().to_rfc3339();
    let mut snapshot = devices.clone();
    if let Some(device) = snapshot.iter_mut().find(|device| device.id == device_id) {
        device.status = DeviceTrustStatus::Revoked;
        device.last_seen = now;
    } else {
        return Err("Device not found".into());
    }
    *devices = snapshot.clone();
    drop(devices);

    persist_trusted_devices_snapshot(&app, &state, snapshot.clone()).await?;
    Ok(snapshot)
}

#[tauri::command]
pub async fn forget_trusted_device(
    app: AppHandle,
    device_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<TrustedDeviceRecord>, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    let mut devices = state.trusted_devices.lock().await;
    if devices.iter().all(|device| device.id != device_id) {
        return Err("Device not found".into());
    }
    devices.retain(|device| device.id != device_id);
    let snapshot = devices.clone();
    drop(devices);

    persist_trusted_devices_snapshot(&app, &state, snapshot.clone()).await?;
    Ok(snapshot)
}

#[tauri::command]
pub async fn cancel_device_provisioning(
    bundle_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?.clone();
    drop(state_guard);

    let mut pending_map = state.pending_device_bundles.lock().await;
    pending_map.remove(&bundle_id);
    Ok(())
}
