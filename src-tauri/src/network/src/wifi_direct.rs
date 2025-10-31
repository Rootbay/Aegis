use std::sync::Arc;

use once_cell::sync::Lazy;
use tokio::net::TcpStream;
use tokio::sync::Mutex;

use crate::transports::{self, TransportMedium};

#[cfg(feature = "wifi-direct")]
use libp2p::PeerId;
#[cfg(feature = "wifi-direct")]
use std::collections::VecDeque;
#[cfg(feature = "wifi-direct")]
use std::env;
#[cfg(feature = "wifi-direct")]
use std::net::SocketAddr;
#[cfg(feature = "wifi-direct")]
use std::str::FromStr;
#[cfg(feature = "wifi-direct")]
use std::time::Duration;
#[cfg(feature = "wifi-direct")]
use tokio::io::{AsyncReadExt, AsyncWriteExt};
#[cfg(feature = "wifi-direct")]
use tokio::net::TcpListener;
#[cfg(feature = "wifi-direct")]
use tokio::sync::Notify;
#[cfg(feature = "wifi-direct")]
use tokio::task::JoinHandle;
#[cfg(feature = "wifi-direct")]
use tokio::time::sleep;

static WIFI_DIRECT_STATE: Lazy<Arc<Mutex<bool>>> = Lazy::new(|| Arc::new(Mutex::new(false)));

#[cfg(feature = "wifi-direct")]
static WIFI_DIRECT_WORKER: Lazy<Arc<Mutex<Option<WifiDirectWorker>>>> =
    Lazy::new(|| Arc::new(Mutex::new(None)));

#[cfg(feature = "wifi-direct")]
static WIFI_DIRECT_INCOMING: Lazy<Arc<Mutex<VecDeque<TcpStream>>>> =
    Lazy::new(|| Arc::new(Mutex::new(VecDeque::new())));

#[cfg(feature = "wifi-direct")]
static WIFI_DIRECT_NOTIFY: Lazy<Arc<Notify>> = Lazy::new(|| Arc::new(Notify::new()));

#[cfg(feature = "wifi-direct")]
const DEFAULT_GROUP_PORT: u16 = 45123;

pub async fn set_wifi_direct_enabled(enabled: bool) -> Result<bool, String> {
    let mut guard = WIFI_DIRECT_STATE.lock().await;

    if enabled {
        if *guard {
            return Ok(false);
        }

        #[cfg(not(feature = "wifi-direct"))]
        {
            return Err(
                "Wi-Fi Direct transport support is not available on this platform.".to_string(),
            );
        }

        #[cfg(feature = "wifi-direct")]
        {
            let worker = WifiDirectWorker::start().await?;
            WIFI_DIRECT_WORKER.lock().await.replace(worker);

            let changed = transports::set_medium_enabled(TransportMedium::WifiDirect, true);
            *guard = true;
            return Ok(changed);
        }

        #[allow(unreachable_code)]
        Ok(false)
    } else if *guard {
        let changed = transports::set_medium_enabled(TransportMedium::WifiDirect, false);
        transports::clear_medium(TransportMedium::WifiDirect);

        #[cfg(feature = "wifi-direct")]
        {
            if let Some(worker) = WIFI_DIRECT_WORKER.lock().await.take() {
                worker.shutdown().await;
            }
            WIFI_DIRECT_NOTIFY.notify_waiters();
        }

        *guard = false;
        Ok(changed)
    } else {
        Ok(false)
    }
}

#[cfg(feature = "wifi-direct")]
pub async fn next_incoming_socket() -> Option<TcpStream> {
    loop {
        let mut guard = WIFI_DIRECT_INCOMING.lock().await;
        if let Some(stream) = guard.pop_front() {
            return Some(stream);
        }
        drop(guard);
        WIFI_DIRECT_NOTIFY.notified().await;
        if !*WIFI_DIRECT_STATE.lock().await {
            return None;
        }
    }
}

#[cfg(not(feature = "wifi-direct"))]
pub async fn next_incoming_socket() -> Option<TcpStream> {
    None
}

#[cfg(feature = "wifi-direct")]
pub async fn try_dequeue_socket() -> Option<TcpStream> {
    WIFI_DIRECT_INCOMING.lock().await.pop_front()
}

#[cfg(not(feature = "wifi-direct"))]
pub async fn try_dequeue_socket() -> Option<TcpStream> {
    None
}

#[cfg(feature = "wifi-direct")]
pub async fn drain_incoming_sockets() -> Vec<TcpStream> {
    WIFI_DIRECT_INCOMING.lock().await.drain(..).collect()
}

#[cfg(not(feature = "wifi-direct"))]
pub async fn drain_incoming_sockets() -> Vec<TcpStream> {
    Vec::new()
}

#[cfg(feature = "wifi-direct")]
struct WifiDirectWorker {
    listener_task: JoinHandle<()>,
    dial_tasks: Vec<JoinHandle<()>>,
}

#[cfg(feature = "wifi-direct")]
impl WifiDirectWorker {
    async fn start() -> Result<Self, String> {
        let listener = TcpListener::bind(("0.0.0.0", DEFAULT_GROUP_PORT))
            .await
            .map_err(|error| format!("Failed to bind Wi-Fi Direct listener: {}", error))?;

        let local_addr = listener
            .local_addr()
            .map_err(|error| format!("Failed to query Wi-Fi Direct listener address: {}", error))?;

        eprintln!("Wi-Fi Direct listener started on {}", local_addr);

        let local_peer = transports::local_peer_id();
        let listener_task = tokio::spawn(run_listener(listener, local_peer.clone()));

        let targets = configured_targets();
        let mut dial_tasks = Vec::new();
        for target in targets {
            let local_peer_clone = local_peer.clone();
            let task = tokio::spawn(async move {
                dial_loop(target, local_peer_clone).await;
            });
            dial_tasks.push(task);
        }

        Ok(Self {
            listener_task,
            dial_tasks,
        })
    }

    async fn shutdown(self) {
        self.listener_task.abort();
        for task in self.dial_tasks {
            task.abort();
        }
    }
}

#[cfg(feature = "wifi-direct")]
fn configured_targets() -> Vec<SocketAddr> {
    let Ok(value) = env::var("AEGIS_WIFI_DIRECT_TARGETS") else {
        return Vec::new();
    };

    value
        .split(',')
        .filter_map(|entry| entry.trim().parse::<SocketAddr>().ok())
        .collect()
}

#[cfg(feature = "wifi-direct")]
async fn run_listener(listener: TcpListener, local_peer: Option<PeerId>) {
    loop {
        match listener.accept().await {
            Ok((stream, addr)) => {
                tokio::spawn(handle_connection(stream, addr, local_peer.clone()));
            }
            Err(error) => {
                eprintln!("Wi-Fi Direct accept error: {}", error);
                sleep(Duration::from_millis(250)).await;
            }
        }
    }
}

#[cfg(feature = "wifi-direct")]
async fn dial_loop(target: SocketAddr, local_peer: Option<PeerId>) {
    loop {
        match TcpStream::connect(target).await {
            Ok(stream) => {
                if let Err(error) = stream.set_nodelay(true) {
                    eprintln!("Failed to configure Wi-Fi Direct socket: {}", error);
                }
                match perform_handshake(stream, local_peer.clone()).await {
                    Ok((peer_id, stream)) => {
                        eprintln!("Connected to Wi-Fi Direct peer {} at {}", peer_id, target);
                        register_peer_connection(peer_id, stream).await;
                    }
                    Err(error) => {
                        eprintln!("Wi-Fi Direct handshake with {} failed: {}", target, error);
                    }
                }
            }
            Err(error) => {
                eprintln!("Wi-Fi Direct dial to {} failed: {}", target, error);
            }
        }

        sleep(Duration::from_secs(10)).await;
    }
}

#[cfg(feature = "wifi-direct")]
async fn handle_connection(stream: TcpStream, addr: SocketAddr, local_peer: Option<PeerId>) {
    if let Err(error) = stream.set_nodelay(true) {
        eprintln!("Failed to configure Wi-Fi Direct socket: {}", error);
    }

    match perform_handshake(stream, local_peer).await {
        Ok((peer_id, stream)) => {
            eprintln!(
                "Accepted Wi-Fi Direct connection from {} ({})",
                addr, peer_id
            );
            register_peer_connection(peer_id, stream).await;
        }
        Err(error) => {
            eprintln!("Wi-Fi Direct handshake from {} failed: {}", addr, error);
        }
    }
}

#[cfg(feature = "wifi-direct")]
async fn perform_handshake(
    mut stream: TcpStream,
    local_peer: Option<PeerId>,
) -> Result<(PeerId, TcpStream), String> {
    let local_id = local_peer
        .map(|peer| peer.to_base58())
        .unwrap_or_else(String::new);
    let local_bytes = local_id.as_bytes();

    let length = (local_bytes.len() as u16).to_be_bytes();
    stream
        .write_all(&length)
        .await
        .map_err(|error| format!("Failed to send Wi-Fi Direct handshake header: {}", error))?;
    if !local_bytes.is_empty() {
        stream
            .write_all(local_bytes)
            .await
            .map_err(|error| format!("Failed to send Wi-Fi Direct handshake payload: {}", error))?;
    }
    stream
        .flush()
        .await
        .map_err(|error| format!("Failed to flush Wi-Fi Direct handshake: {}", error))?;

    let mut length_buf = [0u8; 2];
    stream
        .read_exact(&mut length_buf)
        .await
        .map_err(|error| format!("Failed to read Wi-Fi Direct handshake header: {}", error))?;
    let remote_len = u16::from_be_bytes(length_buf) as usize;

    let mut buffer = vec![0u8; remote_len];
    if remote_len > 0 {
        stream
            .read_exact(&mut buffer)
            .await
            .map_err(|error| format!("Failed to read Wi-Fi Direct handshake payload: {}", error))?;
    }

    let remote_id = String::from_utf8(buffer).map_err(|error| {
        format!(
            "Wi-Fi Direct handshake payload was not valid UTF-8: {}",
            error
        )
    })?;
    let remote_id = remote_id.trim();
    if remote_id.is_empty() {
        return Err("Remote Wi-Fi Direct peer did not provide an identity".to_string());
    }

    let peer_id = PeerId::from_str(remote_id)
        .map_err(|error| format!("Invalid peer ID received via Wi-Fi Direct: {}", error))?;

    Ok((peer_id, stream))
}

#[cfg(feature = "wifi-direct")]
async fn register_peer_connection(peer_id: PeerId, stream: TcpStream) {
    transports::set_peer_presence(TransportMedium::WifiDirect, peer_id.clone(), true);

    if let Ok(monitor_stream) = stream.try_clone() {
        tokio::spawn(monitor_connection(monitor_stream, peer_id.clone()));
    }

    WIFI_DIRECT_INCOMING.lock().await.push_back(stream);
    WIFI_DIRECT_NOTIFY.notify_waiters();
}

#[cfg(feature = "wifi-direct")]
async fn monitor_connection(mut stream: TcpStream, peer_id: PeerId) {
    let mut buffer = [0u8; 1];
    loop {
        match stream.read(&mut buffer).await {
            Ok(0) => break,
            Ok(_) => continue,
            Err(_) => break,
        }
    }
    transports::set_peer_presence(TransportMedium::WifiDirect, peer_id, false);
}
