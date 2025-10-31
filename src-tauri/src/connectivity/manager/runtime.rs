use std::sync::Arc;

use aegis_shared_types::ConnectivityEventPayload;
use libp2p::{swarm::Swarm, PeerId};
use once_cell::sync::OnceCell;
use tokio::sync::Mutex;

use crate::network;

#[derive(Clone)]
pub struct ConnectivityRuntime {
    swarm: Arc<Mutex<Swarm<network::Behaviour>>>,
    router: Arc<Mutex<network::AerpRouter>>,
    local_peer_id: PeerId,
    snapshot_store: Arc<Mutex<Option<ConnectivityEventPayload>>>,
}

impl ConnectivityRuntime {
    pub fn new(
        swarm: Arc<Mutex<Swarm<network::Behaviour>>>,
        router: Arc<Mutex<network::AerpRouter>>,
        local_peer_id: PeerId,
        snapshot_store: Arc<Mutex<Option<ConnectivityEventPayload>>>,
    ) -> Self {
        Self {
            swarm,
            router,
            local_peer_id,
            snapshot_store,
        }
    }

    pub fn swarm(&self) -> Arc<Mutex<Swarm<network::Behaviour>>> {
        Arc::clone(&self.swarm)
    }

    pub fn router(&self) -> Arc<Mutex<network::AerpRouter>> {
        Arc::clone(&self.router)
    }

    pub fn local_peer_id(&self) -> PeerId {
        self.local_peer_id.clone()
    }

    pub fn snapshot_store(&self) -> Arc<Mutex<Option<ConnectivityEventPayload>>> {
        Arc::clone(&self.snapshot_store)
    }

    pub async fn router_snapshot(&self) -> network::RouterSnapshot {
        let guard = self.router.lock().await;
        guard.snapshot()
    }

    pub async fn store_snapshot(&self, snapshot: ConnectivityEventPayload) {
        let mut guard = self.snapshot_store.lock().await;
        *guard = Some(snapshot);
    }
}

static RUNTIME: OnceCell<ConnectivityRuntime> = OnceCell::new();

pub fn initialise_runtime(
    swarm: Arc<Mutex<Swarm<network::Behaviour>>>,
    router: Arc<Mutex<network::AerpRouter>>,
    local_peer_id: PeerId,
    snapshot_store: Arc<Mutex<Option<ConnectivityEventPayload>>>,
) -> ConnectivityRuntime {
    let runtime = ConnectivityRuntime::new(swarm, router, local_peer_id, snapshot_store);

    if RUNTIME.set(runtime.clone()).is_err() {
        eprintln!("Connectivity runtime already initialised; overwriting with new instance.");
        let _ = RUNTIME.take();
        let _ = RUNTIME.set(runtime.clone());
    }

    runtime
}

pub fn current_runtime() -> Result<ConnectivityRuntime, String> {
    RUNTIME
        .get()
        .cloned()
        .ok_or_else(|| "Network subsystem not initialised.".to_string())
}
