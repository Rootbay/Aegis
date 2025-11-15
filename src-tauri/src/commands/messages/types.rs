use aep::database;
use serde::ser::{SerializeStruct, Serializer};
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

#[derive(Debug)]
pub struct SearchMessagesResponse {
    pub messages: Vec<database::Message>,
    pub has_more: bool,
    pub next_cursor: Option<String>,
    pub cursor: Option<String>,
}

impl Serialize for SearchMessagesResponse {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("SearchMessagesResponse", 7)?;
        state.serialize_field("messages", &self.messages)?;
        state.serialize_field("results", &self.messages)?;
        state.serialize_field("has_more", &self.has_more)?;
        state.serialize_field("hasMore", &self.has_more)?;
        state.serialize_field("next_cursor", &self.next_cursor)?;
        state.serialize_field("nextCursor", &self.next_cursor)?;
        state.serialize_field("cursor", &self.cursor)?;
        state.end()
    }
}
