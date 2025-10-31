use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use aegis_shared_types::{
    ConnectivityEventPayload, ConnectivityGatewayStatus, ConnectivityLink, ConnectivityPeer,
    ConnectivityTransportStatus,
};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use libp2p::{multiaddr::Protocol, swarm::Swarm, Multiaddr, PeerId};
use once_cell::sync::{Lazy, OnceCell};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::Mutex;

use network::{self, TransportSnapshot};

static SWARM_HANDLE: OnceCell<Arc<Mutex<Swarm<network::Behaviour>>>> = OnceCell::new();
static SNAPSHOT_STORE: OnceCell<Arc<Mutex<Option<ConnectivityEventPayload>>>> = OnceCell::new();
static LOCAL_PEER_ID: OnceCell<PeerId> = OnceCell::new();
static ROUTER_HANDLE: OnceCell<Arc<Mutex<network::AerpRouter>>> = OnceCell::new();
static BRIDGE_STATE: Lazy<Arc<Mutex<BridgeState>>> =
    Lazy::new(|| Arc::new(Mutex::new(BridgeState::new())));

#[derive(Clone, Default)]
struct BridgeSnapshot {
    enabled: bool,
    upstream_targets: Vec<Multiaddr>,
    tracked_peers: Vec<PeerId>,
    last_dial_attempt: Option<DateTime<Utc>>,
    last_error: Option<String>,
    last_forward_attempt: Option<DateTime<Utc>>,
    last_forward_success: Option<DateTime<Utc>>,
    last_forward_failure: Option<DateTime<Utc>>,
}

#[derive(Default)]
struct BridgeState {
    enabled: bool,
    upstream_targets: Vec<Multiaddr>,
    tracked_peers: HashSet<PeerId>,
    last_dial_attempt: Option<DateTime<Utc>>,
    last_error: Option<String>,
    last_forward_attempt: Option<DateTime<Utc>>,
    last_forward_success: Option<DateTime<Utc>>,
    last_forward_failure: Option<DateTime<Utc>>,
}

impl BridgeState {
    fn new() -> Self {
        Self {
            upstream_targets: default_upstream_multiaddrs(),
            ..Default::default()
        }
    }

    fn snapshot(&self) -> BridgeSnapshot {
        BridgeSnapshot {
            enabled: self.enabled,
            upstream_targets: self.upstream_targets.clone(),
            tracked_peers: self.tracked_peers.iter().cloned().collect(),
            last_dial_attempt: self.last_dial_attempt,
            last_error: self.last_error.clone(),
            last_forward_attempt: self.last_forward_attempt,
            last_forward_success: self.last_forward_success,
            last_forward_failure: self.last_forward_failure,
        }
    }

    fn ensure_targets(&mut self) {
        if self.upstream_targets.is_empty() {
            self.upstream_targets = default_upstream_multiaddrs();
        }
    }
}

fn default_upstream_multiaddrs() -> Vec<Multiaddr> {
    let env_value = std::env::var("AEGIS_BRIDGE_UPLINKS").unwrap_or_default();

    let mut addrs: Vec<Multiaddr> = env_value
        .split(|c| matches!(c, ',' | ';' | '\n' | '\r'))
        .filter_map(|segment| {
            let trimmed = segment.trim();
            if trimmed.is_empty() {
                return None;
            }
            match trimmed.parse::<Multiaddr>() {
                Ok(addr) => Some(addr),
                Err(error) => {
                    eprintln!("Invalid bridge upstream address '{}': {}", trimmed, error);
                    None
                }
            }
        })
        .collect();

    if addrs.is_empty() {
        if let Ok(addr) =
            "/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p-webrtc-star".parse::<Multiaddr>()
        {
            addrs.push(addr);
        }
    }

    addrs
}

fn peer_id_from_multiaddr(addr: &Multiaddr) -> Option<PeerId> {
    for protocol in addr.iter() {
        if let Protocol::P2p(multihash) = protocol {
            if let Ok(peer_id) = PeerId::from_multihash(multihash) {
                return Some(peer_id);
            }
        }
    }
    None
}

fn build_transport_status(snapshot: &TransportSnapshot) -> ConnectivityTransportStatus {
    ConnectivityTransportStatus {
        bluetooth_enabled: Some(snapshot.bluetooth_enabled),
        wifi_direct_enabled: Some(snapshot.wifi_direct_enabled),
        bluetooth_peers: Some(
            snapshot
                .bluetooth_peers
                .iter()
                .map(|peer| peer.to_base58())
                .collect(),
        ),
        wifi_direct_peers: Some(
            snapshot
                .wifi_direct_peers
                .iter()
                .map(|peer| peer.to_base58())
                .collect(),
        ),
        local_peer_id: snapshot.local_peer_id.as_ref().map(|peer| peer.to_base58()),
    }
}

async fn bridge_state_snapshot() -> Option<BridgeSnapshot> {
    let state = BRIDGE_STATE.clone();
    let guard = state.lock().await;
    Some(guard.snapshot())
}

pub fn spawn_connectivity_task<R: Runtime>(
    app: AppHandle<R>,
    swarm: Arc<Mutex<Swarm<network::Behaviour>>>,
    router: Arc<Mutex<network::AerpRouter>>,
    local_peer_id: PeerId,
    snapshot_store: Arc<Mutex<Option<ConnectivityEventPayload>>>,
) {
    SWARM_HANDLE.get_or_init(|| swarm.clone());
    SNAPSHOT_STORE.get_or_init(|| snapshot_store.clone());
    LOCAL_PEER_ID.get_or_init(|| local_peer_id.clone());
    ROUTER_HANDLE.get_or_init(|| router.clone());

    let mut transport_events = network::subscribe_transport_events();
    {
        let swarm_clone = swarm.clone();
        let snapshot_store_clone = snapshot_store.clone();
        let app_clone = app.clone();
        let local_peer_id_clone = local_peer_id.clone();
        tokio::spawn(async move {
            while transport_events.recv().await.is_ok() {
                if let Some(snapshot) = collect_and_store_snapshot(
                    &swarm_clone,
                    &local_peer_id_clone,
                    &snapshot_store_clone,
                )
                .await
                {
                    if let Err(error) = app_clone.emit("connectivity-status", snapshot.clone()) {
                        eprintln!("Failed to emit connectivity snapshot: {}", error);
                    }
                }
            }
        });
    }

    {
        let bridge_state = BRIDGE_STATE.clone();
        tokio::spawn(async move {
            let mut guard = bridge_state.lock().await;
            *guard = BridgeState::new();
        });
    }

    tokio::spawn(async move {
        let local_peer_id_clone = local_peer_id.clone();
        if let Some(snapshot) =
            collect_and_store_snapshot(&swarm, &local_peer_id_clone, &snapshot_store).await
        {
            if let Err(error) = app.emit("connectivity-status", snapshot.clone()) {
                eprintln!("Failed to emit initial connectivity snapshot: {}", error);
            }
        }

        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;
            if let Some(snapshot) =
                collect_and_store_snapshot(&swarm, &local_peer_id_clone, &snapshot_store).await
            {
                if let Err(error) = app.emit("connectivity-status", snapshot.clone()) {
                    eprintln!("Failed to emit connectivity snapshot: {}", error);
                }
            }
        }
    });
}

async fn collect_and_store_snapshot(
    swarm: &Arc<Mutex<Swarm<network::Behaviour>>>,
    local_peer_id: &PeerId,
    snapshot_store: &Arc<Mutex<Option<ConnectivityEventPayload>>>,
) -> Option<ConnectivityEventPayload> {
    let bridge_snapshot = bridge_state_snapshot().await;
    let transport_snapshot = network::transport_snapshot();
    let router_snapshot = if let Some(router) = ROUTER_HANDLE.get() {
        let guard = router.lock().await;
        Some(guard.snapshot())
    } else {
        None
    };
    let snapshot = {
        let swarm_guard = swarm.lock().await;
        compute_snapshot(
            &swarm_guard,
            local_peer_id,
            bridge_snapshot.as_ref(),
            &transport_snapshot,
            router_snapshot.as_ref(),
        )
    };

    {
        let mut guard = snapshot_store.lock().await;
        *guard = Some(snapshot.clone());
    }

    Some(snapshot)
}

async fn refresh_connectivity_snapshot<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<ConnectivityEventPayload, String> {
    let swarm = SWARM_HANDLE
        .get()
        .cloned()
        .ok_or_else(|| "Network swarm not initialised.".to_string())?;
    let snapshot_store = SNAPSHOT_STORE
        .get()
        .cloned()
        .ok_or_else(|| "Snapshot store not initialised.".to_string())?;
    let local_peer_id = LOCAL_PEER_ID
        .get()
        .cloned()
        .ok_or_else(|| "Local peer ID unavailable.".to_string())?;

    let snapshot = collect_and_store_snapshot(&swarm, &local_peer_id, &snapshot_store)
        .await
        .ok_or_else(|| "Failed to compute connectivity snapshot.".to_string())?;

    if let Err(error) = app.emit("connectivity-status", snapshot.clone()) {
        eprintln!("Failed to emit connectivity snapshot: {}", error);
    }

    Ok(snapshot)
}

fn compute_snapshot(
    swarm: &Swarm<network::Behaviour>,
    local_peer_id: &PeerId,
    bridge_snapshot: Option<&BridgeSnapshot>,
    transport_snapshot: &TransportSnapshot,
    router_snapshot: Option<&network::RouterSnapshot>,
) -> ConnectivityEventPayload {
    let connected: Vec<_> = swarm
        .behaviour()
        .gossipsub
        .all_peers()
        .map(|(peer_id, _)| peer_id.clone())
        .collect();
    let now = Utc::now().to_rfc3339();
    let local_peer_id_b58 = local_peer_id.to_base58();

    let transport_status = build_transport_status(transport_snapshot);

    let mut bluetooth_peers: HashSet<PeerId> =
        transport_snapshot.bluetooth_peers.iter().cloned().collect();
    let mut wifi_direct_peers: HashSet<PeerId> = transport_snapshot
        .wifi_direct_peers
        .iter()
        .cloned()
        .collect();

    if let Some(local) = transport_snapshot.local_peer_id.as_ref() {
        bluetooth_peers.remove(local);
        wifi_direct_peers.remove(local);
    }

    let tracked_upstreams: HashSet<PeerId> = bridge_snapshot
        .map(|snapshot| snapshot.tracked_peers.iter().cloned().collect())
        .unwrap_or_default();

    let upstream_connected = connected
        .iter()
        .filter(|peer| tracked_upstreams.contains(peer))
        .count() as u32;

    let bridge_mode_enabled = bridge_snapshot
        .map(|snapshot| snapshot.enabled)
        .unwrap_or(false);
    let forwarding_active = forwarding_active(bridge_snapshot, upstream_connected);

    let mut peer_entries: HashMap<String, ConnectivityPeer> = HashMap::new();
    peer_entries.insert(
        local_peer_id_b58.clone(),
        ConnectivityPeer {
            id: Some(local_peer_id_b58.clone()),
            label: Some("This Device".to_string()),
            connection: Some("self".to_string()),
            hop_count: Some(0),
            via: None,
            latency_ms: Some(0),
            last_seen: Some(now.clone()),
            is_gateway: Some(forwarding_active),
            route_quality: Some(1.0),
            success_rate: Some(1.0),
        },
    );

    let mut link_entries: HashMap<(String, String), ConnectivityLink> = HashMap::new();

    for peer in connected {
        let peer_id_b58 = peer.to_base58();
        let is_upstream = tracked_upstreams.contains(&peer);
        let connection_type = if is_upstream {
            "internet"
        } else if bluetooth_peers.contains(&peer) {
            "bluetooth"
        } else if wifi_direct_peers.contains(&peer) {
            "wifi-direct"
        } else {
            "mesh"
        };

        peer_entries
            .entry(peer_id_b58.clone())
            .and_modify(|entry| {
                entry.connection = Some(connection_type.to_string());
                entry.via = Some(local_peer_id_b58.clone());
                entry.last_seen = Some(now.clone());
                entry.is_gateway = Some(is_upstream);
            })
            .or_insert(ConnectivityPeer {
                id: Some(peer_id_b58.clone()),
                label: None,
                connection: Some(connection_type.to_string()),
                hop_count: None,
                via: Some(local_peer_id_b58.clone()),
                latency_ms: None,
                last_seen: Some(now.clone()),
                is_gateway: Some(is_upstream),
                route_quality: None,
                success_rate: None,
            });

        link_entries
            .entry((local_peer_id_b58.clone(), peer_id_b58.clone()))
            .or_insert(ConnectivityLink {
                source: Some(local_peer_id_b58.clone()),
                target: Some(peer_id_b58.clone()),
                quality: None,
                medium: Some(connection_type.to_string()),
                latency_ms: None,
            });
    }

    if let Some(snapshot) = router_snapshot {
        for route in &snapshot.routes {
            let target_id = route.target.to_base58();
            let via = route.via.as_ref().map(|peer| peer.to_base58());
            let metrics = &route.metrics;
            let latency = metrics
                .total_latency_ms
                .round()
                .clamp(0.0, f64::from(u32::MAX));
            peer_entries
                .entry(target_id.clone())
                .and_modify(|entry| {
                    entry.hop_count = Some(metrics.hop_count);
                    entry.via = via.clone();
                    entry.latency_ms = Some(latency as u32);
                    entry.route_quality = Some(metrics.quality());
                    entry.success_rate = Some(metrics.reliability as f32);
                })
                .or_insert(ConnectivityPeer {
                    id: Some(target_id.clone()),
                    label: None,
                    connection: Some("mesh".to_string()),
                    hop_count: Some(metrics.hop_count),
                    via: via.clone(),
                    latency_ms: Some(latency as u32),
                    last_seen: Some(now.clone()),
                    is_gateway: Some(false),
                    route_quality: Some(metrics.quality()),
                    success_rate: Some(metrics.reliability as f32),
                });
        }

        for link in &snapshot.links {
            let source = link.source.to_base58();
            let target = link.target.to_base58();
            let quality = link.quality.reliability as f32;
            let latency = link.quality.latency_ms as f32;
            let entry = link_entries
                .entry((source.clone(), target.clone()))
                .or_insert(ConnectivityLink {
                    source: Some(source.clone()),
                    target: Some(target.clone()),
                    quality: None,
                    medium: Some("mesh".to_string()),
                    latency_ms: None,
                });
            entry.quality = Some(quality.clamp(0.0, 1.0));
            entry.latency_ms = Some(latency.max(0.0));
        }
    }

    let mut peers: Vec<ConnectivityPeer> = peer_entries.into_iter().map(|(_, peer)| peer).collect();
    peers.sort_by(|a, b| {
        let a_is_local = a.id.as_deref() == Some(local_peer_id_b58.as_str());
        let b_is_local = b.id.as_deref() == Some(local_peer_id_b58.as_str());
        match (a_is_local, b_is_local) {
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            _ => {
                a.id.as_ref()
                    .unwrap_or(&String::new())
                    .cmp(b.id.as_ref().unwrap_or(&String::new()))
            }
        }
    });

    let mut links: Vec<ConnectivityLink> = link_entries.into_iter().map(|(_, link)| link).collect();
    links.sort_by(|a, b| {
        let key_a = (
            a.source.as_ref().cloned().unwrap_or_default(),
            a.target.as_ref().cloned().unwrap_or_default(),
        );
        let key_b = (
            b.source.as_ref().cloned().unwrap_or_default(),
            b.target.as_ref().cloned().unwrap_or_default(),
        );
        key_a.cmp(&key_b)
    });

    let mesh_peer_count = peers
        .iter()
        .filter(|peer| {
            matches!(
                peer.connection.as_deref(),
                Some("mesh" | "bluetooth" | "wifi-direct" | "bridge")
            )
        })
        .count() as u32;
    let total_peers = peers.len() as u32;
    let mesh_reachable = mesh_peer_count > 0;

    let last_dial_attempt = bridge_snapshot
        .and_then(|snapshot| snapshot.last_dial_attempt.as_ref())
        .map(|value| value.to_rfc3339());
    let last_error = bridge_snapshot.and_then(|snapshot| snapshot.last_error.clone());

    let gateway_status = ConnectivityGatewayStatus {
        bridge_mode_enabled: Some(bridge_mode_enabled),
        forwarding: Some(forwarding_active),
        upstream_peer_count: Some(upstream_connected),
        last_dial_attempt,
        last_error,
    };

    let bridge_suggested = mesh_peer_count > 0 && !forwarding_active;

    ConnectivityEventPayload {
        internet_reachable: Some(forwarding_active),
        mesh_reachable: Some(mesh_reachable),
        total_peers: Some(total_peers),
        mesh_peers: Some(mesh_peer_count),
        peers: Some(peers),
        links: Some(links),
        bridge_suggested: Some(bridge_suggested),
        reason: None,
        gateway_status: Some(gateway_status),
        transports: Some(transport_status),
    }
}

fn forwarding_active(bridge_snapshot: Option<&BridgeSnapshot>, upstream_connected: u32) -> bool {
    if upstream_connected == 0 {
        return false;
    }

    let snapshot = match bridge_snapshot {
        Some(snapshot) if snapshot.enabled => snapshot,
        _ => return false,
    };

    let last_success = match snapshot.last_forward_success {
        Some(timestamp) => timestamp,
        None => return false,
    };

    let now = Utc::now();
    let freshness_window = ChronoDuration::seconds(45);

    now - last_success <= freshness_window
}

pub async fn set_bridge_mode_enabled<R: Runtime>(
    app: &AppHandle<R>,
    enabled: bool,
) -> Result<ConnectivityGatewayStatus, String> {
    let swarm = SWARM_HANDLE
        .get()
        .cloned()
        .ok_or_else(|| "Network swarm not initialised.".to_string())?;

    let mut dial_targets: Vec<Multiaddr> = Vec::new();
    let mut disconnect_peers: Vec<PeerId> = Vec::new();
    let mut error_message: Option<String> = None;

    {
        let mut state = BRIDGE_STATE.lock().await;
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
                error_message = Some(message);
            } else {
                dial_targets = state.upstream_targets.clone();
                state.tracked_peers.clear();
                for addr in &dial_targets {
                    if let Some(peer_id) = peer_id_from_multiaddr(addr) {
                        state.tracked_peers.insert(peer_id);
                    }
                }
            }
        } else {
            disconnect_peers = state.tracked_peers.iter().cloned().collect();
            state.enabled = false;
            state.last_error = None;
            state.last_dial_attempt = None;
            state.tracked_peers.clear();
            state.last_forward_attempt = None;
            state.last_forward_success = None;
            state.last_forward_failure = None;
        }
    }

    if enabled && !dial_targets.is_empty() {
        let mut swarm_guard = swarm.lock().await;
        for addr in dial_targets {
            if let Err(error) = libp2p::swarm::Swarm::dial_addr(&mut *swarm_guard, addr.clone()) {
                let message = format!("Failed to dial {}: {}", addr, error);
                error_message = Some(message.clone());
            }
        }
    }

    if !enabled && !disconnect_peers.is_empty() {
        let mut swarm_guard = swarm.lock().await;
        for peer in disconnect_peers {
            let _ = swarm_guard.disconnect_peer_id(peer);
        }
    }

    if let Some(message) = error_message.clone() {
        let mut state = BRIDGE_STATE.lock().await;
        state.last_error = Some(message);
    }

    let snapshot = refresh_connectivity_snapshot(app).await?;

    Ok(snapshot
        .gateway_status
        .unwrap_or_else(ConnectivityGatewayStatus::default))
}

pub async fn bridge_can_forward_to(peer: &PeerId) -> bool {
    let state = BRIDGE_STATE.lock().await;
    state.enabled && state.tracked_peers.contains(peer)
}

pub async fn note_bridge_forward_attempt() {
    let mut state = BRIDGE_STATE.lock().await;
    state.last_forward_attempt = Some(Utc::now());
}

pub async fn note_bridge_forward_success() {
    let mut state = BRIDGE_STATE.lock().await;
    state.last_forward_success = Some(Utc::now());
    state.last_error = None;
}

pub async fn note_bridge_forward_failure(error: String) {
    let mut state = BRIDGE_STATE.lock().await;
    state.last_forward_failure = Some(Utc::now());
    state.last_error = Some(error);
}

pub async fn emit_bridge_snapshot<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let _ = refresh_connectivity_snapshot(app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bridge_snapshot_with_success(age_secs: i64, upstream: u32) -> (BridgeSnapshot, u32) {
        let now = Utc::now();
        let snapshot = BridgeSnapshot {
            enabled: true,
            upstream_targets: Vec::new(),
            tracked_peers: Vec::new(),
            last_dial_attempt: None,
            last_error: None,
            last_forward_attempt: Some(now - ChronoDuration::seconds(age_secs)),
            last_forward_success: Some(now - ChronoDuration::seconds(age_secs)),
            last_forward_failure: None,
        };
        (snapshot, upstream)
    }

    #[test]
    fn forwarding_active_requires_recent_success() {
        let (recent, upstream) = bridge_snapshot_with_success(10, 2);
        assert!(forwarding_active(Some(&recent), upstream));

        let (stale, upstream) = bridge_snapshot_with_success(180, 2);
        assert!(!forwarding_active(Some(&stale), upstream));
    }

    #[test]
    fn forwarding_inactive_without_upstream() {
        let (recent, _upstream) = bridge_snapshot_with_success(5, 0);
        assert!(!forwarding_active(Some(&recent), 0));
    }
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
    let router = ROUTER_HANDLE
        .get()
        .cloned()
        .ok_or_else(|| "Routing engine not initialised.".to_string())?;

    let mut guard = router.lock().await;
    guard.update_parameters(update_interval_secs, min_quality, max_hops as usize);
    let config = guard.config().clone();
    drop(guard);

    let _ = refresh_connectivity_snapshot(app).await;

    Ok(config)
}
