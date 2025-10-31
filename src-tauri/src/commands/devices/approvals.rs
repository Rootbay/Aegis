use aegis_shared_types::{
    DevicePairingStage, DeviceTrustStatus, PendingDeviceLink, TrustedDeviceRecord,
};
use chrono::Utc;
use tauri::{AppHandle, State};

use crate::commands::state::AppStateContainer;

use super::{
    ensure_pending, get_app_state, is_expired, normalize_phrase, persist_trusted_devices_snapshot,
    to_state, CommandResult,
};

#[tauri::command]
pub async fn request_device_link(
    bundle_id: String,
    code_phrase: String,
    device_name: String,
    platform: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<aegis_shared_types::DeviceProvisioningState> {
    let state = get_app_state(state_container).await?;
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
) -> CommandResult<aegis_shared_types::DeviceProvisioningState> {
    let state = get_app_state(state_container).await?;
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

    persist_trusted_devices_snapshot(&app, &state, snapshot.clone()).await?;

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
) -> CommandResult<()> {
    let state = get_app_state(state_container).await?;

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
