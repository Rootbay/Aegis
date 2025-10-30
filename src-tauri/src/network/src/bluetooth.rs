use std::sync::Arc;

use once_cell::sync::Lazy;
use tokio::sync::Mutex;

use crate::transports::{self, TransportMedium};

#[cfg(feature = "bluetooth")]
#[allow(unused_imports)]
use bleasy as _bleasy;

#[cfg(feature = "bluetooth")]
use btleplug::api::{Central, Manager as _};
#[cfg(feature = "bluetooth")]
use btleplug::platform::Manager;

static BLUETOOTH_STATE: Lazy<Arc<Mutex<bool>>> = Lazy::new(|| Arc::new(Mutex::new(false)));

pub async fn set_bluetooth_enabled(enabled: bool) -> Result<bool, String> {
    let changed = transports::set_medium_enabled(TransportMedium::Bluetooth, enabled);
    let mut guard = BLUETOOTH_STATE.lock().await;

    if enabled {
        if !*guard {
            #[cfg(feature = "bluetooth")]
            if let Err(error) = initialise_adapters().await {
                eprintln!("Failed to initialise Bluetooth adapters: {}", error);
            }
            *guard = true;
        }
    } else if *guard {
        transports::clear_medium(TransportMedium::Bluetooth);
        *guard = false;
    }

    Ok(changed)
}

#[cfg(feature = "bluetooth")]
async fn initialise_adapters() -> Result<(), String> {
    let manager = Manager::new().await.map_err(|error| error.to_string())?;
    let adapters = manager
        .adapters()
        .await
        .map_err(|error| error.to_string())?;

    for adapter in adapters {
        if let Err(error) = adapter.start_scan(Default::default()).await {
            eprintln!("Failed to start Bluetooth scan: {}", error);
        }
    }

    Ok(())
}
