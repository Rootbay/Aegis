use std::collections::HashSet;
use std::sync::Arc;

use libp2p::PeerId;
use once_cell::sync::OnceCell;
use parking_lot::RwLock;

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

impl TransportManager {
    pub fn new() -> Self {
        Self { inner: RwLock::new(TransportInner::default()) }
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
    }

    pub fn set_enabled(&self, medium: TransportMedium, enabled: bool) -> bool {
        let mut guard = self.inner.write();
        let (flag, peers) = match medium {
            TransportMedium::Tcp => return false,
            TransportMedium::Bluetooth => (&mut guard.bluetooth_enabled, &mut guard.bluetooth_peers),
            TransportMedium::WifiDirect => (&mut guard.wifi_direct_enabled, &mut guard.wifi_direct_peers),
        };

        let changed = *flag != enabled;
        *flag = enabled;

        if !enabled {
            peers.clear();
        } else if let Some(local) = guard.local_peer_id.clone() {
            // Track the local peer so UI components can reflect advertising state.
            peers.insert(local);
        }

        changed
    }

    pub fn clear_medium(&self, medium: TransportMedium) {
        let mut guard = self.inner.write();
        match medium {
            TransportMedium::Tcp => {}
            TransportMedium::Bluetooth => guard.bluetooth_peers.clear(),
            TransportMedium::WifiDirect => guard.wifi_direct_peers.clear(),
        }
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

pub fn set_medium_enabled(medium: TransportMedium, enabled: bool) -> bool {
    global_manager().set_enabled(medium, enabled)
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
