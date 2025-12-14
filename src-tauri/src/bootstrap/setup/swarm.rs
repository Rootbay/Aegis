use std::collections::VecDeque;
use std::sync::Arc;
use tauri::{AppHandle, Runtime};
use tokio::sync::{mpsc, Mutex};
use libp2p::futures::StreamExt;
use libp2p::swarm::SwarmEvent;

use aegis_protocol::AepMessage;
use aegis_shared_types::AppState;
use super::network::NetworkResources;
use super::context;
use super::handlers;

pub(super) fn spawn_swarm_processing<R: Runtime>(
    app: AppHandle<R>,
    network: NetworkResources,
    app_state: AppState,
    db_pool: sqlx::Pool<sqlx::Sqlite>,
    mut net_rx: mpsc::Receiver<Vec<u8>>,
    mut file_rx: mpsc::Receiver<aegis_shared_types::FileTransferCommand>,
    event_tx: mpsc::Sender<AepMessage>,
    outbox: Arc<Mutex<VecDeque<Vec<u8>>>>,
) {
    let ctx = Arc::new(context::AppContext {
        app,
        network,
        app_state,
        db_pool,
        event_tx,
        outbox,
    });

    let ctx_clone = ctx.clone();

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
        loop {
            tokio::select! {
                maybe = net_rx.recv() => {
                    if let Some(data) = maybe {
                        handlers::outbox::handle_outgoing_data(&ctx_clone, data).await;
                    }
                }
                file_cmd = file_rx.recv() => {
                    if let Some(cmd) = file_cmd {
                        handlers::files::handle_command(&ctx_clone, cmd).await;
                    }
                }
                event = async {
                    let mut guard = ctx_clone.network.shared_swarm.lock().await;
                    guard.select_next_some().await
                } => {
                    use crate::network::ComposedEvent;
                    match event {
                        SwarmEvent::Behaviour(ComposedEvent::Gossipsub(e)) => {
                            handlers::gossip::handle_gossip_event(&ctx_clone, e).await;
                        }
                        SwarmEvent::Behaviour(ComposedEvent::Mdns(e)) => {
                            handlers::discovery::handle_mdns_event(&ctx_clone, e).await;
                        }
                        SwarmEvent::Behaviour(ComposedEvent::ReqRes(msg)) => {
                            match msg {
                                libp2p::request_response::RequestResponseEvent::Message { peer, message } => {
                                    handlers::files::handle_incoming_request(&ctx_clone, peer, message).await;
                                }
                                _ => {}
                            }
                        }
                        _ => {}
                    }
                }
                _ = interval.tick() => {
                    handlers::outbox::flush_pending(&ctx_clone).await;
                }
            }
        }
    });
}
