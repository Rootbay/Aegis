use std::str::FromStr;
use tauri::Runtime;
use libp2p::gossipsub::GossipsubEvent;
use aegis_protocol::AepMessage;
use crate::network::{RoutedFrame, RoutedEnvelope as Envelope};
use crate::bootstrap::setup::context::AppContext;
use crate::connectivity::{
    bridge_can_forward_to, emit_bridge_snapshot, note_bridge_forward_attempt,
    note_bridge_forward_failure, note_bridge_forward_success,
};
use crate::bootstrap::setup::handlers::application;
use std::sync::Arc;

pub async fn handle_gossip_event<R: Runtime>(
    ctx: &Arc<AppContext<R>>,
    event: GossipsubEvent
) {
    if let GossipsubEvent::Message { propagation_source, message, .. } = event {
        if message.topic != ctx.network.topic.hash() { return; }

        {
            let mut router = ctx.network.router.lock().await;
            router.observe_peer(propagation_source.clone());
        }

        let payload_opt = match bincode::deserialize::<RoutedFrame>(&message.data) {
            Ok(RoutedFrame::Broadcast { origin, payload }) => {
                if let Ok(origin_peer) = libp2p::PeerId::from_str(&origin) {
                    let mut router = ctx.network.router.lock().await;
                    router.observe_peer(origin_peer);
                }
                Some(payload)
            }
            Ok(RoutedFrame::Routed { envelope }) => {
                let local_id = ctx.app_state.identity.peer_id();
                let path_peers: Vec<libp2p::PeerId> = envelope.path.iter()
                    .filter_map(|v| libp2p::PeerId::from_str(v).ok())
                    .collect();

                {
                    let mut router = ctx.network.router.lock().await;
                    for peer in &path_peers { router.observe_peer(peer.clone()); }
                }

                if envelope.destination != local_id.to_base58() {
                    handle_forwarding(ctx, &envelope, &path_peers, &local_id).await;
                    return;
                }
                
                {
                    let mut router = ctx.network.router.lock().await;
                    if !path_peers.is_empty() {
                        router.record_route_success(&path_peers, Some(envelope.metrics.total_latency_ms));
                    }
                }
                Some(envelope.payload)
            }
            Err(_) => Some(message.data),
        };

        if let Some(bytes) = payload_opt {
            if let Ok(msg) = bincode::deserialize::<AepMessage>(&bytes) {
                let _ = application::handle_message(ctx, msg, propagation_source).await;
            }
        }
    }
}

async fn handle_forwarding<R: Runtime>(
    ctx: &Arc<AppContext<R>>,
    envelope: &Envelope,
    path_peers: &[libp2p::PeerId],
    local_id: &libp2p::PeerId
) {
    let next_hop = path_peers.iter().position(|p| p == local_id)
        .and_then(|idx| path_peers.get(idx + 1).cloned());

    if let Some(next_peer) = next_hop {
        if bridge_can_forward_to(&next_peer).await {
            note_bridge_forward_attempt().await;
            
            let frame = RoutedFrame::Routed { envelope: envelope.clone() };
            if let Ok(bytes) = bincode::serialize(&frame) {
                let outcome = {
                    let mut swarm = ctx.network.shared_swarm.lock().await;
                    swarm.behaviour_mut().gossipsub.publish(ctx.network.topic.clone(), bytes)
                };

                match outcome {
                    Ok(_) => {
                        note_bridge_forward_success().await;
                        let _ = emit_bridge_snapshot(&ctx.app).await;
                    }
                    Err(e) => {
                        let msg = format!("Forwarding failed: {}", e);
                        note_bridge_forward_failure(msg.clone()).await;
                        eprintln!("{}", msg);
                        let _ = emit_bridge_snapshot(&ctx.app).await;
                    }
                }
            }
        }
    }
}
