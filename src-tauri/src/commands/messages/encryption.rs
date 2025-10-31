use std::collections::HashMap;
use std::sync::atomic::Ordering;

use aegis_protocol::{AepMessage, EncryptedDmSlot};
use aegis_shared_types::AppState;
use aep::database;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::ChaCha20Poly1305;
use chrono::Utc;
use tauri::State;

use crate::commands::state::AppStateContainer;

use super::helpers::{is_voice_memo_attachment, parse_optional_datetime};
use super::types::{
    AttachmentDescriptor, AttachmentEnvelope, DecryptChatPayloadResponse,
    EncryptChatPayloadResponse, EncryptMetadata, EncryptedDmPayload, MessageEnvelope,
};

const ENVELOPE_VERSION: u8 = 1;
const ENVELOPE_ALGORITHM: &str = "chacha20poly1305";

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

fn serialize_message_envelope(
    ciphertext: Vec<u8>,
    key: Vec<u8>,
    nonce: Vec<u8>,
) -> Result<String, String> {
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
    serde_json::to_vec(&envelope)
        .map_err(|e| format!("Failed to serialize attachment envelope: {e}"))
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

        let effective_size = if size == 0 { data.len() as u64 } else { size };
        let sanitized_size = if effective_size == data.len() as u64 {
            effective_size
        } else {
            data.len() as u64
        };

        let (attachment_ciphertext, key, nonce) = encrypt_bytes(&data)?;
        let envelope_bytes =
            serialize_attachment_envelope(attachment_ciphertext, key, nonce, sanitized_size)?;

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

#[tauri::command]
pub async fn send_encrypted_dm(
    recipient_id: String,
    message: String,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    let expires_at = parse_optional_datetime(expires_at)?;

    let new_local_message = database::Message {
        id: uuid::Uuid::new_v4().to_string(),
        chat_id: recipient_id.clone(),
        sender_id: my_id.clone(),
        content: message.clone(),
        timestamp: chrono::Utc::now(),
        read: false,
        pinned: false,
        attachments: Vec::new(),
        reactions: HashMap::new(),
        reply_to_message_id: reply_to_message_id.clone(),
        reply_snapshot_author: reply_snapshot_author.clone(),
        reply_snapshot_snippet: reply_snapshot_snippet.clone(),
        edited_at: None,
        edited_by: None,
        expires_at,
    };
    database::insert_message(&state.db_pool, &new_local_message)
        .await
        .map_err(|e| e.to_string())?;

    let payload = EncryptedDmPayload {
        content: message.clone(),
        attachments: Vec::new(),
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
    };
    let plaintext = bincode::serialize(&payload).map_err(|e| e.to_string())?;

    let pkt = {
        let e2ee_arc = e2ee::init_global_manager();
        let mut mgr = e2ee_arc.lock();
        mgr.encrypt_for(&recipient_id, &plaintext)
            .map_err(|e| format!("E2EE encrypt error: {e}"))?
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
pub async fn send_encrypted_dm_with_attachments(
    recipient_id: String,
    message: String,
    attachments: Vec<AttachmentDescriptor>,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    let expires_at = parse_optional_datetime(expires_at)?;

    let voice_memos_enabled = state.voice_memos_enabled.load(Ordering::Relaxed);
    if !voice_memos_enabled && attachments.iter().any(is_voice_memo_attachment) {
        return Err("Voice memo attachments are disabled by your settings.".to_string());
    }

    let message_id = uuid::Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now();
    let mut db_attachments = Vec::new();
    let mut payload_attachments = Vec::new();

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

        let data_len = data.len() as u64;
        let effective_size = if size == 0 { data_len } else { size };
        let sanitized_size = if effective_size == data_len {
            effective_size
        } else {
            data_len
        };

        let attachment_id = uuid::Uuid::new_v4().to_string();
        db_attachments.push(database::Attachment {
            id: attachment_id,
            message_id: message_id.clone(),
            name: name.clone(),
            content_type: content_type.clone(),
            size: sanitized_size,
            data: Some(data.clone()),
        });

        payload_attachments.push(AttachmentDescriptor {
            name,
            content_type,
            size: sanitized_size,
            data,
        });
    }

    let new_local_message = database::Message {
        id: message_id,
        chat_id: recipient_id.clone(),
        sender_id: my_id.clone(),
        content: message.clone(),
        timestamp,
        read: false,
        pinned: false,
        attachments: db_attachments,
        reactions: HashMap::new(),
        reply_to_message_id: reply_to_message_id.clone(),
        reply_snapshot_author: reply_snapshot_author.clone(),
        reply_snapshot_snippet: reply_snapshot_snippet.clone(),
        edited_at: None,
        edited_by: None,
        expires_at,
    };
    database::insert_message(&state.db_pool, &new_local_message)
        .await
        .map_err(|e| e.to_string())?;

    let payload = EncryptedDmPayload {
        content: message,
        attachments: payload_attachments,
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
    };
    let plaintext = bincode::serialize(&payload).map_err(|e| e.to_string())?;

    let pkt = {
        let e2ee_arc = e2ee::init_global_manager();
        let mut mgr = e2ee_arc.lock();
        mgr.encrypt_for(&recipient_id, &plaintext)
            .map_err(|e| format!("E2EE encrypt error: {e}"))?
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
    use rand::RngCore;
    let mut key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);

    {
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock();
        mgr.set_group_key(&server_id, &channel_id, epoch, &key);
    }

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
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let _ = parse_optional_datetime(expires_at)?;
    let payload = EncryptedDmPayload {
        content: message,
        attachments: Vec::new(),
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
    };
    let serialized_payload = bincode::serialize(&payload).map_err(|e| e.to_string())?;

    let (epoch, nonce, ciphertext) = {
        let arc = e2ee::init_global_manager();
        let mgr = arc.lock();
        mgr.encrypt_group_message(&server_id, &channel_id, &serialized_payload)
            .map_err(|e| format!("Group E2EE: {e}"))?
    };

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
