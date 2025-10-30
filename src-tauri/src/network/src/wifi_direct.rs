use std::sync::Arc;

use once_cell::sync::Lazy;
use tokio::sync::Mutex;

use crate::transports::{self, TransportMedium};

static WIFI_DIRECT_STATE: Lazy<Arc<Mutex<bool>>> = Lazy::new(|| Arc::new(Mutex::new(false)));

pub async fn set_wifi_direct_enabled(enabled: bool) -> Result<bool, String> {
    let changed = transports::set_medium_enabled(TransportMedium::WifiDirect, enabled);
    let mut guard = WIFI_DIRECT_STATE.lock().await;

    if enabled {
        if !*guard {
            *guard = true;
        }
    } else if *guard {
        transports::clear_medium(TransportMedium::WifiDirect);
        *guard = false;
    }

    Ok(changed)
}
