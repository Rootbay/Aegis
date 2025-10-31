use aegis_shared_types::{DeviceTrustStatus, TrustedDeviceRecord};
use chrono::Utc;
use tauri::{AppHandle, State};

use crate::commands::state::AppStateContainer;

use super::{get_app_state, persist_trusted_devices_snapshot, CommandResult};

#[tauri::command]
pub async fn revoke_trusted_device(
    app: AppHandle,
    device_id: String,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<Vec<TrustedDeviceRecord>> {
    let state = get_app_state(state_container).await?;

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
) -> CommandResult<Vec<TrustedDeviceRecord>> {
    let state = get_app_state(state_container).await?;

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
) -> CommandResult<()> {
    let state = get_app_state(state_container).await?;
    let mut pending_map = state.pending_device_bundles.lock().await;
    pending_map.remove(&bundle_id);
    Ok(())
}
