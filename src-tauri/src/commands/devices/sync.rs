use aegis_shared_types::{DevicePairingStage, DeviceTrustStatus, TrustedDeviceRecord};
use chrono::Utc;
use tauri::{AppHandle, State};

use crate::commands::state::AppStateContainer;

use super::{
    ensure_pending, get_app_state, is_expired, persist_trusted_devices_snapshot, CommandResult,
    DeviceSyncResult,
};

#[tauri::command]
pub async fn complete_device_sync(
    app: AppHandle,
    bundle_id: String,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<DeviceSyncResult> {
    let state = get_app_state(state_container).await?;
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
