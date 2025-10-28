use crate::commands::state::AppStateContainer;
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use tauri::Manager;
use tauri::State;

#[derive(Serialize, Deserialize)]
struct PersistedSettings {
    file_acl_policy: String,
}

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
    // Persist to settings.json under app_data_dir
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_data_dir.exists() {
        std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
    }
    let path = app_data_dir.join("settings.json");
    let to_write = PersistedSettings {
        file_acl_policy: match &*guard {
            aegis_shared_types::FileAclPolicy::FriendsOnly => "friends_only".into(),
            aegis_shared_types::FileAclPolicy::Everyone => "everyone".into(),
        },
    };
    let json = serde_json::to_vec_pretty(&to_write).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
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
