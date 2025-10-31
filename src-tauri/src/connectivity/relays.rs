use std::sync::Arc;

use aegis_shared_types::{RelayRecord, RelaySnapshot};
use once_cell::sync::OnceCell;
use tokio::sync::Mutex;

static RELAY_STORE: OnceCell<Arc<Mutex<Vec<RelayRecord>>>> = OnceCell::new();

pub fn set_relay_store(store: Arc<Mutex<Vec<RelayRecord>>>) {
    let _ = RELAY_STORE.set(store);
}

pub async fn relay_snapshots() -> Option<Vec<RelaySnapshot>> {
    let store = RELAY_STORE.get()?;
    let guard = store.lock().await;
    if guard.is_empty() {
        None
    } else {
        Some(guard.iter().map(RelayRecord::to_snapshot).collect())
    }
}
