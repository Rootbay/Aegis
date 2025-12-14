use std::sync::Arc;

use libp2p::swarm::Swarm;
use tokio::sync::Mutex;

use crypto::identity::Identity;
use network::{AerpRouter, Behaviour, Topic};

#[derive(Clone)]
pub(super) struct NetworkResources {
    pub shared_swarm: Arc<Mutex<Swarm<Behaviour>>>,
    pub router: Arc<Mutex<AerpRouter>>,
    pub topic: Topic,
}

pub(super) async fn initialize_network(identity: &Identity) -> Result<NetworkResources, String> {
    let (swarm, topic, router) = network::initialize_network(identity.keypair().clone())
        .await
        .map_err(|e| format!("Failed to initialize network: {}", e))?;

    Ok(NetworkResources {
        shared_swarm: Arc::new(Mutex::new(swarm)),
        router: Arc::new(Mutex::new(router)),
        topic,
    })
}
