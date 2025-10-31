use std::collections::HashSet;
use std::sync::Arc;

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use libp2p::{multiaddr::Protocol, Multiaddr, PeerId};
use once_cell::sync::Lazy;
use tokio::sync::Mutex;

static BRIDGE_STATE: Lazy<Arc<Mutex<BridgeState>>> =
    Lazy::new(|| Arc::new(Mutex::new(BridgeState::new())));

#[derive(Clone, Default)]
pub struct BridgeSnapshot {
    pub enabled: bool,
    pub upstream_targets: Vec<Multiaddr>,
    pub tracked_peers: Vec<PeerId>,
    pub last_dial_attempt: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub last_forward_attempt: Option<DateTime<Utc>>,
    pub last_forward_success: Option<DateTime<Utc>>,
    pub last_forward_failure: Option<DateTime<Utc>>,
}

#[derive(Default)]
pub struct BridgeState {
    pub enabled: bool,
    pub upstream_targets: Vec<Multiaddr>,
    pub tracked_peers: HashSet<PeerId>,
    pub last_dial_attempt: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub last_forward_attempt: Option<DateTime<Utc>>,
    pub last_forward_success: Option<DateTime<Utc>>,
    pub last_forward_failure: Option<DateTime<Utc>>,
}

impl BridgeState {
    fn new() -> Self {
        Self {
            upstream_targets: default_upstream_multiaddrs(),
            ..Default::default()
        }
    }

    pub fn ensure_targets(&mut self) {
        if self.upstream_targets.is_empty() {
            self.upstream_targets = default_upstream_multiaddrs();
        }
    }

    fn snapshot(&self) -> BridgeSnapshot {
        BridgeSnapshot {
            enabled: self.enabled,
            upstream_targets: self.upstream_targets.clone(),
            tracked_peers: self.tracked_peers.iter().cloned().collect(),
            last_dial_attempt: self.last_dial_attempt,
            last_error: self.last_error.clone(),
            last_forward_attempt: self.last_forward_attempt,
            last_forward_success: self.last_forward_success,
            last_forward_failure: self.last_forward_failure,
        }
    }
}

pub fn peer_id_from_multiaddr(addr: &Multiaddr) -> Option<PeerId> {
    addr.iter().find_map(|protocol| match protocol {
        Protocol::P2p(multihash) => PeerId::from_multihash(multihash).ok(),
        _ => None,
    })
}

pub fn default_upstream_multiaddrs() -> Vec<Multiaddr> {
    let env_value = std::env::var("AEGIS_BRIDGE_UPLINKS").unwrap_or_default();

    let mut addrs: Vec<Multiaddr> = env_value
        .split(|c| matches!(c, ',' | ';' | '\n' | '\r'))
        .filter_map(|segment| {
            let trimmed = segment.trim();
            if trimmed.is_empty() {
                return None;
            }
            match trimmed.parse::<Multiaddr>() {
                Ok(addr) => Some(addr),
                Err(error) => {
                    eprintln!("Invalid bridge upstream address '{}': {}", trimmed, error);
                    None
                }
            }
        })
        .collect();

    if addrs.is_empty() {
        if let Ok(addr) =
            "/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p-webrtc-star".parse::<Multiaddr>()
        {
            addrs.push(addr);
        }
    }

    addrs
}

pub async fn bridge_state_snapshot() -> BridgeSnapshot {
    BRIDGE_STATE.lock().await.snapshot()
}

pub async fn reset_bridge_state() {
    let mut guard = BRIDGE_STATE.lock().await;
    *guard = BridgeState::new();
}

pub async fn update_bridge_state<F, T>(operation: F) -> T
where
    F: FnOnce(&mut BridgeState) -> T,
{
    let state = BRIDGE_STATE.clone();
    let mut guard = state.lock().await;
    operation(&mut guard)
}

pub async fn bridge_can_forward_to(peer: &PeerId) -> bool {
    let state = BRIDGE_STATE.lock().await;
    state.enabled && state.tracked_peers.contains(peer)
}

pub async fn note_bridge_forward_attempt() {
    let mut state = BRIDGE_STATE.lock().await;
    state.last_forward_attempt = Some(Utc::now());
}

pub async fn note_bridge_forward_success() {
    let mut state = BRIDGE_STATE.lock().await;
    state.last_forward_success = Some(Utc::now());
    state.last_error = None;
}

pub async fn note_bridge_forward_failure(error: String) {
    let mut state = BRIDGE_STATE.lock().await;
    state.last_forward_failure = Some(Utc::now());
    state.last_error = Some(error);
}

pub fn forwarding_active(
    bridge_snapshot: Option<&BridgeSnapshot>,
    upstream_connected: u32,
) -> bool {
    if upstream_connected == 0 {
        return false;
    }

    let snapshot = match bridge_snapshot {
        Some(snapshot) if snapshot.enabled => snapshot,
        _ => return false,
    };

    let last_success = match snapshot.last_forward_success {
        Some(timestamp) => timestamp,
        None => return false,
    };

    let now = Utc::now();
    let freshness_window = ChronoDuration::seconds(45);

    now - last_success <= freshness_window
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bridge_snapshot_with_success(age_secs: i64, upstream: u32) -> (BridgeSnapshot, u32) {
        let now = Utc::now();
        let snapshot = BridgeSnapshot {
            enabled: true,
            upstream_targets: Vec::new(),
            tracked_peers: Vec::new(),
            last_dial_attempt: None,
            last_error: None,
            last_forward_attempt: Some(now - ChronoDuration::seconds(age_secs)),
            last_forward_success: Some(now - ChronoDuration::seconds(age_secs)),
            last_forward_failure: None,
        };
        (snapshot, upstream)
    }

    #[test]
    fn forwarding_active_requires_recent_success() {
        let (recent, upstream) = bridge_snapshot_with_success(10, 2);
        assert!(forwarding_active(Some(&recent), upstream));

        let (stale, upstream) = bridge_snapshot_with_success(180, 2);
        assert!(!forwarding_active(Some(&stale), upstream));
    }

    #[test]
    fn forwarding_inactive_without_upstream() {
        let (recent, _upstream) = bridge_snapshot_with_success(5, 0);
        assert!(!forwarding_active(Some(&recent), 0));
    }
}
