use crate::commands::state::AppStateContainer;
use crate::settings_store;
use std::sync::atomic::Ordering;
use tauri::Manager;
use tauri::State;

#[tauri::command]
pub async fn get_file_acl_policy(
    state_container: State<'_, AppStateContainer>,
) -> Result<String, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?;
    let policy = state.file_acl_policy.lock().await.clone();
    Ok(match policy {
        aegis_shared_types::FileAclPolicy::Everyone => "everyone".to_string(),
        aegis_shared_types::FileAclPolicy::FriendsOnly => "friends_only".to_string(),
    })
}

#[tauri::command]
pub async fn set_file_acl_policy(
    app: tauri::AppHandle,
    policy: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?;
    let mut guard = state.file_acl_policy.lock().await;
    *guard = match policy.as_str() {
        "friends_only" => aegis_shared_types::FileAclPolicy::FriendsOnly,
        _ => aegis_shared_types::FileAclPolicy::Everyone,
    };
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_data_dir.join("settings.json");
    let mut persisted = settings_store::load_settings(&path).unwrap_or_default();
    persisted.file_acl_policy = Some(match &*guard {
        aegis_shared_types::FileAclPolicy::FriendsOnly => "friends_only".to_string(),
        aegis_shared_types::FileAclPolicy::Everyone => "everyone".to_string(),
    });
    settings_store::save_settings(&path, &persisted)?;
    Ok(())
}

#[tauri::command]
pub async fn set_voice_memos_enabled(
    enabled: bool,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard.as_ref().ok_or("State not initialized")?;
    state.voice_memos_enabled.store(enabled, Ordering::Relaxed);
    Ok(())
}
