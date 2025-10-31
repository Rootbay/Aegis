use std::sync::Arc;
use std::time::Duration;

use aegis_shared_types::{
    ConnectivityEventPayload, ConnectivityGatewayStatus, ConnectivityTransportStatus,
};
use chrono::Utc;
use libp2p::{swarm::Swarm, Multiaddr, PeerId};
use once_cell::sync::OnceCell;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::Mutex;

use crate::network::{self, TransportSnapshot};

use super::bridge::peer_id_from_multiaddr;
use super::bridge::{bridge_state_snapshot, reset_bridge_state, update_bridge_state};
use super::relays::relay_snapshots;
use super::snapshot::{build_transport_status, compute_snapshot};

#[derive(Clone)]
struct ConnectivityRuntime {
    swarm: Arc<Mutex<Swarm<network::Behaviour>>>,
    router: Arc<Mutex<network::AerpRouter>>,
    local_peer_id: PeerId,
    snapshot_store: Arc<Mutex<Option<ConnectivityEventPayload>>>,
}

impl ConnectivityRuntime {
    fn new(
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

    fn swarm(&self) -> Arc<Mutex<Swarm<network::Behaviour>>> {
        self.swarm.clone()
    }

    fn router(&self) -> Arc<Mutex<network::AerpRouter>> {
        self.router.clone()
    }

    fn local_peer_id(&self) -> PeerId {
        self.local_peer_id.clone()
    }

    fn snapshot_store(&self) -> Arc<Mutex<Option<ConnectivityEventPayload>>> {
        self.snapshot_store.clone()
    }

    async fn router_snapshot(&self) -> network::RouterSnapshot {
        let guard = self.router.lock().await;
        guard.snapshot()
    }
}

static RUNTIME: OnceCell<ConnectivityRuntime> = OnceCell::new();

fn runtime() -> Result<ConnectivityRuntime, String> {
    RUNTIME
        .get()
        .cloned()
        .ok_or_else(|| "Network subsystem not initialised.".to_string())
}

pub fn spawn_connectivity_task<R: Runtime>(
    app: AppHandle<R>,
    swarm: Arc<Mutex<Swarm<network::Behaviour>>>,
    router: Arc<Mutex<network::AerpRouter>>,
    local_peer_id: PeerId,
    snapshot_store: Arc<Mutex<Option<ConnectivityEventPayload>>>,
) {
    let runtime = ConnectivityRuntime::new(swarm, router, local_peer_id, snapshot_store);
    if RUNTIME.set(runtime.clone()).is_err() {
        eprintln!("Connectivity runtime already initialised; overwriting with new instance.");
        let _ = RUNTIME.take();
        let _ = RUNTIME.set(runtime.clone());
    }

    tokio::spawn(async { reset_bridge_state().await });

    let mut transport_events = network::subscribe_transport_events();
    tokio::spawn({
        let app = app.clone();
        let runtime = runtime.clone();
        async move {
            while transport_events.recv().await.is_ok() {
                let _ = collect_emit_snapshot(&app, &runtime).await;
            }
        }
    });

    tokio::spawn({
        let app = app.clone();
        let runtime = runtime.clone();
        async move {
            let _ = collect_emit_snapshot(&app, &runtime).await;
            let mut interval = tokio::time::interval(Duration::from_secs(5));
            loop {
                interval.tick().await;
                let _ = collect_emit_snapshot(&app, &runtime).await;
            }
        }
    });
}

async fn collect_emit_snapshot<R: Runtime>(
    app: &AppHandle<R>,
    runtime: &ConnectivityRuntime,
) -> Option<ConnectivityEventPayload> {
    let snapshot = collect_and_store_snapshot(runtime).await?;
    if let Err(error) = app.emit("connectivity-status", snapshot.clone()) {
        eprintln!("Failed to emit connectivity snapshot: {}", error);
    }
    Some(snapshot)
}

async fn collect_and_store_snapshot(
    runtime: &ConnectivityRuntime,
) -> Option<ConnectivityEventPayload> {
    let bridge_snapshot = bridge_state_snapshot().await;
    let transport_snapshot: TransportSnapshot = network::transport_snapshot();
    let router_snapshot = runtime.router_snapshot().await;
    let relay_snapshots = relay_snapshots().await;

    let snapshot = {
        let swarm_guard = runtime.swarm().lock().await;
        compute_snapshot(
            &swarm_guard,
            &runtime.local_peer_id(),
            Some(&bridge_snapshot),
            &transport_snapshot,
            Some(&router_snapshot),
            relay_snapshots,
        )
    };

    {
        let mut guard = runtime.snapshot_store().lock().await;
        *guard = Some(snapshot.clone());
    }

    Some(snapshot)
}

async fn refresh_connectivity_snapshot<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<ConnectivityEventPayload, String> {
    let runtime = runtime()?;
    let snapshot = collect_and_store_snapshot(&runtime)
        .await
        .ok_or_else(|| "Failed to compute connectivity snapshot.".to_string())?;

    if let Err(error) = app.emit("connectivity-status", snapshot.clone()) {
        eprintln!("Failed to emit connectivity snapshot: {}", error);
    }

    Ok(snapshot)
}

pub async fn emit_bridge_snapshot<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let _ = refresh_connectivity_snapshot(app).await?;
    Ok(())
}

pub async fn set_bridge_mode_enabled<R: Runtime>(
    app: &AppHandle<R>,
    enabled: bool,
) -> Result<ConnectivityGatewayStatus, String> {
    let runtime = runtime()?;
    let swarm = runtime.swarm();

    let (mut dial_targets, mut disconnect_peers, mut error_message) =
        update_bridge_state(|state| {
            if enabled {
                state.enabled = true;
                state.ensure_targets();
                state.last_dial_attempt = Some(Utc::now());
                state.last_error = None;
                state.last_forward_attempt = None;
                state.last_forward_success = None;
                state.last_forward_failure = None;

                if state.upstream_targets.is_empty() {
                    let message = "No upstream targets configured".to_string();
                    state.last_error = Some(message.clone());
                    (Vec::<Multiaddr>::new(), Vec::<PeerId>::new(), Some(message))
                } else {
                    let dial_targets = state.upstream_targets.clone();
                    state.tracked_peers.clear();
                    for addr in &dial_targets {
                        if let Some(peer_id) = peer_id_from_multiaddr(addr) {
                            state.tracked_peers.insert(peer_id);
                        }
                    }
                    (dial_targets, Vec::<PeerId>::new(), None)
                }
            } else {
                let disconnect_peers = state.tracked_peers.iter().cloned().collect();
                state.enabled = false;
                state.last_error = None;
                state.last_dial_attempt = None;
                state.tracked_peers.clear();
                state.last_forward_attempt = None;
                state.last_forward_success = None;
                state.last_forward_failure = None;
                (Vec::<Multiaddr>::new(), disconnect_peers, None)
            }
        })
        .await;

    if enabled && !dial_targets.is_empty() {
        let mut swarm_guard = swarm.lock().await;
        for addr in dial_targets.drain(..) {
            if let Err(error) = libp2p::swarm::Swarm::dial_addr(&mut *swarm_guard, addr.clone()) {
                let message = format!("Failed to dial {}: {}", addr, error);
                error_message = Some(message.clone());
            }
        }
    }

    if !enabled && !disconnect_peers.is_empty() {
        let mut swarm_guard = swarm.lock().await;
        for peer in disconnect_peers.drain(..) {
            let _ = swarm_guard.disconnect_peer_id(peer);
        }
    }

    if let Some(message) = error_message.clone() {
        update_bridge_state(|state| {
            state.last_error = Some(message);
        })
        .await;
    }

    let snapshot = refresh_connectivity_snapshot(app).await?;

    Ok(snapshot
        .gateway_status
        .unwrap_or_else(ConnectivityGatewayStatus::default))
}

pub async fn set_bluetooth_enabled<R: Runtime>(
    app: &AppHandle<R>,
    enabled: bool,
) -> Result<ConnectivityTransportStatus, String> {
    let changed = network::set_bluetooth_enabled(enabled).await?;

    if changed {
        let snapshot = refresh_connectivity_snapshot(app).await?;
        Ok(snapshot
            .transports
            .unwrap_or_else(ConnectivityTransportStatus::default))
    } else {
        Ok(build_transport_status(&network::transport_snapshot()))
    }
}

pub async fn set_wifi_direct_enabled<R: Runtime>(
    app: &AppHandle<R>,
    enabled: bool,
) -> Result<ConnectivityTransportStatus, String> {
    let changed = network::set_wifi_direct_enabled(enabled).await?;

    if changed {
        let snapshot = refresh_connectivity_snapshot(app).await?;
        Ok(snapshot
            .transports
            .unwrap_or_else(ConnectivityTransportStatus::default))
    } else {
        Ok(build_transport_status(&network::transport_snapshot()))
    }
}

pub async fn set_routing_config<R: Runtime>(
    app: &AppHandle<R>,
    update_interval_secs: u64,
    min_quality: f32,
    max_hops: u32,
) -> Result<network::AerpConfig, String> {
    let runtime = runtime()?;
    let router = runtime.router();

    let config = {
        let mut guard = router.lock().await;
        guard.update_parameters(update_interval_secs, min_quality, max_hops as usize);
        guard.config().clone()
    };

    let _ = refresh_connectivity_snapshot(app).await;

    Ok(config)
}
