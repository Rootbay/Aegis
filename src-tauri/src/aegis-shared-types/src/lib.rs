use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use sqlx::{Pool, Sqlite};
use chrono::{DateTime, Utc};
use crypto::identity::Identity;

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
    pub channels: Vec<Channel>,
    pub members: Vec<User>,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::FromRow)]
pub struct Channel {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub channel_type: String,
    pub private: bool,
}

#[derive(Clone)]
pub struct AppState {
    pub identity: Identity,
    pub network_tx: mpsc::Sender<Vec<u8>>,
    pub db_pool: Pool<Sqlite>,
    pub incoming_files: Arc<Mutex<HashMap<String, IncomingFile>>>, // Key is "<sender_id>:<file_name>"
    pub file_cmd_tx: mpsc::Sender<FileTransferCommand>,
    pub file_acl_policy: Arc<Mutex<FileAclPolicy>>, // dynamic, shared across clones
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
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileTransferCommand {
    Send { recipient_peer_id: String, path: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileAclPolicy {
    Everyone,
    FriendsOnly,
}

