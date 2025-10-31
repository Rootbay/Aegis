use tauri::State;

use crate::commands::state::AppStateContainer;

use super::{get_app_state, to_state, CommandResult, DeviceInventorySnapshot};

#[tauri::command]
pub async fn list_trusted_devices(
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<DeviceInventorySnapshot> {
    let state = get_app_state(state_container).await?;

    let trusted_devices = state.trusted_devices.lock().await.clone();
    let provisioning = {
        let pending = state.pending_device_bundles.lock().await;
        pending.values().map(to_state).collect::<Vec<_>>()
    };

    Ok(DeviceInventorySnapshot {
        trusted_devices,
        provisioning,
    })
}
