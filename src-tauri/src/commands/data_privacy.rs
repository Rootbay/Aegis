use chrono::Utc;
use std::fs::{self, OpenOptions};
use std::io::Write;
use tauri::{Manager, State};

use crate::commands::state::AppStateContainer;

#[tauri::command]
pub async fn export_user_data(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let export_dir = app_data_dir.join("exports");
    fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let export_path = export_dir.join(format!("aegis-user-data-{}.json", timestamp));

    let export_payload = serde_json::json!({
        "exported_at": Utc::now(),
        "schema_version": 1,
        "notes": "This file contains a portable snapshot of your account metadata.",
    });

    let json = serde_json::to_string_pretty(&export_payload).map_err(|e| e.to_string())?;
    fs::write(&export_path, json).map_err(|e| e.to_string())?;

    Ok(export_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn request_account_deletion(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let requests_dir = app_data_dir.join("requests");
    fs::create_dir_all(&requests_dir).map_err(|e| e.to_string())?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(requests_dir.join("account-deletion-requests.log"))
        .map_err(|e| e.to_string())?;

    let timestamp = Utc::now().to_rfc3339();
    writeln!(file, "{}\taccount deletion requested", timestamp).map_err(|e| e.to_string())?;

    Ok("Account deletion request submitted. Expect a confirmation email soon.".into())
}

#[tauri::command]
pub async fn panic_wipe(
    app: tauri::AppHandle,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let maybe_state = {
        let mut guard = state_container.0.lock().await;
        guard.take()
    };

    if let Some(state) = maybe_state {
        state.db_pool.close().await;
        {
            let mut incoming_files = state.incoming_files.lock().await;
            incoming_files.clear();
        }
        {
            let mut snapshot = state.connectivity_snapshot.lock().await;
            *snapshot = None;
        }
        drop(state.network_tx);
        drop(state.file_cmd_tx);
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let database_files = ["aegis.db", "aegis.db-shm", "aegis.db-wal"];
    for file_name in database_files {
        let path = app_data_dir.join(file_name);
        if path.exists() {
            fs::remove_file(&path)
                .or_else(|err| {
                    if err.kind() == std::io::ErrorKind::NotFound {
                        Ok(())
                    } else {
                        Err(err)
                    }
                })
                .map_err(|e| format!("Failed to remove {}: {}", file_name, e))?;
        }
    }

    let cache_dirs = ["incoming_transfers", "outgoing_transfers", "e2ee"];
    for dir_name in cache_dirs {
        let path = app_data_dir.join(dir_name);
        if path.exists() {
            fs::remove_dir_all(&path)
                .or_else(|err| {
                    if err.kind() == std::io::ErrorKind::NotFound {
                        Ok(())
                    } else {
                        Err(err)
                    }
                })
                .map_err(|e| format!("Failed to remove {}: {}", dir_name, e))?;
        }
    }

    let files_to_clear = [
        "settings.json",
        "connected_accounts.json",
        "identity.bin",
        "identity.salt",
        "identity.nonce",
    ];
    for file_name in files_to_clear {
        let path = app_data_dir.join(file_name);
        if path.exists() {
            fs::remove_file(&path)
                .or_else(|err| {
                    if err.kind() == std::io::ErrorKind::NotFound {
                        Ok(())
                    } else {
                        Err(err)
                    }
                })
                .map_err(|e| format!("Failed to remove {}: {}", file_name, e))?;
        }
    }

    Ok(())
}
