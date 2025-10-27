use std::sync::Arc;
use std::time::Duration;

use aegis_shared_types::{ConnectivityEventPayload, ConnectivityLink, ConnectivityPeer};
use chrono::Utc;
use libp2p::{swarm::Swarm, PeerId};
use tauri::{AppHandle, Runtime};
use tokio::sync::Mutex;

use crate::network;

pub fn spawn_connectivity_task<R: Runtime>(
    app: AppHandle<R>,
    swarm: Arc<Mutex<Swarm<network::Behaviour>>>,
    local_peer_id: PeerId,
    snapshot_store: Arc<Mutex<Option<ConnectivityEventPayload>>>,
) {
    tokio::spawn(async move {
        if let Some(snapshot) =
            collect_and_store_snapshot(&swarm, &local_peer_id, &snapshot_store).await
        {
            if let Err(error) = app.emit_all("connectivity-status", snapshot.clone()) {
                eprintln!("Failed to emit initial connectivity snapshot: {}", error);
            }
        }

        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;
            if let Some(snapshot) =
                collect_and_store_snapshot(&swarm, &local_peer_id, &snapshot_store).await
            {
                if let Err(error) = app.emit_all("connectivity-status", snapshot.clone()) {
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
    let snapshot = {
        let swarm_guard = swarm.lock().await;
        compute_snapshot(&swarm_guard, local_peer_id)
    };

    {
        let mut guard = snapshot_store.lock().await;
        *guard = Some(snapshot.clone());
    }

    Some(snapshot)
}

fn compute_snapshot(
    swarm: &Swarm<network::Behaviour>,
    local_peer_id: &PeerId,
) -> ConnectivityEventPayload {
    let connected: Vec<_> = swarm.connected_peers().cloned().collect();
    let now = Utc::now().to_rfc3339();
    let local_peer_id_b58 = local_peer_id.to_base58();

    let mut peers = Vec::with_capacity(connected.len() + 1);
    peers.push(ConnectivityPeer {
        id: Some(local_peer_id_b58.clone()),
        label: Some("This Device".to_string()),
        connection: Some("self".to_string()),
        hop_count: Some(0),
        via: None,
        latency_ms: Some(0),
        last_seen: Some(now.clone()),
        is_gateway: Some(false),
    });

    let mut links = Vec::with_capacity(connected.len());

    for peer in connected {
        let peer_id_b58 = peer.to_base58();
        peers.push(ConnectivityPeer {
            id: Some(peer_id_b58.clone()),
            label: None,
            connection: Some("mesh".to_string()),
            hop_count: None,
            via: Some(local_peer_id_b58.clone()),
            latency_ms: None,
            last_seen: Some(now.clone()),
            is_gateway: Some(false),
        });

        links.push(ConnectivityLink {
            source: Some(local_peer_id_b58.clone()),
            target: Some(peer_id_b58),
            quality: None,
            medium: Some("mesh".to_string()),
        });
    }

    let mesh_peer_count = peers
        .iter()
        .filter(|peer| peer.connection.as_deref() == Some("mesh"))
        .count() as u32;
    let total_peers = peers.len() as u32;
    let mesh_reachable = mesh_peer_count > 0;
    let internet_reachable = mesh_reachable;

    ConnectivityEventPayload {
        internet_reachable: Some(internet_reachable),
        mesh_reachable: Some(mesh_reachable),
        total_peers: Some(total_peers),
        mesh_peers: Some(mesh_peer_count),
        peers: Some(peers),
        links: Some(links),
        bridge_suggested: Some(false),
        reason: None,
    }
}
