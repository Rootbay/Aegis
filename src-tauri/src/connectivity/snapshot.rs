use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

use aegis_shared_types::{
    ConnectivityEventPayload, ConnectivityGatewayStatus, ConnectivityLink, ConnectivityPeer,
    ConnectivityTransportStatus, RelaySnapshot,
};
use chrono::Utc;
use libp2p::{swarm::Swarm, PeerId};

use crate::network::{self, TransportSnapshot};

use super::bridge::{forwarding_active, BridgeSnapshot};

pub fn build_transport_status(snapshot: &TransportSnapshot) -> ConnectivityTransportStatus {
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

#[allow(clippy::too_many_arguments)]
pub fn compute_snapshot(
    swarm: &Swarm<network::Behaviour>,
    local_peer_id: &PeerId,
    bridge_snapshot: Option<&BridgeSnapshot>,
    transport_snapshot: &TransportSnapshot,
    router_snapshot: Option<&network::RouterSnapshot>,
    relay_snapshots: Option<Vec<RelaySnapshot>>,
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

    let relay_payload = relay_snapshots
        .map(|entries| {
            entries
                .into_iter()
                .filter(|entry| entry.status.is_some())
                .collect()
        })
        .filter(|entries: &Vec<RelaySnapshot>| !entries.is_empty());

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
        relays: relay_payload,
    }
}
