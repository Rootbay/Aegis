use std::time::Duration;

use aegis_shared_types::ConnectivityEventPayload;
use tauri::{AppHandle, Emitter, Runtime};

use crate::network::{self, TransportSnapshot};

use super::super::bridge::bridge_state_snapshot;
use super::super::relays::relay_snapshots;
use super::super::snapshot::compute_snapshot;
use super::runtime::{current_runtime, ConnectivityRuntime};

pub async fn collect_emit_snapshot<R: Runtime>(
    app: &AppHandle<R>,
    runtime: &ConnectivityRuntime,
) -> Option<ConnectivityEventPayload> {
    let snapshot = collect_and_store_snapshot(runtime).await?;
    if let Err(error) = app.emit("connectivity-status", snapshot.clone()) {
        eprintln!("Failed to emit connectivity snapshot: {}", error);
    }
    Some(snapshot)
}

pub async fn collect_and_store_snapshot(
    runtime: &ConnectivityRuntime,
) -> Option<ConnectivityEventPayload> {
    let bridge_snapshot = bridge_state_snapshot().await;
    let transport_snapshot: TransportSnapshot = network::transport_snapshot();
    let router_snapshot = runtime.router_snapshot().await;
    let relay_snapshots = relay_snapshots().await;

    let snapshot = {
        let swarm = runtime.swarm();
        let swarm_guard = swarm.lock().await;
        compute_snapshot(
            &swarm_guard,
            &runtime.local_peer_id(),
            Some(&bridge_snapshot),
            &transport_snapshot,
            Some(&router_snapshot),
            relay_snapshots,
        )
    };

    runtime.store_snapshot(snapshot.clone()).await;

    Some(snapshot)
}

pub async fn refresh_connectivity_snapshot<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<ConnectivityEventPayload, String> {
    let runtime = current_runtime()?;
    let snapshot = collect_and_store_snapshot(&runtime)
        .await
        .ok_or_else(|| "Failed to compute connectivity snapshot.".to_string())?;

    if let Err(error) = app.emit("connectivity-status", snapshot.clone()) {
        eprintln!("Failed to emit connectivity snapshot: {}", error);
    }

    Ok(snapshot)
}

pub fn emit_periodic_snapshots<R: Runtime>(
    app: AppHandle<R>,
    runtime: ConnectivityRuntime,
    mut transport_events: tokio::sync::broadcast::Receiver<TransportSnapshot>,
) {
    let app_for_events = app.clone();
    let runtime_for_events = runtime.clone();

    tokio::spawn(async move {
        while transport_events.recv().await.is_ok() {
            let _ = collect_emit_snapshot(&app_for_events, &runtime_for_events).await;
        }
    });

    tokio::spawn(async move {
        let _ = collect_emit_snapshot(&app, &runtime).await;
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;
            let _ = collect_emit_snapshot(&app, &runtime).await;
        }
    });
}

pub fn snapshot_event_receiver() -> tokio::sync::broadcast::Receiver<TransportSnapshot> {
    network::subscribe_transport_events()
}
