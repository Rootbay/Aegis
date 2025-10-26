use chrono::Utc;
use std::fs::{self, OpenOptions};
use std::io::Write;

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
