use std::sync::Arc;

use aegis_shared_types::ConnectivityEventPayload;
use libp2p::{swarm::Swarm, PeerId};
use tauri::{AppHandle, Runtime};
use tokio::sync::Mutex;

use crate::network;

use super::super::bridge::reset_bridge_state;
use super::orchestrator::{emit_periodic_snapshots, snapshot_event_receiver};
use super::runtime::initialise_runtime;

pub fn spawn_connectivity_task<R: Runtime>(
    app: AppHandle<R>,
    swarm: Arc<Mutex<Swarm<network::Behaviour>>>,
    router: Arc<Mutex<network::AerpRouter>>,
    local_peer_id: PeerId,
    snapshot_store: Arc<Mutex<Option<ConnectivityEventPayload>>>,
) {
    let runtime = initialise_runtime(swarm, router, local_peer_id, snapshot_store);

    tokio::spawn(async { reset_bridge_state().await });

    let transport_events = snapshot_event_receiver();
    emit_periodic_snapshots(app, runtime, transport_events);
}
