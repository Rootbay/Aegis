use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentDescriptor {
    pub name: String,
    #[serde(rename = "type")]
    pub content_type: Option<String>,
    pub size: u64,
    #[serde(with = "serde_bytes")]
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedDmPayload {
    pub content: String,
    pub attachments: Vec<AttachmentDescriptor>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_snapshot_author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_snapshot_snippet: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct EncryptChatPayloadResponse {
    pub content: String,
    pub attachments: Vec<AttachmentDescriptor>,
    pub metadata: EncryptMetadata,
    #[serde(rename = "wasEncrypted")]
    pub was_encrypted: bool,
}

#[derive(Debug, Serialize)]
pub struct EncryptMetadata {
    pub algorithm: String,
    pub version: u8,
}

#[derive(Debug, Serialize)]
pub struct DecryptChatPayloadResponse {
    pub content: String,
    pub attachments: Vec<AttachmentDescriptor>,
    #[serde(rename = "wasEncrypted")]
    pub was_encrypted: bool,
}
