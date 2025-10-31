use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{atomic::AtomicBool, Arc};

use tokio::sync::mpsc::Sender as TokioSender;
use tokio::sync::Mutex;

use aegis_shared_types::{AppState, FileAclPolicy, FileTransferCommand};
use crypto::identity::Identity;

pub(super) fn build_app_state(
    identity: Identity,
    db_pool: sqlx::Pool<sqlx::Sqlite>,
    network_tx: TokioSender<Vec<u8>>,
    file_tx: TokioSender<FileTransferCommand>,
    app_data_dir: PathBuf,
    initial_acl: FileAclPolicy,
    connectivity_snapshot: Arc<Mutex<Option<aegis_shared_types::ConnectivityEventPayload>>>,
    persisted_settings: &crate::settings_store::PersistedSettings,
) -> AppState {
    AppState {
        identity,
        network_tx,
        db_pool,
        incoming_files: Arc::new(Mutex::new(HashMap::new())),
        file_cmd_tx: file_tx,
        file_acl_policy: Arc::new(Mutex::new(initial_acl)),
        app_data_dir,
        connectivity_snapshot,
        voice_memos_enabled: Arc::new(AtomicBool::new(true)),
        relays: Arc::new(Mutex::new(persisted_settings.relays.clone())),
        trusted_devices: Arc::new(Mutex::new(persisted_settings.trusted_devices.clone())),
        pending_device_bundles: Arc::new(Mutex::new(HashMap::new())),
    }
}
