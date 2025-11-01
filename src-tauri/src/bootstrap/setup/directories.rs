use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use crate::settings_store;

pub(super) struct AppDirectories {
    data_dir: PathBuf,
    #[allow(dead_code)]
    incoming_dir: PathBuf,
    #[allow(dead_code)]
    outgoing_dir: PathBuf,
    settings_path: PathBuf,
}

impl AppDirectories {
    pub fn prepare<R: Runtime>(app: &AppHandle<R>) -> Result<Self, String> {
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        if !data_dir.exists() {
            std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        }

        let incoming_dir = data_dir.join(super::super::INCOMING_STATE_DIR);
        if !incoming_dir.exists() {
            std::fs::create_dir_all(&incoming_dir).map_err(|e| e.to_string())?;
        }

        let outgoing_dir = data_dir.join(super::super::OUTGOING_STATE_DIR);
        if !outgoing_dir.exists() {
            std::fs::create_dir_all(&outgoing_dir).map_err(|e| e.to_string())?;
        }

        let settings_path = data_dir.join("settings.json");

        Ok(Self {
            data_dir,
            incoming_dir,
            outgoing_dir,
            settings_path,
        })
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    #[allow(dead_code)]
    pub fn incoming_dir(&self) -> &Path {
        &self.incoming_dir
    }

    #[allow(dead_code)]
    pub fn outgoing_dir(&self) -> &Path {
        &self.outgoing_dir
    }

    pub fn settings_path(&self) -> &Path {
        &self.settings_path
    }

    pub fn load_persisted_settings(&self) -> settings_store::PersistedSettings {
        match settings_store::load_settings(self.settings_path()) {
            Ok(settings) => settings,
            Err(error) => {
                eprintln!(
                    "Failed to load persisted settings ({}). Using defaults.",
                    error
                );
                settings_store::PersistedSettings::default()
            }
        }
    }

    pub async fn initialize_database(&self) -> Result<sqlx::Pool<sqlx::Sqlite>, String> {
        let db_path = self.data_dir().join("aegis.db");
        aep::database::initialize_db(db_path)
            .await
            .map_err(|e| format!("Failed to initialize database: {}", e))
    }
}

pub(super) trait PersistedSettingsExt {
    fn initial_file_acl(&self) -> aegis_shared_types::FileAclPolicy;
}

impl PersistedSettingsExt for settings_store::PersistedSettings {
    fn initial_file_acl(&self) -> aegis_shared_types::FileAclPolicy {
        match self.file_acl_policy.as_deref() {
            Some("friends_only") => aegis_shared_types::FileAclPolicy::FriendsOnly,
            Some("everyone") => aegis_shared_types::FileAclPolicy::Everyone,
            _ => aegis_shared_types::FileAclPolicy::Everyone,
        }
    }
}
