use chrono::{DateTime, Utc};
use crypto::identity::Identity;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{atomic::AtomicBool, Arc};
use tokio::sync::{mpsc, Mutex};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectivityPeer {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hop_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub via: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seen: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_gateway: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectivityLink {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub medium: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectivityGatewayStatus {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bridge_mode_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forwarding: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream_peer_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_dial_attempt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectivityEventPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub internet_reachable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mesh_reachable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_peers: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mesh_peers: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peers: Option<Vec<ConnectivityPeer>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub links: Option<Vec<ConnectivityLink>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bridge_suggested: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gateway_status: Option<ConnectivityGatewayStatus>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub avatar: String,
    pub is_online: bool,
    pub public_key: Option<String>,
    pub bio: Option<String>,
    pub tag: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Server {
    pub id: String,
    pub name: String,
    pub owner_id: String,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_channel_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_invites: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub moderation_level: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explicit_content_filter: Option<bool>,
    #[serde(default)]
    pub channels: Vec<Channel>,
    #[serde(default)]
    pub categories: Vec<ChannelCategory>,
    #[serde(default)]
    pub members: Vec<User>,
    #[serde(default)]
    pub roles: Vec<Role>,
    #[serde(default)]
    pub invites: Vec<ServerInvite>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServerInvite {
    pub id: String,
    pub server_id: String,
    pub code: String,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_uses: Option<i64>,
    pub uses: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Role {
    pub id: String,
    pub name: String,
    pub color: String,
    pub hoist: bool,
    pub mentionable: bool,
    pub permissions: HashMap<String, bool>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub member_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::FromRow)]
pub struct Channel {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub channel_type: String,
    pub private: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::FromRow)]
pub struct ChannelCategory {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub position: i64,
    pub created_at: String,
}

#[derive(Clone)]
pub struct AppState {
    pub identity: Identity,
    pub network_tx: mpsc::Sender<Vec<u8>>,
    pub db_pool: Pool<Sqlite>,
    pub incoming_files: Arc<Mutex<HashMap<String, IncomingFile>>>, // Key is "<sender_id>:<file_name>"
    pub file_cmd_tx: mpsc::Sender<FileTransferCommand>,
    pub file_acl_policy: Arc<Mutex<FileAclPolicy>>, // dynamic, shared across clones
    pub app_data_dir: PathBuf,
    pub connectivity_snapshot: Arc<Mutex<Option<ConnectivityEventPayload>>>,
    pub voice_memos_enabled: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct IncomingFile {
    pub name: String,
    pub size: u64,
    pub received_chunks: HashMap<u64, Vec<u8>>,
    pub key: Vec<u8>,
    pub nonce: Vec<u8>,
    pub sender_id: String,
    pub accepted: bool,
    pub mode: FileTransferMode,
    pub staging_path: Option<PathBuf>,
    pub metadata_path: Option<PathBuf>,
    pub resumed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileTransferCommand {
    Send {
        recipient_peer_id: String,
        path: String,
        mode: FileTransferMode,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileAclPolicy {
    Everyone,
    FriendsOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileTransferMode {
    Basic,
    Resilient,
}

