use tauri::{AppHandle, Runtime};

use crate::network;

use super::orchestrator::refresh_connectivity_snapshot;
use super::runtime::current_runtime;

pub async fn set_routing_config<R: Runtime>(
    app: &AppHandle<R>,
    update_interval_secs: u64,
    min_quality: f32,
    max_hops: u32,
) -> Result<network::AerpConfig, String> {
    let runtime = current_runtime()?;
    let router = runtime.router();

    let config = {
        let mut guard = router.lock().await;
        guard.update_parameters(update_interval_secs, min_quality, max_hops as usize);
        guard.config().clone()
    };

    let _ = refresh_connectivity_snapshot(app).await;

    Ok(config)
}
