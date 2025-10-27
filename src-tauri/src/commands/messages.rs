use crate::commands::state::AppStateContainer;
use aegis_protocol::EncryptedDmSlot;
use aegis_protocol::{
    AepMessage, DeleteMessageData, MessageDeletionScope, MessageEditData, MessageReactionData,
    ReactionAction,
};
use aegis_shared_types::AppState;
use aep::database;
use e2ee;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::ChaCha20Poly1305;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

const ENVELOPE_VERSION: u8 = 1;
const ENVELOPE_ALGORITHM: &str = "chacha20poly1305";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentDescriptor {
    pub name: String,
    #[serde(rename = "type")]
    pub content_type: Option<String>,
    pub size: u64,
    #[serde(with = "serde_bytes")]
    pub data: Vec<u8>,
}

#[derive(Debug, Serialize, Deserialize)]
struct MessageEnvelope {
    version: u8,
    algorithm: String,
    nonce: String,
    key: String,
    ciphertext: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AttachmentEnvelope {
    version: u8,
    algorithm: String,
    nonce: String,
    key: String,
    ciphertext: String,
    original_size: u64,
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

fn encrypt_bytes(data: &[u8]) -> Result<(Vec<u8>, Vec<u8>, Vec<u8>), String> {
    let mut key = [0u8; 32];
    rand::rngs::OsRng
        .try_fill_bytes(&mut key)
        .map_err(|e| format!("Failed to generate key: {e}"))?;
    let cipher = ChaCha20Poly1305::new_from_slice(&key)
        .map_err(|e| format!("Failed to initialise cipher: {e}"))?;
    let mut nonce = [0u8; 12];
    rand::rngs::OsRng
        .try_fill_bytes(&mut nonce)
        .map_err(|e| format!("Failed to generate nonce: {e}"))?;
    let ciphertext = cipher
        .encrypt(chacha20poly1305::Nonce::from_slice(&nonce), data)
        .map_err(|e| format!("Encryption error: {e}"))?;
    Ok((ciphertext, key.to_vec(), nonce.to_vec()))
}

fn decrypt_bytes(ciphertext: &[u8], key: &[u8], nonce: &[u8]) -> Result<Vec<u8>, String> {
    if key.len() != 32 {
        return Err("Invalid key length".to_string());
    }
    if nonce.len() != 12 {
        return Err("Invalid nonce length".to_string());
    }
    let cipher = ChaCha20Poly1305::new_from_slice(key)
        .map_err(|e| format!("Failed to initialise cipher: {e}"))?;
    cipher
        .decrypt(chacha20poly1305::Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| "Failed to decrypt payload".to_string())
}

fn serialize_message_envelope(ciphertext: Vec<u8>, key: Vec<u8>, nonce: Vec<u8>) -> Result<String, String> {
    let envelope = MessageEnvelope {
        version: ENVELOPE_VERSION,
        algorithm: ENVELOPE_ALGORITHM.to_string(),
        nonce: BASE64.encode(&nonce),
        key: BASE64.encode(&key),
        ciphertext: BASE64.encode(&ciphertext),
    };
    serde_json::to_string(&envelope).map_err(|e| format!("Failed to serialize envelope: {e}"))
}

fn serialize_attachment_envelope(
    ciphertext: Vec<u8>,
    key: Vec<u8>,
    nonce: Vec<u8>,
    original_size: u64,
) -> Result<Vec<u8>, String> {
    let envelope = AttachmentEnvelope {
        version: ENVELOPE_VERSION,
        algorithm: ENVELOPE_ALGORITHM.to_string(),
        nonce: BASE64.encode(&nonce),
        key: BASE64.encode(&key),
        ciphertext: BASE64.encode(&ciphertext),
        original_size,
    };
    serde_json::to_vec(&envelope).map_err(|e| format!("Failed to serialize attachment envelope: {e}"))
}

fn deserialize_message_envelope(content: &str) -> Result<Option<MessageEnvelope>, String> {
    if content.trim().is_empty() {
        return Ok(None);
    }
    match serde_json::from_str::<MessageEnvelope>(content) {
        Ok(env) if env.version == ENVELOPE_VERSION => Ok(Some(env)),
        Ok(_) => Ok(None),
        Err(_) => Ok(None),
    }
}

fn deserialize_attachment_envelope(data: &[u8]) -> Option<AttachmentEnvelope> {
    serde_json::from_slice::<AttachmentEnvelope>(data)
        .ok()
        .filter(|env| env.version == ENVELOPE_VERSION)
}

#[tauri::command]
pub async fn encrypt_chat_payload(
    content: String,
    attachments: Vec<AttachmentDescriptor>,
) -> Result<EncryptChatPayloadResponse, String> {
    let (ciphertext, key, nonce) = encrypt_bytes(content.as_bytes())?;
    let serialized_content = serialize_message_envelope(ciphertext, key, nonce)?;

    let mut encrypted_attachments = Vec::new();
    for descriptor in attachments.into_iter() {
        let AttachmentDescriptor {
            name,
            content_type,
            size,
            data,
        } = descriptor;

        if data.is_empty() {
            return Err(format!("Attachment '{name}' is missing binary data"));
        }

        let effective_size = if size == 0 {
            data.len() as u64
        } else {
            size
        };
        let sanitized_size = if effective_size == data.len() as u64 {
            effective_size
        } else {
            data.len() as u64
        };

        let (attachment_ciphertext, key, nonce) = encrypt_bytes(&data)?;
        let envelope_bytes = serialize_attachment_envelope(
            attachment_ciphertext,
            key,
            nonce,
            sanitized_size,
        )?;

        encrypted_attachments.push(AttachmentDescriptor {
            name,
            content_type,
            size: sanitized_size,
            data: envelope_bytes,
        });
    }

    Ok(EncryptChatPayloadResponse {
        content: serialized_content,
        attachments: encrypted_attachments,
        metadata: EncryptMetadata {
            algorithm: ENVELOPE_ALGORITHM.to_string(),
            version: ENVELOPE_VERSION,
        },
        was_encrypted: true,
    })
}

#[tauri::command]
pub async fn decrypt_chat_payload(
    content: String,
    attachments: Option<Vec<AttachmentDescriptor>>,
) -> Result<DecryptChatPayloadResponse, String> {
    let mut decrypted_content = content.clone();
    let mut any_decrypted = false;

    if let Some(envelope) = deserialize_message_envelope(&content)? {
        if let (Ok(ciphertext), Ok(key), Ok(nonce)) = (
            BASE64.decode(envelope.ciphertext),
            BASE64.decode(envelope.key),
            BASE64.decode(envelope.nonce),
        ) {
            if let Ok(bytes) = decrypt_bytes(&ciphertext, &key, &nonce) {
                if let Ok(text) = String::from_utf8(bytes) {
                    decrypted_content = text;
                    any_decrypted = true;
                }
            }
        }
    }

    let mut decrypted_attachments = Vec::new();
    if let Some(items) = attachments {
        for descriptor in items.into_iter() {
            let AttachmentDescriptor {
                name,
                content_type,
                size,
                data,
            } = descriptor;

            if data.is_empty() {
                decrypted_attachments.push(AttachmentDescriptor {
                    name,
                    content_type,
                    size,
                    data,
                });
                continue;
            }

            if let Some(env) = deserialize_attachment_envelope(&data) {
                if let (Ok(ciphertext), Ok(key), Ok(nonce)) = (
                    BASE64.decode(env.ciphertext),
                    BASE64.decode(env.key),
                    BASE64.decode(env.nonce),
                ) {
                    if let Ok(bytes) = decrypt_bytes(&ciphertext, &key, &nonce) {
                        decrypted_attachments.push(AttachmentDescriptor {
                            name,
                            content_type,
                            size: env.original_size,
                            data: bytes,
                        });
                        any_decrypted = true;
                        continue;
                    }
                }
            }

            decrypted_attachments.push(AttachmentDescriptor {
                name,
                content_type,
                size,
                data,
            });
        }
    }

    Ok(DecryptChatPayloadResponse {
        content: decrypted_content,
        attachments: decrypted_attachments,
        was_encrypted: any_decrypted,
    })
}

async fn persist_and_broadcast_message(
    state: AppState,
    message: String,
    attachments: Vec<AttachmentDescriptor>,
    conversation_id: Option<String>,
    channel_id: Option<String>,
    server_id: Option<String>,
) -> Result<(), String> {
    let peer_id = state.identity.peer_id().to_base58();

    let chat_id_local = conversation_id
        .clone()
        .or_else(|| channel_id.clone())
        .or_else(|| server_id.clone())
        .unwrap_or_else(|| peer_id.clone());

    let payload_conversation_id = Some(chat_id_local.clone());

    let message_id = uuid::Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now();

    let mut db_attachments = Vec::new();
    let mut protocol_attachments = Vec::new();

    for descriptor in attachments {
        let AttachmentDescriptor {
            name,
            content_type,
            size,
            data,
        } = descriptor;
        if data.is_empty() {
            return Err(format!("Attachment '{name}' is missing binary data"));
        }

        let attachment_id = uuid::Uuid::new_v4().to_string();
        let data_len = data.len() as u64;
        let effective_size = if size == 0 { data_len } else { size };
        let sanitized_size = if effective_size == data_len {
            effective_size
        } else {
            data_len
        };

        db_attachments.push(database::Attachment {
            id: attachment_id.clone(),
            message_id: message_id.clone(),
            name: name.clone(),
            content_type: content_type.clone(),
            size: sanitized_size,
            data: Some(data.clone()),
        });

        protocol_attachments.push(aegis_protocol::AttachmentPayload {
            id: attachment_id,
            name,
            content_type,
            size: sanitized_size,
            data,
        });
    }

    let new_local_message = database::Message {
        id: message_id.clone(),
        chat_id: chat_id_local,
        sender_id: peer_id.clone(),
        content: message.clone(),
        timestamp: timestamp,
        read: false,
        attachments: db_attachments,
        reactions: HashMap::new(),
        edited_at: None,
        edited_by: None,
    };
    database::insert_message(&state.db_pool, &new_local_message)
        .await
        .map_err(|e| e.to_string())?;

    let chat_message_data = aegis_protocol::ChatMessageData {
        id: message_id.clone(),
        timestamp: new_local_message.timestamp.clone(),
        sender: peer_id.clone(),
        content: message.clone(),
        channel_id: channel_id.clone(),
        server_id: server_id.clone(),
        conversation_id: payload_conversation_id.clone(),
        attachments: protocol_attachments.clone(),
    };
    let chat_message_bytes = bincode::serialize(&chat_message_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&chat_message_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::ChatMessage {
        id: message_id,
        timestamp: new_local_message.timestamp,
        sender: peer_id,
        content: message,
        channel_id,
        server_id,
        conversation_id: payload_conversation_id,
        attachments: protocol_attachments,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())
}

async fn delete_message_internal(
    state: AppState,
    chat_id: String,
    message_id: String,
    scope: MessageDeletionScope,
) -> Result<(), String> {
    let my_id = state.identity.peer_id().to_base58();

    let metadata = database::get_message_metadata(&state.db_pool, &message_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Message not found".to_string())?;

    if metadata.chat_id != chat_id {
        return Err("Message does not belong to the provided chat".to_string());
    }

    if metadata.sender_id != my_id {
        return Err("You can only delete messages that you sent".to_string());
    }

    database::delete_message(&state.db_pool, &message_id)
        .await
        .map_err(|e| e.to_string())?;

    let deletion_payload = DeleteMessageData {
        message_id: message_id.clone(),
        chat_id: chat_id.clone(),
        initiator_id: my_id.clone(),
        scope: scope.clone(),
    };
    let deletion_bytes = bincode::serialize(&deletion_payload).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&deletion_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::DeleteMessage {
        message_id,
        chat_id,
        initiator_id: my_id,
        scope,
        signature: Some(signature),
    };
    let serialized = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}

async fn edit_message_internal(
    state: AppState,
    chat_id: String,
    message_id: String,
    new_content: String,
) -> Result<(), String> {
    let trimmed = new_content.trim();
    if trimmed.is_empty() {
        return Err("Message content cannot be empty".to_string());
    }

    let my_id = state.identity.peer_id().to_base58();

    let metadata = database::get_message_metadata(&state.db_pool, &message_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Message not found".to_string())?;

    if metadata.chat_id != chat_id {
        return Err("Message does not belong to the provided chat".to_string());
    }

    if metadata.sender_id != my_id {
        return Err("You can only edit messages that you sent".to_string());
    }

    let edited_at = chrono::Utc::now();

    database::update_message_content(&state.db_pool, &message_id, trimmed, edited_at, &my_id)
        .await
        .map_err(|e| e.to_string())?;

    let edit_payload = MessageEditData {
        message_id: message_id.clone(),
        chat_id: chat_id.clone(),
        editor_id: my_id.clone(),
        new_content: trimmed.to_string(),
        edited_at,
    };
    let edit_bytes = bincode::serialize(&edit_payload).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&edit_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::EditMessage {
        message_id,
        chat_id,
        editor_id: my_id,
        new_content: trimmed.to_string(),
        edited_at,
        signature: Some(signature),
    };
    let serialized = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_message(
    message: String,
    channel_id: Option<String>,
    server_id: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    persist_and_broadcast_message(state, message, Vec::new(), None, channel_id, server_id).await
}

#[tauri::command]
pub async fn send_message_with_attachments(
    message: String,
    attachments: Vec<AttachmentDescriptor>,
    channel_id: Option<String>,
    server_id: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    persist_and_broadcast_message(state, message, attachments, None, channel_id, server_id).await
}

#[tauri::command]
pub async fn send_direct_message(
    recipient_id: String,
    message: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    persist_and_broadcast_message(state, message, Vec::new(), Some(recipient_id), None, None).await
}

#[tauri::command]
pub async fn send_direct_message_with_attachments(
    recipient_id: String,
    message: String,
    attachments: Vec<AttachmentDescriptor>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    persist_and_broadcast_message(state, message, attachments, Some(recipient_id), None, None).await
}

#[tauri::command]
pub async fn get_messages(
    chat_id: String,
    limit: i64,
    offset: i64,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::Message>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    database::get_messages_for_chat(&state.db_pool, &chat_id, limit, offset)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_attachment_bytes(
    attachment_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<u8>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    database::get_attachment_data(&state.db_pool, &attachment_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn edit_message(
    chat_id: String,
    message_id: String,
    content: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    edit_message_internal(state, chat_id, message_id, content).await
}
#[tauri::command]
pub async fn delete_message(
    chat_id: String,
    message_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    delete_message_internal(state, chat_id, message_id, MessageDeletionScope::Everyone).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use aegis_protocol::AepMessage;
    use aegis_shared_types::{AppState, FileAclPolicy, IncomingFile, User};
    use aep::user_service;
    use bs58;
    use chrono::Utc;
    use crypto::identity::Identity;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tempfile::tempdir;
    use tokio::sync::Mutex;
    use uuid::Uuid;

    fn build_app_state(identity: Identity, db_pool: sqlx::Pool<sqlx::Sqlite>) -> AppState {
        let (network_tx, _network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        AppState {
            identity,
            network_tx,
            db_pool,
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
        }
    }

    #[tokio::test]
    async fn delete_message_is_broadcast_and_applied() {
        let local_dir = tempdir().expect("tempdir");
        let local_db = aep::database::initialize_db(local_dir.path().join("local.db"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let user_id = identity.peer_id().to_base58();
        let public_key_b58 =
            bs58::encode(identity.keypair().public().to_protobuf_encoding()).into_string();

        let user = User {
            id: user_id.clone(),
            username: "Tester".into(),
            avatar: "avatar.png".into(),
            is_online: true,
            public_key: Some(public_key_b58.clone()),
            bio: None,
            tag: None,
        };

        user_service::insert_user(&local_db, &user)
            .await
            .expect("insert user");

        let message_id = Uuid::new_v4().to_string();
        let chat_id = "chat-123".to_string();

        let message = database::Message {
            id: message_id.clone(),
            chat_id: chat_id.clone(),
            sender_id: user_id.clone(),
            content: "Hello".into(),
            timestamp: Utc::now(),
            read: false,
            attachments: Vec::new(),
            reactions: HashMap::new(),
            edited_at: None,
            edited_by: None,
        };
        database::insert_message(&local_db, &message)
            .await
            .expect("insert message");

        let (network_tx, mut network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let local_state = AppState {
            identity: identity.clone(),
            network_tx,
            db_pool: local_db.clone(),
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
        };

        delete_message_internal(
            local_state,
            chat_id.clone(),
            message_id.clone(),
            MessageDeletionScope::Everyone,
        )
        .await
        .expect("delete message locally");

        let remaining = database::get_messages_for_chat(&local_db, &chat_id, 10, 0)
            .await
            .expect("fetch");
        assert!(remaining.is_empty(), "message should be deleted locally");

        let serialized = network_rx
            .recv()
            .await
            .expect("delete event should be emitted");
        let event: AepMessage =
            bincode::deserialize(&serialized).expect("event deserializes correctly");

        let remote_dir = tempdir().expect("tempdir");
        let remote_db = aep::database::initialize_db(remote_dir.path().join("remote.db"))
            .await
            .expect("init remote db");

        user_service::insert_user(&remote_db, &user)
            .await
            .expect("insert remote user");

        database::insert_message(&remote_db, &message)
            .await
            .expect("insert remote message");

        let remote_state = build_app_state(Identity::generate(), remote_db.clone());

        aep::handle_aep_message(event, &remote_db, remote_state)
            .await
            .expect("remote delete should succeed");

        let remote_remaining = database::get_messages_for_chat(&remote_db, &chat_id, 10, 0)
            .await
            .expect("fetch remote");
        assert!(
            remote_remaining.is_empty(),
            "message should be deleted on remote client"
        );
    }

    #[tokio::test]
    async fn edit_message_is_persisted_and_broadcast() {
        let local_dir = tempdir().expect("tempdir");
        let local_db = aep::database::initialize_db(local_dir.path().join("local.db"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let user_id = identity.peer_id().to_base58();
        let public_key_b58 =
            bs58::encode(identity.keypair().public().to_protobuf_encoding()).into_string();

        let user = User {
            id: user_id.clone(),
            username: "Tester".into(),
            avatar: "avatar.png".into(),
            is_online: true,
            public_key: Some(public_key_b58.clone()),
            bio: None,
            tag: None,
        };

        user_service::insert_user(&local_db, &user)
            .await
            .expect("insert user");

        let message_id = Uuid::new_v4().to_string();
        let chat_id = "chat-456".to_string();

        let message = database::Message {
            id: message_id.clone(),
            chat_id: chat_id.clone(),
            sender_id: user_id.clone(),
            content: "Original".into(),
            timestamp: Utc::now(),
            read: false,
            attachments: Vec::new(),
            reactions: HashMap::new(),
            edited_at: None,
            edited_by: None,
        };
        database::insert_message(&local_db, &message)
            .await
            .expect("insert message");

        let (network_tx, mut network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let local_state = AppState {
            identity: identity.clone(),
            network_tx,
            db_pool: local_db.clone(),
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
        };

        let new_content = "Edited message".to_string();
        edit_message_internal(
            local_state,
            chat_id.clone(),
            message_id.clone(),
            new_content.clone(),
        )
        .await
        .expect("edit message locally");

        let updated_local = database::get_messages_for_chat(&local_db, &chat_id, 10, 0)
            .await
            .expect("fetch local");
        assert_eq!(updated_local.len(), 1);
        let updated = &updated_local[0];
        assert_eq!(updated.content, new_content);
        assert_eq!(updated.edited_by.as_deref(), Some(user_id.as_str()));
        assert!(updated.edited_at.is_some());

        let serialized = network_rx
            .recv()
            .await
            .expect("edit event should be emitted");
        let event: AepMessage =
            bincode::deserialize(&serialized).expect("event deserializes correctly");

        let remote_dir = tempdir().expect("tempdir");
        let remote_db = aep::database::initialize_db(remote_dir.path().join("remote.db"))
            .await
            .expect("init remote db");

        user_service::insert_user(&remote_db, &user)
            .await
            .expect("insert remote user");

        database::insert_message(&remote_db, &message)
            .await
            .expect("insert remote message");

        let remote_state = build_app_state(Identity::generate(), remote_db.clone());

        aep::handle_aep_message(event.clone(), &remote_db, remote_state)
            .await
            .expect("remote edit should succeed");

        if let AepMessage::EditMessage {
            message_id: event_message_id,
            chat_id: event_chat_id,
            editor_id,
            new_content: event_content,
            edited_at: event_time,
            ..
        } = event
        {
            assert_eq!(event_message_id, message_id);
            assert_eq!(event_chat_id, chat_id);
            assert_eq!(editor_id, user_id);
            assert_eq!(event_content, new_content);

            let remote_messages = database::get_messages_for_chat(&remote_db, &chat_id, 10, 0)
                .await
                .expect("fetch remote");
            assert_eq!(remote_messages.len(), 1);
            let remote_message = &remote_messages[0];
            assert_eq!(remote_message.content, new_content);
            assert_eq!(remote_message.edited_by.as_deref(), Some(user_id.as_str()));
            let remote_time = remote_message
                .edited_at
                .expect("remote message should have edited_at");
            assert_eq!(remote_time.to_rfc3339(), event_time.to_rfc3339());
        } else {
            panic!("expected edit message event");
        }
    }
}

#[tauri::command]
pub async fn send_encrypted_dm(
    recipient_id: String,
    message: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    // Insert locally for UX
    let new_local_message = database::Message {
        id: uuid::Uuid::new_v4().to_string(),
        chat_id: recipient_id.clone(),
        sender_id: my_id.clone(),
        content: message.clone(),
        timestamp: chrono::Utc::now(),
        read: false,
        attachments: Vec::new(),
        reactions: HashMap::new(),
        edited_at: None,
        edited_by: None,
    };
    database::insert_message(&state.db_pool, &new_local_message)
        .await
        .map_err(|e| e.to_string())?;

    // Encrypt via E2EE manager
    let pkt = {
        let e2ee_arc = e2ee::init_global_manager();
        let mut mgr = e2ee_arc.lock();
        let pkt = mgr
            .encrypt_for(&recipient_id, message.as_bytes())
            .map_err(|e| format!("E2EE encrypt error: {e}"))?;
        pkt
    };

    let payload_sig_bytes = bincode::serialize(&(
        my_id.clone(),
        recipient_id.clone(),
        &pkt.enc_header,
        &pkt.enc_content,
    ))
    .map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&payload_sig_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::EncryptedChatMessage {
        sender: my_id,
        recipient: recipient_id,
        init: pkt.init,
        enc_header: pkt.enc_header,
        enc_content: pkt.enc_content,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rotate_group_key(
    server_id: String,
    channel_id: Option<String>,
    epoch: u64,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    // Derive fresh random key
    use rand::RngCore;
    let mut key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);

    // Save locally
    {
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock();
        mgr.set_group_key(&server_id, &channel_id, epoch, &key);
    }

    // Build encrypted slots per member
    let members = aep::database::get_server_members(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    let mut slots: Vec<EncryptedDmSlot> = Vec::new();
    for m in members {
        if m.id == state.identity.peer_id().to_base58() {
            continue;
        }
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock();
        let pkt = mgr
            .encrypt_for(&m.id, &key)
            .map_err(|e| format!("E2EE encrypt error: {e}"))?;
        slots.push(EncryptedDmSlot {
            recipient: m.id,
            init: pkt.init,
            enc_header: pkt.enc_header,
            enc_content: pkt.enc_content,
        });
    }

    let issuer_id = state.identity.peer_id().to_base58();
    let payload = bincode::serialize(&(issuer_id.clone(), &server_id, &channel_id, epoch, &slots))
        .map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&payload)
        .map_err(|e| e.to_string())?;

    let aep_msg = aegis_protocol::AepMessage::GroupKeyUpdate {
        server_id,
        channel_id,
        epoch,
        slots,
        signature: Some(signature),
    };
    let bytes = bincode::serialize(&aep_msg).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(bytes)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_encrypted_group_message(
    server_id: String,
    channel_id: Option<String>,
    message: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    // Encrypt using group key
    let (epoch, nonce, ciphertext) = {
        let arc = e2ee::init_global_manager();
        let mgr = arc.lock();
        mgr.encrypt_group_message(&server_id, &channel_id, message.as_bytes())
            .map_err(|e| format!("Group E2EE: {e}"))?
    };

    // Sign payload
    let payload = bincode::serialize(&(
        state.identity.peer_id().to_base58(),
        &server_id,
        &channel_id,
        epoch,
        &nonce,
        &ciphertext,
    ))
    .map_err(|e| e.to_string())?;
    let sig = state
        .identity
        .keypair()
        .sign(&payload)
        .map_err(|e| e.to_string())?;

    // Broadcast
    let msg = aegis_protocol::AepMessage::EncryptedGroupMessage {
        sender: state.identity.peer_id().to_base58(),
        server_id,
        channel_id,
        epoch,
        nonce,
        ciphertext,
        signature: Some(sig),
    };
    let bytes = bincode::serialize(&msg).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(bytes)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_reaction(
    chat_id: String,
    message_id: String,
    emoji: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let user_id = state.identity.peer_id().to_base58();

    database::add_reaction_to_message(&state.db_pool, &message_id, &user_id, &emoji)
        .await
        .map_err(|e| e.to_string())?;

    let reaction_data = MessageReactionData {
        message_id: message_id.clone(),
        chat_id: chat_id.clone(),
        emoji: emoji.clone(),
        user_id: user_id.clone(),
        action: ReactionAction::Add,
    };
    let reaction_bytes = bincode::serialize(&reaction_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&reaction_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::MessageReaction {
        message_id,
        chat_id,
        emoji,
        user_id,
        action: ReactionAction::Add,
        signature: Some(signature),
    };
    let serialized = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_reaction(
    chat_id: String,
    message_id: String,
    emoji: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    let user_id = state.identity.peer_id().to_base58();

    database::remove_reaction_from_message(&state.db_pool, &message_id, &user_id, &emoji)
        .await
        .map_err(|e| e.to_string())?;

    let reaction_data = MessageReactionData {
        message_id: message_id.clone(),
        chat_id: chat_id.clone(),
        emoji: emoji.clone(),
        user_id: user_id.clone(),
        action: ReactionAction::Remove,
    };
    let reaction_bytes = bincode::serialize(&reaction_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&reaction_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::MessageReaction {
        message_id,
        chat_id,
        emoji,
        user_id,
        action: ReactionAction::Remove,
        signature: Some(signature),
    };
    let serialized = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}
