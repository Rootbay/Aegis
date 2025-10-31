use aegis_shared_types::ConnectivityTransportStatus;
use tauri::{AppHandle, Runtime};

use crate::connectivity::snapshot::build_transport_status;
use crate::network;

use super::orchestrator::refresh_connectivity_snapshot;

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
