pub mod bluetooth;
pub mod transports;
pub mod wifi_direct;

use libp2p::{
    core::upgrade,
    gossipsub::{self, Gossipsub, GossipsubConfig, IdentTopic as Topic, MessageAuthenticity, GossipsubEvent},
    identify,
    identity::Keypair,
    mdns,
    mplex, noise,
    noise::{Keypair as NoiseKeypair, X25519Spec},
    swarm::Swarm,
    tcp::TcpConfig,
    Transport,
};
use gossipsub::error::PublishError;
use std::error::Error;
// Derive macro re-exported at crate root for this libp2p version
use libp2p::NetworkBehaviour;
use libp2p::request_response::{self, ProtocolName, RequestResponse, RequestResponseCodec, RequestResponseConfig, RequestResponseEvent};
use futures::io::{AsyncRead, AsyncWrite, AsyncReadExt, AsyncWriteExt};
use std::io;

pub use transports::{TransportMedium, TransportSnapshot};

#[derive(NetworkBehaviour)]
#[behaviour(out_event = "ComposedEvent")]
pub struct Behaviour {
    pub gossipsub: Gossipsub,
    pub identify: identify::Identify,
    pub mdns: mdns::Mdns,
    pub req_res: RequestResponse<FileTransferCodec>,
}

#[allow(clippy::large_enum_variant)]
pub enum ComposedEvent {
    Gossipsub(GossipsubEvent),
    Identify(identify::IdentifyEvent),
    Mdns(mdns::MdnsEvent),
    ReqRes(RequestResponseEvent<FileTransferRequest, FileTransferResponse>),
}

impl From<GossipsubEvent> for ComposedEvent {
    fn from(e: GossipsubEvent) -> Self { ComposedEvent::Gossipsub(e) }
}
impl From<identify::IdentifyEvent> for ComposedEvent {
    fn from(e: identify::IdentifyEvent) -> Self { ComposedEvent::Identify(e) }
}
impl From<mdns::MdnsEvent> for ComposedEvent {
    fn from(e: mdns::MdnsEvent) -> Self { ComposedEvent::Mdns(e) }
}
impl From<RequestResponseEvent<FileTransferRequest, FileTransferResponse>> for ComposedEvent {
    fn from(e: RequestResponseEvent<FileTransferRequest, FileTransferResponse>) -> Self { ComposedEvent::ReqRes(e) }
}

#[derive(Debug, Clone)]
pub struct FileTransferProtocol;

impl ProtocolName for FileTransferProtocol {
    fn protocol_name(&self) -> &[u8] {
        b"/aegis/file/1"
    }
}

#[derive(Debug, Clone)]
pub struct FileTransferCodec;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum FileTransferRequest {
    Init { filename: String, size: u64 },
    Chunk { filename: String, index: u64, data: Vec<u8> },
    Complete { filename: String },
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum FileTransferResponse { Ack, Error(String) }

#[async_trait::async_trait]
impl RequestResponseCodec for FileTransferCodec {
    type Protocol = FileTransferProtocol;
    type Request = FileTransferRequest;
    type Response = FileTransferResponse;

    async fn read_request<T>(&mut self, _: &FileTransferProtocol, io: &mut T) -> io::Result<Self::Request>
    where
        T: AsyncRead + Unpin + Send,
    {
        let mut buf = Vec::new();
        AsyncReadExt::read_to_end(io, &mut buf).await?;
        bincode::deserialize(&buf).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    async fn read_response<T>(&mut self, _: &FileTransferProtocol, io: &mut T) -> io::Result<Self::Response>
    where
        T: AsyncRead + Unpin + Send,
    {
        let mut buf = Vec::new();
        AsyncReadExt::read_to_end(io, &mut buf).await?;
        bincode::deserialize(&buf).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    async fn write_request<T>(&mut self, _: &FileTransferProtocol, io: &mut T, req: Self::Request) -> io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        let bytes = bincode::serialize(&req).map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
        AsyncWriteExt::write_all(io, &bytes).await
    }

    async fn write_response<T>(&mut self, _: &FileTransferProtocol, io: &mut T, res: Self::Response) -> io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        let bytes = bincode::serialize(&res).map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
        AsyncWriteExt::write_all(io, &bytes).await
    }
}

pub async fn initialize_network(
    local_key: Keypair,
) -> Result<(Swarm<Behaviour>, Topic), Box<dyn Error>> {
    let local_peer_id = libp2p::PeerId::from(local_key.public());

    transports::register_local_peer(local_peer_id.clone());


    let noise_keys = NoiseKeypair::<X25519Spec>::new().into_authentic(&local_key)?;

    let transport = TcpConfig::new()
        .upgrade(upgrade::Version::V1)
        .authenticate(noise::NoiseConfig::xx(noise_keys).into_authenticated())
        .multiplex(mplex::MplexConfig::new())
        .boxed();

    let gossipsub_config = GossipsubConfig::default();
    let mut gossipsub = Gossipsub::new(
        MessageAuthenticity::Signed(local_key.clone()),
        gossipsub_config,
    )
    .expect("Failed to create gossipsub behavior");

    let topic = Topic::new("aegis-global-chat");
    gossipsub.subscribe(&topic)?;

    let identify_cfg = identify::IdentifyConfig::new("aegis/1.0.0".into(), local_key.public());
    let identify = identify::Identify::new(identify_cfg);
    let mdns = mdns::Mdns::new(mdns::MdnsConfig::default()).await?;

    let rr_cfg = RequestResponseConfig::default();
    let protocols = std::iter::once((FileTransferProtocol, request_response::ProtocolSupport::Full));
    let req_res = RequestResponse::new(FileTransferCodec, protocols, rr_cfg);

    let behaviour = Behaviour { gossipsub, identify, mdns, req_res };
    let mut swarm = Swarm::new(transport, behaviour, local_peer_id);

    swarm.listen_on("/ip4/0.0.0.0/tcp/0".parse()?)?;

    Ok((swarm, topic))
}

pub async fn send_data(
    swarm: &mut Swarm<Behaviour>,
    topic: &Topic,
    data: Vec<u8>,
) -> Result<(), Box<dyn Error>> {
    match swarm.behaviour_mut().gossipsub.publish(topic.clone(), data) {
        Ok(_) => {}
        Err(PublishError::InsufficientPeers) => {
            // No peers yet; treat as a no-op instead of bubbling an error
            return Ok(());
        }
        Err(e) => return Err(Box::new(e)),
    }
    Ok(())
}

pub fn has_any_peers(swarm: &Swarm<Behaviour>) -> bool {
    swarm.behaviour().gossipsub.all_peers().next().is_some()
}

pub async fn set_bluetooth_enabled(enabled: bool) -> Result<bool, String> {
    bluetooth::set_bluetooth_enabled(enabled).await
}

pub async fn set_wifi_direct_enabled(enabled: bool) -> Result<bool, String> {
    wifi_direct::set_wifi_direct_enabled(enabled).await
}

pub fn transport_snapshot() -> TransportSnapshot {
    transports::snapshot()
}
