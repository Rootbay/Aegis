use aegis_shared_types::ConnectivityEventPayload;
use tauri::State;

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
