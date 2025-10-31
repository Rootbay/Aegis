use std::collections::HashSet;
use std::sync::Arc;

use libp2p::PeerId;
use once_cell::sync::OnceCell;
use parking_lot::RwLock;
use tokio::sync::broadcast;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum TransportMedium {
    Tcp,
    Bluetooth,
    WifiDirect,
}

#[derive(Clone, Debug, Default)]
pub struct TransportSnapshot {
    pub local_peer_id: Option<PeerId>,
    pub bluetooth_enabled: bool,
    pub wifi_direct_enabled: bool,
    pub bluetooth_peers: Vec<PeerId>,
    pub wifi_direct_peers: Vec<PeerId>,
}

#[derive(Default)]
struct TransportInner {
    local_peer_id: Option<PeerId>,
    bluetooth_enabled: bool,
    wifi_direct_enabled: bool,
    bluetooth_peers: HashSet<PeerId>,
    wifi_direct_peers: HashSet<PeerId>,
}

#[derive(Default)]
pub struct TransportManager {
    inner: RwLock<TransportInner>,
}

static TRANSPORT_NOTIFIER: OnceCell<broadcast::Sender<TransportSnapshot>> = OnceCell::new();

fn notifier() -> &'static broadcast::Sender<TransportSnapshot> {
    TRANSPORT_NOTIFIER.get_or_init(|| {
        let (tx, _rx) = broadcast::channel(32);
        tx
    })
}

fn publish_snapshot(snapshot: TransportSnapshot) {
    if let Some(sender) = TRANSPORT_NOTIFIER.get() {
        let _ = sender.send(snapshot);
    }
}

impl TransportManager {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(TransportInner::default()),
        }
    }

    pub fn set_local_peer(&self, peer_id: PeerId) {
        let mut guard = self.inner.write();
        guard.local_peer_id = Some(peer_id.clone());
        if guard.bluetooth_enabled {
            guard.bluetooth_peers.insert(peer_id.clone());
        }
        if guard.wifi_direct_enabled {
            guard.wifi_direct_peers.insert(peer_id);
        }
        drop(guard);
        publish_snapshot(self.snapshot());
    }

    pub fn set_enabled(&self, medium: TransportMedium, enabled: bool) -> bool {
        let mut guard = self.inner.write();
        match medium {
            TransportMedium::Tcp => false,
            TransportMedium::Bluetooth => {
                let changed = guard.bluetooth_enabled != enabled;
                guard.bluetooth_enabled = enabled;

                if !enabled {
                    guard.bluetooth_peers.clear();
                } else if let Some(local) = guard.local_peer_id.clone() {
                    // Track the local peer so UI components can reflect advertising state.
                    guard.bluetooth_peers.insert(local);
                }

                changed
            }
            TransportMedium::WifiDirect => {
                let changed = guard.wifi_direct_enabled != enabled;
                guard.wifi_direct_enabled = enabled;

                if !enabled {
                    guard.wifi_direct_peers.clear();
                } else if let Some(local) = guard.local_peer_id.clone() {
                    guard.wifi_direct_peers.insert(local);
                }

                changed
            }
        }
    }

    pub fn clear_medium(&self, medium: TransportMedium) {
        let mut guard = self.inner.write();
        match medium {
            TransportMedium::Tcp => {}
            TransportMedium::Bluetooth => guard.bluetooth_peers.clear(),
            TransportMedium::WifiDirect => guard.wifi_direct_peers.clear(),
        }
        drop(guard);
        publish_snapshot(self.snapshot());
    }

    pub fn set_peer_presence(&self, medium: TransportMedium, peer_id: PeerId, present: bool) {
        let mut guard = self.inner.write();
        let peers = match medium {
            TransportMedium::Tcp => return,
            TransportMedium::Bluetooth => &mut guard.bluetooth_peers,
            TransportMedium::WifiDirect => &mut guard.wifi_direct_peers,
        };

        if present {
            peers.insert(peer_id);
        } else {
            peers.remove(&peer_id);
        }
        drop(guard);
        publish_snapshot(self.snapshot());
    }

    pub fn snapshot(&self) -> TransportSnapshot {
        let guard = self.inner.read();
        TransportSnapshot {
            local_peer_id: guard.local_peer_id.clone(),
            bluetooth_enabled: guard.bluetooth_enabled,
            wifi_direct_enabled: guard.wifi_direct_enabled,
            bluetooth_peers: guard.bluetooth_peers.iter().cloned().collect(),
            wifi_direct_peers: guard.wifi_direct_peers.iter().cloned().collect(),
        }
    }

    pub fn local_peer_id(&self) -> Option<PeerId> {
        self.inner.read().local_peer_id.clone()
    }
}

static GLOBAL_MANAGER: OnceCell<Arc<TransportManager>> = OnceCell::new();

pub fn global_manager() -> Arc<TransportManager> {
    GLOBAL_MANAGER
        .get_or_init(|| Arc::new(TransportManager::new()))
        .clone()
}

pub fn snapshot() -> TransportSnapshot {
    global_manager().snapshot()
}

pub fn subscribe_changes() -> broadcast::Receiver<TransportSnapshot> {
    notifier().subscribe()
}

pub fn set_medium_enabled(medium: TransportMedium, enabled: bool) -> bool {
    let manager = global_manager();
    let changed = manager.set_enabled(medium, enabled);
    if changed {
        publish_snapshot(manager.snapshot());
    }
    changed
}

pub fn register_local_peer(peer_id: PeerId) {
    global_manager().set_local_peer(peer_id);
}

pub fn set_peer_presence(medium: TransportMedium, peer_id: PeerId, present: bool) {
    global_manager().set_peer_presence(medium, peer_id, present);
}

pub fn clear_medium(medium: TransportMedium) {
    global_manager().clear_medium(medium);
}

pub fn local_peer_id() -> Option<PeerId> {
    global_manager().local_peer_id()
}
