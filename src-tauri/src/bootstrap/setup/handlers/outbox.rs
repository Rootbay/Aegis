use network;
use super::super::context::AppContext;
use crate::bootstrap::MAX_OUTBOX_MESSAGES;
use tauri::Runtime;
use std::sync::Arc;

pub async fn handle_outgoing_data<R: Runtime>(
    ctx: &Arc<AppContext<R>>,
    data: Vec<u8>
) {
    let mut swarm = ctx.network.shared_swarm.lock().await;
    
    if network::has_any_peers(&swarm) {
        let mut router = ctx.network.router.lock().await;
        if let Err(e) = network::send_data(&mut swarm, &ctx.network.topic, &mut router, data).await {
            eprintln!("Failed to send data over network: {}", e);
        }
    } else {
        drop(swarm);
        let mut queue = ctx.outbox.lock().await;
        queue.push_back(data);
        if queue.len() > MAX_OUTBOX_MESSAGES {
            queue.pop_front();
        }
    }
}

pub async fn flush_pending<R: Runtime>(ctx: &Arc<AppContext<R>>) {
    {
        let guard = ctx.network.shared_swarm.lock().await;
        if !network::has_any_peers(&guard) { return; }
    }

    let mut pending = ctx.outbox.lock().await;
    if pending.is_empty() { return; }

    let mut swarm = ctx.network.shared_swarm.lock().await;
    let mut router = ctx.network.router.lock().await;
    let mut remaining: Vec<Vec<u8>> = Vec::new();

    for data in pending.drain(..) {
        if let Err(e) = network::send_data(&mut swarm, &ctx.network.topic, &mut router, data.clone()).await {
            eprintln!("Failed to flush queued data: {}", e);
            remaining.push(data);
        }
    }
    pending.extend(remaining);
}
