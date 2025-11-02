use std::collections::{HashMap, HashSet, VecDeque};
use std::time::{Duration, Instant};

use libp2p::PeerId;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AerpConfig {
    pub update_interval_secs: u64,
    pub min_route_quality: f32,
    pub latency_weight: f64,
    pub reliability_weight: f64,
    pub hop_penalty: f64,
    pub max_hops: usize,
}

impl Default for AerpConfig {
    fn default() -> Self {
        Self {
            update_interval_secs: 10,
            min_route_quality: 0.35,
            latency_weight: 1.0,
            reliability_weight: 120.0,
            hop_penalty: 12.0,
            max_hops: 6,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RouteMetrics {
    pub hop_count: u32,
    pub total_latency_ms: f64,
    pub reliability: f64,
}

impl RouteMetrics {
    pub fn score(&self, config: &AerpConfig) -> f64 {
        let hop_component = self.hop_count as f64 * config.hop_penalty;
        let latency_component = self.total_latency_ms * config.latency_weight;
        let reliability_component = self.reliability * config.reliability_weight;
        latency_component + hop_component - reliability_component
    }

    pub fn quality(&self) -> f32 {
        (self.reliability.clamp(0.0, 1.0)) as f32
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LinkQuality {
    pub latency_ms: f64,
    pub reliability: f64,
}

impl Default for LinkQuality {
    fn default() -> Self {
        Self {
            latency_ms: 50.0,
            reliability: 0.5,
        }
    }
}

#[derive(Clone, Debug)]
struct LinkState {
    quality: LinkQuality,
    observations: u32,
    last_updated: Instant,
}

impl LinkState {
    fn new(quality: LinkQuality) -> Self {
        Self {
            quality,
            observations: 1,
            last_updated: Instant::now(),
        }
    }

    fn update(&mut self, quality: &LinkQuality) {
        let smoothing = 0.35;
        self.quality.latency_ms =
            (1.0 - smoothing) * self.quality.latency_ms + smoothing * quality.latency_ms;
        self.quality.reliability =
            (1.0 - smoothing) * self.quality.reliability + smoothing * quality.reliability;
        self.observations = self.observations.saturating_add(1);
        self.last_updated = Instant::now();
    }
}

#[derive(Clone, Debug)]
pub struct RouteSnapshot {
    pub target: PeerId,
    pub via: Option<PeerId>,
    pub path: Vec<PeerId>,
    pub metrics: RouteMetrics,
    pub score: f64,
}

#[derive(Clone, Debug)]
pub struct LinkSnapshot {
    pub source: PeerId,
    pub target: PeerId,
    pub quality: LinkQuality,
}

#[derive(Clone, Debug)]
pub struct RouterSnapshot {
    pub local_peer: PeerId,
    pub config: AerpConfig,
    pub routes: Vec<RouteSnapshot>,
    pub links: Vec<LinkSnapshot>,
}

pub struct AerpRouter {
    local_peer: PeerId,
    adjacency: HashMap<PeerId, HashMap<PeerId, LinkState>>,
    known_peers: HashSet<PeerId>,
    cached_routes: HashMap<PeerId, RouteSnapshot>,
    config: AerpConfig,
}

impl AerpRouter {
    pub fn new(local_peer: PeerId) -> Self {
        let mut adjacency = HashMap::new();
        adjacency.insert(local_peer.clone(), HashMap::new());
        let mut known_peers = HashSet::new();
        known_peers.insert(local_peer.clone());
        Self {
            local_peer,
            adjacency,
            known_peers,
            cached_routes: HashMap::new(),
            config: AerpConfig::default(),
        }
    }

    pub fn local_peer(&self) -> &PeerId {
        &self.local_peer
    }

    pub fn config(&self) -> &AerpConfig {
        &self.config
    }

    pub fn update_parameters(
        &mut self,
        update_interval_secs: u64,
        min_quality: f32,
        max_hops: usize,
    ) {
        self.config.update_interval_secs = update_interval_secs.max(1);
        self.config.min_route_quality = min_quality.clamp(0.0, 1.0);
        self.config.max_hops = max_hops.max(1);
        self.recompute_routes();
    }

    pub fn observe_peer(&mut self, peer: PeerId) {
        if self.known_peers.insert(peer.clone()) {
            self.adjacency.entry(peer.clone()).or_default();
        }
    }

    pub fn remove_peer(&mut self, peer: &PeerId) {
        self.known_peers.remove(peer);
        self.adjacency.remove(peer);
        for neighbours in self.adjacency.values_mut() {
            neighbours.remove(peer);
        }
        self.cached_routes.remove(peer);
    }

    pub fn observe_direct_link(&mut self, a: PeerId, b: PeerId, quality: LinkQuality) {
        if a == b {
            return;
        }
        self.observe_peer(a.clone());
        self.observe_peer(b.clone());
        {
            let entry = self
                .adjacency
                .entry(a.clone())
                .or_default()
                .entry(b.clone())
                .or_insert_with(|| LinkState::new(quality.clone()));
            entry.update(&quality);
        }
        {
            let entry = self
                .adjacency
                .entry(b)
                .or_default()
                .entry(a)
                .or_insert_with(|| LinkState::new(quality.clone()));
            entry.update(&quality);
        }
        self.recompute_routes();
    }

    pub fn record_route_success(&mut self, path: &[PeerId], latency_ms: Option<f64>) {
        if path.len() < 2 {
            return;
        }
        let latency = latency_ms.unwrap_or(30.0);
        for window in path.windows(2) {
            if let [from, to] = window {
                let quality = LinkQuality {
                    latency_ms: latency,
                    reliability: 1.0,
                };
                self.observe_direct_link(from.clone(), to.clone(), quality);
            }
        }
    }

    pub fn record_route_failure(&mut self, path: &[PeerId]) {
        if path.len() < 2 {
            return;
        }
        for window in path.windows(2) {
            if let [from, to] = window {
                let quality = LinkQuality {
                    latency_ms: 250.0,
                    reliability: 0.05,
                };
                self.observe_direct_link(from.clone(), to.clone(), quality);
            }
        }
    }

    pub fn prune_stale_links(&mut self, max_age: Duration) {
        let cutoff = Instant::now() - max_age;
        for neighbours in self.adjacency.values_mut() {
            neighbours.retain(|_, state| state.last_updated >= cutoff);
        }
        self.recompute_routes();
    }

    pub fn recompute_routes(&mut self) {
        self.cached_routes.clear();
        let targets: Vec<_> = self
            .known_peers
            .iter()
            .filter(|peer| *peer != &self.local_peer)
            .cloned()
            .collect();
        for target in targets {
            if let Some(route) = self.compute_route(&target) {
                if route.metrics.quality() >= self.config.min_route_quality {
                    self.cached_routes.insert(target.clone(), route);
                }
            }
        }
    }

    pub fn routes(&self) -> Vec<RouteSnapshot> {
        self.cached_routes.values().cloned().collect()
    }

    fn compute_route(&self, target: &PeerId) -> Option<RouteSnapshot> {
        if target == &self.local_peer {
            return None;
        }
        let mut queue: VecDeque<(PeerId, Vec<PeerId>, f64, f64)> = VecDeque::new();
        queue.push_back((
            self.local_peer.clone(),
            vec![self.local_peer.clone()],
            0.0,
            1.0,
        ));
        let mut best: Option<RouteSnapshot> = None;
        let mut visited: HashSet<PeerId> = HashSet::new();

        while let Some((peer, path, latency, reliability)) = queue.pop_front() {
            if path.len() as usize - 1 > self.config.max_hops {
                continue;
            }

            if &peer == target {
                let metrics = RouteMetrics {
                    hop_count: (path.len() - 1) as u32,
                    total_latency_ms: latency,
                    reliability,
                };
                let score = metrics.score(&self.config);
                match &mut best {
                    Some(current) if score >= current.score => {}
                    _ => {
                        best = Some(RouteSnapshot {
                            target: target.clone(),
                            via: path.get(1).cloned(),
                            path: path.clone(),
                            metrics,
                            score,
                        });
                    }
                }
                continue;
            }

            if !visited.insert(peer.clone()) {
                continue;
            }

            if let Some(neighbours) = self.adjacency.get(&peer) {
                for (next, state) in neighbours {
                    if path.contains(next) {
                        continue;
                    }
                    let mut next_path = path.clone();
                    next_path.push(next.clone());
                    let next_latency = latency + state.quality.latency_ms;
                    let next_reliability = reliability * state.quality.reliability.max(0.01);
                    queue.push_back((next.clone(), next_path, next_latency, next_reliability));
                }
            }
        }

        best
    }

    pub fn snapshot(&self) -> RouterSnapshot {
        let routes = self.routes();
        let mut links = Vec::new();
        for (source, neighbours) in &self.adjacency {
            for (target, state) in neighbours {
                links.push(LinkSnapshot {
                    source: source.clone(),
                    target: target.clone(),
                    quality: state.quality.clone(),
                });
            }
        }
        RouterSnapshot {
            local_peer: self.local_peer.clone(),
            config: self.config.clone(),
            routes,
            links,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutedEnvelope {
    pub origin: String,
    pub destination: String,
    pub path: Vec<String>,
    pub metrics: RouteMetrics,
    pub payload: Vec<u8>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RoutedFrame {
    Broadcast { origin: String, payload: Vec<u8> },
    Routed { envelope: RoutedEnvelope },
}

#[cfg(test)]
mod tests {
    use super::*;

    fn peer() -> PeerId {
        use libp2p::identity::Keypair;
        Keypair::generate_ed25519().public().to_peer_id()
    }

    #[test]
    fn prefers_lower_latency_path() {
        let local = peer();
        let peer_a = peer();
        let peer_b = peer();
        let peer_c = peer();

        let mut router = AerpRouter::new(local.clone());
        router.observe_direct_link(
            local.clone(),
            peer_a.clone(),
            LinkQuality {
                latency_ms: 10.0,
                reliability: 0.9,
            },
        );
        router.observe_direct_link(
            peer_a.clone(),
            peer_c.clone(),
            LinkQuality {
                latency_ms: 20.0,
                reliability: 0.9,
            },
        );
        router.observe_direct_link(
            local.clone(),
            peer_b.clone(),
            LinkQuality {
                latency_ms: 5.0,
                reliability: 0.6,
            },
        );
        router.observe_direct_link(
            peer_b.clone(),
            peer_c.clone(),
            LinkQuality {
                latency_ms: 45.0,
                reliability: 0.95,
            },
        );

        let route = router.compute_route(&peer_c).expect("route");
        assert_eq!(route.path[1], peer_a);
        assert_eq!(route.metrics.hop_count, 2);
    }

    #[test]
    fn reliability_affects_choice() {
        let local = peer();
        let peer_a = peer();
        let peer_b = peer();

        let mut router = AerpRouter::new(local.clone());
        router.observe_direct_link(
            local.clone(),
            peer_a.clone(),
            LinkQuality {
                latency_ms: 15.0,
                reliability: 0.2,
            },
        );
        router.observe_direct_link(
            local.clone(),
            peer_b.clone(),
            LinkQuality {
                latency_ms: 35.0,
                reliability: 0.95,
            },
        );

        let route = router.compute_route(&peer_b).expect("route");
        assert_eq!(route.via, Some(peer_b.clone()));

        let route_a = router.compute_route(&peer_a).expect("route");
        assert!(route.metrics.score(router.config()) < route_a.metrics.score(router.config()));
    }
}
