use std::fs;
use std::path::{Path, PathBuf};

use aegis_shared_types::{RelayRecord, TrustedDeviceRecord};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_acl_policy: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub relays: Vec<RelayRecord>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub trusted_devices: Vec<TrustedDeviceRecord>,
}

impl PersistedSettings {
    pub fn merge_file_acl(mut self, value: Option<String>) -> Self {
        self.file_acl_policy = value;
        self
    }
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn load_settings(path: &Path) -> Result<PersistedSettings, String> {
    if !path.exists() {
        return Ok(PersistedSettings::default());
    }

    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Ok(PersistedSettings::default());
    }

    serde_json::from_slice::<PersistedSettings>(&bytes).map_err(|e| e.to_string())
}

pub fn save_settings(path: &Path, settings: &PersistedSettings) -> Result<PathBuf, String> {
    ensure_parent(path)?;
    let json = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(path.to_path_buf())
}
