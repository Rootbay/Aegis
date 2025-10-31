use std::sync::Arc;

use once_cell::sync::Lazy;
use tokio::sync::Mutex;

use crate::transports::{self, TransportMedium};

#[cfg(feature = "bluetooth")]
use btleplug::api::{
    Central, CentralEvent, Manager as _, Peripheral as _, PeripheralId, PeripheralProperties,
};
#[cfg(feature = "bluetooth")]
use btleplug::platform::{Adapter, Manager};
#[cfg(feature = "bluetooth")]
use libp2p::PeerId;
#[cfg(feature = "bluetooth")]
use std::collections::HashMap;
#[cfg(feature = "bluetooth")]
use std::str::FromStr;
#[cfg(feature = "bluetooth")]
use tokio::task::JoinHandle;
#[cfg(feature = "bluetooth")]
use tokio_stream::StreamExt;

static BLUETOOTH_STATE: Lazy<Arc<Mutex<bool>>> = Lazy::new(|| Arc::new(Mutex::new(false)));

#[cfg(feature = "bluetooth")]
static BLUETOOTH_WORKER: Lazy<Arc<Mutex<Option<BluetoothWorker>>>> =
    Lazy::new(|| Arc::new(Mutex::new(None)));

#[cfg(feature = "bluetooth")]
const MANUFACTURER_ID: u16 = 0xAE15;
#[cfg(feature = "bluetooth")]
const LOCAL_NAME_PREFIX: &str = "Aegis:";

pub async fn set_bluetooth_enabled(enabled: bool) -> Result<bool, String> {
    let mut guard = BLUETOOTH_STATE.lock().await;

    if enabled {
        if *guard {
            return Ok(false);
        }

        #[cfg(not(feature = "bluetooth"))]
        {
            return Err(
                "Bluetooth transport support is not available on this platform.".to_string(),
            );
        }

        #[cfg(feature = "bluetooth")]
        {
            let worker = BluetoothWorker::start().await?;
            BLUETOOTH_WORKER.lock().await.replace(worker);

            let changed = transports::set_medium_enabled(TransportMedium::Bluetooth, true);
            *guard = true;
            return Ok(changed);
        }

        #[allow(unreachable_code)]
        Ok(false)
    } else if *guard {
        let changed = transports::set_medium_enabled(TransportMedium::Bluetooth, false);
        transports::clear_medium(TransportMedium::Bluetooth);

        #[cfg(feature = "bluetooth")]
        if let Some(worker) = BLUETOOTH_WORKER.lock().await.take() {
            worker.shutdown().await;
        }

        *guard = false;
        Ok(changed)
    } else {
        Ok(false)
    }
}

#[cfg(feature = "bluetooth")]
struct BluetoothWorker {
    tasks: Vec<JoinHandle<()>>,
}

#[cfg(feature = "bluetooth")]
impl BluetoothWorker {
    async fn start() -> Result<Self, String> {
        let manager = Manager::new().await.map_err(|error| error.to_string())?;
        let adapters = manager
            .adapters()
            .await
            .map_err(|error| error.to_string())?;

        if adapters.is_empty() {
            return Err("No Bluetooth adapters detected.".to_string());
        }

        let mut tasks = Vec::new();
        for adapter in adapters {
            match adapter.start_scan(Default::default()).await {
                Ok(_) => {}
                Err(error) => {
                    eprintln!("Failed to start Bluetooth scan on adapter: {}", error);
                }
            }

            let task = tokio::spawn(run_adapter(adapter));
            tasks.push(task);
        }

        Ok(Self { tasks })
    }

    async fn shutdown(self) {
        for task in self.tasks {
            task.abort();
        }
    }
}

#[cfg(feature = "bluetooth")]
async fn run_adapter(adapter: Adapter) {
    let info = adapter.adapter_info().await.ok();
    if let Some(info) = info {
        eprintln!("Bluetooth adapter ready: {}", info);
    }

    let mut events = match adapter.events().await {
        Ok(stream) => stream,
        Err(error) => {
            eprintln!("Failed to subscribe to Bluetooth events: {}", error);
            return;
        }
    };

    let mut known_peers: HashMap<String, PeerId> = HashMap::new();

    while let Some(event) = events.next().await {
        match event {
            CentralEvent::DeviceDiscovered(id)
            | CentralEvent::DeviceUpdated(id)
            | CentralEvent::DeviceConnected(id) => {
                handle_peripheral_update(&adapter, &id, &mut known_peers).await;
            }
            CentralEvent::ManufacturerDataAdvertisement {
                id,
                manufacturer_data,
            } => {
                if let Some(peer_id) = manufacturer_data
                    .get(&MANUFACTURER_ID)
                    .and_then(|data| parse_peer_id_bytes(data))
                {
                    update_peer_presence(&mut known_peers, &id, peer_id);
                }
            }
            CentralEvent::DeviceDisconnected(id) => {
                remove_peer(&mut known_peers, &id);
            }
            CentralEvent::ServiceDataAdvertisement { id, service_data } => {
                if let Some(peer_id) = service_data
                    .values()
                    .find_map(|data| parse_peer_id_bytes(data))
                {
                    update_peer_presence(&mut known_peers, &id, peer_id);
                }
            }
            CentralEvent::ServicesAdvertisement { .. } | CentralEvent::StateUpdate(_) => {}
        }
    }
}

#[cfg(feature = "bluetooth")]
async fn handle_peripheral_update(
    adapter: &Adapter,
    id: &PeripheralId,
    known_peers: &mut HashMap<String, PeerId>,
) {
    match adapter.peripheral(id).await {
        Ok(peripheral) => match peripheral.properties().await {
            Ok(Some(properties)) => {
                if let Some(peer_id) = extract_peer_id(&properties) {
                    update_peer_presence(known_peers, id, peer_id);
                }
            }
            Ok(None) => {}
            Err(error) => {
                eprintln!("Failed to read Bluetooth properties: {}", error);
            }
        },
        Err(error) => {
            eprintln!("Failed to access Bluetooth peripheral: {}", error);
        }
    }
}

#[cfg(feature = "bluetooth")]
fn update_peer_presence(
    known_peers: &mut HashMap<String, PeerId>,
    id: &PeripheralId,
    peer_id: PeerId,
) {
    let key = format!("{:?}", id);
    if let Some(existing) = known_peers.insert(key, peer_id.clone()) {
        if existing != peer_id {
            transports::set_peer_presence(TransportMedium::Bluetooth, existing, false);
        }
    }
    transports::set_peer_presence(TransportMedium::Bluetooth, peer_id, true);
}

#[cfg(feature = "bluetooth")]
fn remove_peer(known_peers: &mut HashMap<String, PeerId>, id: &PeripheralId) {
    let key = format!("{:?}", id);
    if let Some(peer_id) = known_peers.remove(&key) {
        transports::set_peer_presence(TransportMedium::Bluetooth, peer_id, false);
    }
}

#[cfg(feature = "bluetooth")]
fn extract_peer_id(properties: &PeripheralProperties) -> Option<PeerId> {
    if let Some(peer_id) = properties
        .manufacturer_data
        .get(&MANUFACTURER_ID)
        .and_then(|data| parse_peer_id_bytes(data))
    {
        return Some(peer_id);
    }

    for data in properties.service_data.values() {
        if let Some(peer_id) = parse_peer_id_bytes(data) {
            return Some(peer_id);
        }
    }

    if let Some(name) = &properties.local_name {
        if let Some(rest) = name.strip_prefix(LOCAL_NAME_PREFIX) {
            return parse_peer_id_str(rest.trim());
        }
    }

    None
}

#[cfg(feature = "bluetooth")]
fn parse_peer_id_bytes(bytes: &[u8]) -> Option<PeerId> {
    let trimmed = match std::str::from_utf8(bytes) {
        Ok(value) => value.trim_matches(char::from(0)).trim(),
        Err(_) => return None,
    };
    if trimmed.is_empty() {
        return None;
    }
    parse_peer_id_str(trimmed)
}

#[cfg(feature = "bluetooth")]
fn parse_peer_id_str(value: &str) -> Option<PeerId> {
    PeerId::from_str(value).ok()
}
