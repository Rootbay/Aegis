use aegis_shared_types::ConnectivityGatewayStatus;
use chrono::Utc;
use libp2p::{swarm, Multiaddr, PeerId};
use tauri::{AppHandle, Runtime};

use super::super::bridge::{peer_id_from_multiaddr, update_bridge_state};
use super::orchestrator::refresh_connectivity_snapshot;
use super::runtime::current_runtime;

pub async fn emit_bridge_snapshot<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    refresh_connectivity_snapshot(app).await.map(|_| ())
}

pub async fn set_bridge_mode_enabled<R: Runtime>(
    app: &AppHandle<R>,
    enabled: bool,
) -> Result<ConnectivityGatewayStatus, String> {
    let runtime = current_runtime()?;
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
            if let Err(error) = swarm::Swarm::dial_addr(&mut *swarm_guard, addr.clone()) {
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
