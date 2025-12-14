use super::super::context::AppContext;
use network::LinkQuality;
use tauri::Runtime;
use libp2p::mdns::MdnsEvent;
use std::sync::Arc;

pub async fn handle_mdns_event<R: Runtime>(
    ctx: &Arc<AppContext<R>>,
    event: MdnsEvent
) {
    match event {
        MdnsEvent::Discovered(list) => {
            let local_peer = ctx.app_state.identity.peer_id();
            let mut addresses = Vec::new();
            {
                let mut router = ctx.network.router.lock().await;
                for (peer_id, addr) in list {
                    router.observe_peer(peer_id.clone());
                    router.observe_direct_link(
                        local_peer.clone(),
                        peer_id,
                        LinkQuality::default(),
                    );
                    addresses.push(addr);
                }
            }

            let mut swarm = ctx.network.shared_swarm.lock().await;
            for addr in addresses {
                let _ = libp2p::swarm::Swarm::dial_addr(&mut *swarm, addr);
            }
        }
        MdnsEvent::Expired(list) => {
            let mut router = ctx.network.router.lock().await;
            for (peer_id, _) in list {
                router.remove_peer(&peer_id);
            }
        }
    }
}
