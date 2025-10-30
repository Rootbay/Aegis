use aegis_shared_types::{
    ConnectivityEventPayload, ConnectivityGatewayStatus, ConnectivityTransportStatus,
};
use tauri::{AppHandle, Runtime, State};

use crate::commands::state::AppStateContainer;

#[tauri::command]
pub async fn get_connectivity_snapshot(
    state_container: State<'_, AppStateContainer>,
) -> Result<Option<ConnectivityEventPayload>, String> {
    let state_guard = state_container.0.lock().await;
    if let Some(state) = state_guard.as_ref() {
        let snapshot_guard = state.connectivity_snapshot.lock().await;
        Ok(snapshot_guard.clone())
    } else {
        Err("Application state not initialized. Please unlock your identity.".to_string())
    }
}

#[tauri::command]
pub async fn set_bridge_mode_enabled<R: Runtime>(
    app: AppHandle<R>,
    enabled: bool,
) -> Result<ConnectivityGatewayStatus, String> {
    crate::connectivity::set_bridge_mode_enabled(&app, enabled).await
}

#[tauri::command]
pub async fn set_bluetooth_enabled<R: Runtime>(
    app: AppHandle<R>,
    enabled: bool,
) -> Result<ConnectivityTransportStatus, String> {
    crate::connectivity::set_bluetooth_enabled(&app, enabled).await
}

#[tauri::command]
pub async fn set_wifi_direct_enabled<R: Runtime>(
    app: AppHandle<R>,
    enabled: bool,
) -> Result<ConnectivityTransportStatus, String> {
    crate::connectivity::set_wifi_direct_enabled(&app, enabled).await
}
