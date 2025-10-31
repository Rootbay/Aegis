use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum AepMessage {
    ChatMessage {
        id: String,
        timestamp: DateTime<Utc>,
        sender: String,
        content: String,
        channel_id: Option<String>,
        server_id: Option<String>,
        conversation_id: Option<String>,
        attachments: Vec<AttachmentPayload>,
        expires_at: Option<DateTime<Utc>>,
        reply_to_message_id: Option<String>,
        reply_snapshot_author: Option<String>,
        reply_snapshot_snippet: Option<String>,
        signature: Option<Vec<u8>>,
    },
    // Signal-style E2EE payload for direct messages
    EncryptedChatMessage {
        sender: String,
        recipient: String,
        init: Option<Vec<u8>>,
        enc_header: Vec<u8>,
        enc_content: Vec<u8>,
        signature: Option<Vec<u8>>,
    },
    // Distribution of X3DH prekey bundle
    PrekeyBundle {
        user_id: String,
        bundle: Vec<u8>,
        signature: Option<Vec<u8>>,
    },
    // Group-key distribution: each slot is an individually E2EE-encrypted blob for a member
    GroupKeyUpdate {
        server_id: String,
        channel_id: Option<String>,
        epoch: u64,
        slots: Vec<EncryptedDmSlot>,
        signature: Option<Vec<u8>>,
    },
    // Encrypted group chat content using a symmetric group key
    EncryptedGroupMessage {
        sender: String,
        server_id: String,
        channel_id: Option<String>,
        epoch: u64,
        nonce: Vec<u8>,
        ciphertext: Vec<u8>,
        signature: Option<Vec<u8>>,
    },
    PeerDiscovery { peer_id: String, address: String, signature: Option<Vec<u8>> },
    PresenceUpdate {
        user_id: String,
        is_online: bool,
        status_message: Option<String>,
        location: Option<String>,
        signature: Option<Vec<u8>>,
    },
    ProfileUpdate { user: User, signature: Option<Vec<u8>> },
    FriendRequest { sender_id: String, target_id: String, signature: Option<Vec<u8>> },
    FriendRequestResponse { sender_id: String, target_id: String, accepted: bool, signature: Option<Vec<u8>> },
    BlockUser { blocker_id: String, blocked_id: String, signature: Option<Vec<u8>> },
    UnblockUser { unblocker_id: String, unblocked_id: String, signature: Option<Vec<u8>> },
    RemoveFriendship { remover_id: String, removed_id: String, signature: Option<Vec<u8>> },
    CreateGroupChat {
        group_id: String,
        name: Option<String>,
        creator_id: String,
        member_ids: Vec<String>,
        created_at: DateTime<Utc>,
        signature: Option<Vec<u8>>,
    },
    LeaveGroupChat {
        group_id: String,
        member_id: String,
        signature: Option<Vec<u8>>,
    },
    RenameGroupChat {
        group_id: String,
        name: Option<String>,
        updater_id: String,
        signature: Option<Vec<u8>>,
    },
    CreateServer { server: Server, signature: Option<Vec<u8>> },
    JoinServer { server_id: String, user_id: String, signature: Option<Vec<u8>> },
    CreateChannel { channel: Channel, signature: Option<Vec<u8>> },
    DeleteChannel { channel_id: String, signature: Option<Vec<u8>> },
    DeleteServer { server_id: String, signature: Option<Vec<u8>> },
    SendServerInvite { server_id: String, user_id: String, signature: Option<Vec<u8>> },
    FileTransferRequest {
        sender_id: String,
        recipient_id: String,
        file_name: String,
        file_size: u64,
        encrypted_key: Vec<u8>,
        nonce: Vec<u8>,
    },
    FileTransferChunk {
        sender_id: String,
        recipient_id: String,
        file_name: String,
        chunk_index: u64,
        data: Vec<u8>,
    },
    FileTransferComplete {
        sender_id: String,
        recipient_id: String,
        file_name: String,
    },
    FileTransferError {
        sender_id: String,
        recipient_id: String,
        file_name: String,
        error: String,
    },
    CallSignal {
        sender_id: String,
        recipient_id: String,
        call_id: String,
        signal: CallSignalPayload,
    },
    CollaborationUpdate {
        document_id: String,
        update: Vec<u8>,
        kind: CollaborationKind,
        sender_id: String,
        participants: Vec<String>,
        timestamp: Option<DateTime<Utc>>,
    },
    MessageReaction {
        message_id: String,
        chat_id: String,
        emoji: String,
        user_id: String,
        action: ReactionAction,
        signature: Option<Vec<u8>>,
    },
    DeleteMessage {
        message_id: String,
        chat_id: String,
        initiator_id: String,
        scope: MessageDeletionScope,
        signature: Option<Vec<u8>>,
    },
    EditMessage {
        message_id: String,
        chat_id: String,
        editor_id: String,
        new_content: String,
        edited_at: DateTime<Utc>,
        signature: Option<Vec<u8>>,
    },
    ReadReceipt {
        chat_id: String,
        message_id: String,
        reader_id: String,
        timestamp: DateTime<Utc>,
        signature: Option<Vec<u8>>,
    },
    TypingIndicator {
        chat_id: String,
        user_id: String,
        is_typing: bool,
        timestamp: DateTime<Utc>,
        signature: Option<Vec<u8>>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum CollaborationKind {
    Document,
    Whiteboard,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateServerData {
    pub server: Server,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JoinServerData {
    pub server_id: String,
    pub user_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateChannelData {
    pub channel: Channel,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeleteChannelData {
    pub channel_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeleteServerData {
    pub server_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SendServerInviteData {
    pub server_id: String,
    pub user_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum MessageDeletionScope {
    Everyone,
    SpecificUsers { user_ids: Vec<String> },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeleteMessageData {
    pub message_id: String,
    pub chat_id: String,
    pub initiator_id: String,
    pub scope: MessageDeletionScope,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageEditData {
    pub message_id: String,
    pub chat_id: String,
    pub editor_id: String,
    pub new_content: String,
    pub edited_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateGroupChatData {
    pub group_id: String,
    pub name: Option<String>,
    pub creator_id: String,
    pub member_ids: Vec<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LeaveGroupChatData {
    pub group_id: String,
    pub member_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RenameGroupChatData {
    pub group_id: String,
    pub name: Option<String>,
    pub updater_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessageData {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub sender: String,
    pub content: String,
    pub channel_id: Option<String>,
    pub server_id: Option<String>,
    pub conversation_id: Option<String>,
    pub attachments: Vec<AttachmentPayload>,
    pub expires_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_snapshot_author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_snapshot_snippet: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AttachmentPayload {
    pub id: String,
    pub name: String,
    pub content_type: Option<String>,
    pub size: u64,
    pub data: Vec<u8>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum CallSignalPayload {
    Offer {
        sdp: String,
        call_type: String,
        chat_name: Option<String>,
    },
    Answer {
        sdp: String,
    },
    IceCandidate {
        candidate: String,
        sdp_mid: Option<String>,
        sdp_mline_index: Option<u16>,
    },
    End {
        reason: Option<String>,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ReactionAction {
    Add,
    Remove,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageReactionData {
    pub message_id: String,
    pub chat_id: String,
    pub emoji: String,
    pub user_id: String,
    pub action: ReactionAction,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReadReceiptData {
    pub chat_id: String,
    pub message_id: String,
    pub reader_id: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TypingIndicatorData {
    pub chat_id: String,
    pub user_id: String,
    pub is_typing: bool,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PeerDiscoveryData {
    pub peer_id: String,
    pub address: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PresenceUpdateData {
    pub user_id: String,
    pub is_online: bool,
    pub status_message: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FriendRequestData {
    pub sender_id: String,
    pub target_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FriendRequestResponseData {
    pub sender_id: String,
    pub target_id: String,
    pub accepted: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BlockUserData {
    pub blocker_id: String,
    pub blocked_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UnblockUserData { pub unblocker_id: String, pub unblocked_id: String, }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoveFriendshipData {
    pub remover_id: String,
    pub removed_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileTransferRequestData {
    pub sender_id: String,
    pub recipient_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub encrypted_key: Vec<u8>,
    pub nonce: Vec<u8>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileTransferChunkData {
    pub sender_id: String,
    pub recipient_id: String,
    pub file_name: String,
    pub chunk_index: u64,
    pub data: Vec<u8>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileTransferCompleteData {
    pub sender_id: String,
    pub recipient_id: String,
    pub file_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileTransferErrorData {
    pub sender_id: String,
    pub recipient_id: String,
    pub file_name: String,
    pub error: String,
}

// Re-exporting types from aegis_types for convenience
pub use aegis_shared_types::{User, Server, Channel};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EncryptedDmSlot {
    pub recipient: String,
    pub init: Option<Vec<u8>>,
    pub enc_header: Vec<u8>,
    pub enc_content: Vec<u8>,
}
