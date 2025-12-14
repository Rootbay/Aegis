use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use scu128::Scu128;

#[derive(Debug, Serialize, Deserialize, Clone, rkyv::Archive, rkyv::Deserialize, rkyv::Serialize)]
#[serde(rename_all = "camelCase")]
#[archive(check_bytes)]
pub struct ExternalAccount {
    pub id: String,
    pub provider: String,
    pub username: String,
    pub linked_at: String,
    pub scopes: Vec<String>,
}

fn get_accounts_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
    }
    Ok(app_data_dir.join("connected_accounts.json"))
}

fn load_accounts(app: &AppHandle) -> Result<Vec<ExternalAccount>, String> {
    let path = get_accounts_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let accounts: Vec<ExternalAccount> =
        rkyv::from_bytes(&bytes).map_err(|e| format!("Deserialization error: {:?}", e))?;
    Ok(accounts)
}

fn persist_accounts(app: &AppHandle, accounts: &Vec<ExternalAccount>) -> Result<(), String> {
    let path = get_accounts_path(app)?;
    let bytes = rkyv::to_bytes::<_, 1024>(accounts).map_err(|e| format!("Serialization error: {:?}", e))?;
    fs::write(path, &bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_connected_accounts(app: AppHandle) -> Result<Vec<ExternalAccount>, String> {
    load_accounts(&app)
}

#[tauri::command]
pub async fn link_external_account(
    app: AppHandle,
    provider: String,
    username: String,
) -> Result<ExternalAccount, String> {
    let normalized_provider = provider.trim();
    if normalized_provider.is_empty() {
        return Err("Provider is required".into());
    }

    let normalized_username = username.trim();
    if normalized_username.is_empty() {
        return Err("Username is required".into());
    }

    let mut accounts = load_accounts(&app)?;
    let id = Scu128::new().to_string();
    let account = ExternalAccount {
        id,
        provider: normalized_provider.to_string(),
        username: normalized_username.to_string(),
        linked_at: Utc::now().to_rfc3339(),
        scopes: vec!["basic".into()],
    };

    accounts.retain(|existing| {
        !(existing.provider == account.provider && existing.username == account.username)
    });
    accounts.push(account.clone());
    persist_accounts(&app, &accounts)?;

    Ok(account)
}

#[tauri::command]
pub async fn unlink_external_account(app: AppHandle, account_id: String) -> Result<(), String> {
    let mut accounts = load_accounts(&app)?;
    let initial_len = accounts.len();
    accounts.retain(|account| account.id != account_id);

    if accounts.len() == initial_len {
        return Err("Account not found".into());
    }

    persist_accounts(&app, &accounts)?;
    Ok(())
}
