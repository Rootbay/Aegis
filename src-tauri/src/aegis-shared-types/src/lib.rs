use chrono::{DateTime, Utc};
use crypto::identity::Identity;
use rkyv::{Archive, Deserialize as RkyvDeserialize, Serialize as RkyvSerialize};
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route_quality: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success_rate: Option<f32>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<f32>,
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
pub struct ConnectivityTransportStatus {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bluetooth_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wifi_direct_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bluetooth_peers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wifi_direct_peers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_peer_id: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transports: Option<ConnectivityTransportStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relays: Option<Vec<RelaySnapshot>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RelayScope {
    Global,
    Server,
}

impl Default for RelayScope {
    fn default() -> Self {
        RelayScope::Global
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RelayStatus {
    Unknown,
    Healthy,
    Degraded,
    Offline,
}

impl Default for RelayStatus {
    fn default() -> Self {
        RelayStatus::Unknown
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RelayConfig {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub urls: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential: Option<String>,
    #[serde(default)]
    pub scope: RelayScope,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub server_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayHealth {
    #[serde(default)]
    pub status: RelayStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_checked_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uptime_percent: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Default for RelayHealth {
    fn default() -> Self {
        RelayHealth {
            status: RelayStatus::Unknown,
            last_checked_at: None,
            latency_ms: None,
            uptime_percent: None,
            error: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RelayRecord {
    pub config: RelayConfig,
    #[serde(default)]
    pub health: RelayHealth,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RelaySnapshot {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub urls: Vec<String>,
    pub scope: RelayScope,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub server_ids: Vec<String>,
    #[serde(default)]
    pub has_credential: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<RelayStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_checked_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uptime_percent: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl RelayRecord {
    pub fn to_snapshot(&self) -> RelaySnapshot {
        RelaySnapshot {
            id: self.config.id.clone(),
            label: self.config.label.clone(),
            urls: self.config.urls.clone(),
            scope: self.config.scope,
            server_ids: self.config.server_ids.clone(),
            has_credential: self.config.username.is_some() || self.config.credential.is_some(),
            status: Some(self.health.status),
            last_checked_at: self.health.last_checked_at.clone(),
            latency_ms: self.health.latency_ms,
            uptime_percent: self.health.uptime_percent,
            error: self.health.error.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Archive, RkyvSerialize, RkyvDeserialize)]
#[archive_attr(derive(Debug, PartialEq, Eq))]
pub struct User {
    pub id: String,
    pub username: String,
    pub avatar: String,
    pub is_online: bool,
    pub public_key: Option<String>,
    pub bio: Option<String>,
    pub tag: Option<String>,
    pub status_message: Option<String>,
    pub location: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transparent_edits: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_message_display: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub read_receipts_enabled: Option<bool>,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Archive, RkyvSerialize, RkyvDeserialize, sqlx::FromRow)]
#[archive_attr(derive(Debug, PartialEq, Eq))]
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceTrustStatus {
    Active,
    Revoked,
    PendingApproval,
}

impl Default for DeviceTrustStatus {
    fn default() -> Self {
        DeviceTrustStatus::Active
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrustedDeviceRecord {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub status: DeviceTrustStatus,
    pub added_at: String,
    pub last_seen: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DevicePairingStage {
    BundleIssued,
    AwaitingApproval,
    Approved,
    Completed,
    Expired,
}

impl Default for DevicePairingStage {
    fn default() -> Self {
        DevicePairingStage::BundleIssued
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeviceProvisioningBundle {
    pub bundle_id: String,
    pub created_at: String,
    pub expires_at: String,
    pub qr_payload: String,
    pub code_phrase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PendingDeviceLink {
    pub name: String,
    pub platform: String,
    pub requested_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PendingDeviceProvisioning {
    pub bundle: DeviceProvisioningBundle,
    pub escrow_ciphertext: String,
    pub stage: DevicePairingStage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requesting_device: Option<PendingDeviceLink>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_message: Option<String>,
    #[serde(skip)]
    pub code_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeviceProvisioningState {
    pub bundle: DeviceProvisioningBundle,
    pub stage: DevicePairingStage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requesting_device: Option<PendingDeviceLink>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_message: Option<String>,
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
    pub relays: Arc<Mutex<Vec<RelayRecord>>>,
    pub trusted_devices: Arc<Mutex<Vec<TrustedDeviceRecord>>>,
    pub pending_device_bundles: Arc<Mutex<HashMap<String, PendingDeviceProvisioning>>>,
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
