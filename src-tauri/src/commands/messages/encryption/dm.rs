use std::collections::HashMap;
use std::sync::atomic::Ordering;

use aep::database;
use chrono::Utc;
use tauri::State;

use crate::commands::state::{with_state_async, AppStateContainer};
use scu128::Scu128;

use super::super::helpers::{is_voice_memo_attachment, parse_optional_datetime};
use super::super::types::{
    AttachmentDescriptor, DecryptChatPayloadResponse, EncryptChatPayloadResponse, EncryptMetadata,
    EncryptedDmPayload,
};
use super::{
    decrypt_bytes, deserialize_attachment_envelope, deserialize_message_envelope, encrypt_bytes,
    serialize_attachment_envelope, serialize_message_envelope, ENVELOPE_ALGORITHM,
    ENVELOPE_VERSION,
};

fn normalize_size(declared: u64, actual_len: usize) -> u64 {
    if declared == 0 || declared != actual_len as u64 {
        actual_len as u64
    } else {
        declared
    }
}

#[tauri::command]
pub async fn encrypt_chat_payload(
    content: String,
    attachments: Vec<AttachmentDescriptor>,
) -> Result<EncryptChatPayloadResponse, String> {
    let envelope = encrypt_bytes(content.as_bytes())?;
    let serialized_content = serialize_message_envelope(envelope)?;

    let mut encrypted_attachments = Vec::with_capacity(attachments.len());
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

        let sanitized_size = normalize_size(size, data.len());
        let cipher = encrypt_bytes(&data)?;
        let envelope_bytes = serialize_attachment_envelope(cipher, sanitized_size)?;

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

    if let Some(cipher) = deserialize_message_envelope(&content)? {
        if let Ok(bytes) = decrypt_bytes(&cipher) {
            if let Ok(text) = String::from_utf8(bytes) {
                decrypted_content = text;
                any_decrypted = true;
            }
        }
    }

    let mut decrypted_attachments = Vec::new();
    if let Some(items) = attachments {
        decrypted_attachments.reserve(items.len());
        for descriptor in items {
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

            if let Some(payload) = deserialize_attachment_envelope(&data) {
                if let Ok(bytes) = decrypt_bytes(&payload.cipher) {
                    decrypted_attachments.push(AttachmentDescriptor {
                        name,
                        content_type,
                        size: payload.original_size,
                        data: bytes,
                    });
                    any_decrypted = true;
                    continue;
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
    with_state_async(state_container, move |state| {
        let recipient_id = recipient_id.clone();
        let message = message.clone();
        async move {
            let my_id = state.identity.peer_id().to_base58();
            let expires_at = parse_optional_datetime(expires_at)?;

            let new_local_message = database::Message {
                id: Scu128::new().to_string(),
                chat_id: recipient_id.clone(),
                sender_id: my_id.clone(),
                content: message.clone(),
                timestamp: Utc::now(),
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
            database::insert_message(&state.db_pool, &new_local_message, &[])
                .await
                .map_err(|e| e.to_string())?;

            let payload = EncryptedDmPayload {
                content: message.clone(),
                attachments: Vec::new(),
                reply_to_message_id,
                reply_snapshot_author,
                reply_snapshot_snippet,
            };

            let identity = state.identity.clone();
            let recipient_id_clone = recipient_id.clone();
            let my_id_clone = my_id.clone();

            let (pkt, signature) = tokio::task::spawn_blocking(move || {
                let plaintext = bincode::serialize(&payload).map_err(|e| e.to_string())?;

                let pkt = {
                    let e2ee_arc = e2ee::init_global_manager();
                    let mut mgr = e2ee_arc.lock();
                    mgr.encrypt_for(&recipient_id_clone, &plaintext)
                        .map_err(|e| format!("E2EE encrypt error: {e}"))?
                };

                let payload_sig_bytes = bincode::serialize(&(
                    my_id_clone,
                    recipient_id_clone,
                    &pkt.enc_header,
                    &pkt.enc_content,
                ))
                .map_err(|e| e.to_string())?;

                let signature = identity
                    .keypair()
                    .sign(&payload_sig_bytes)
                    .map_err(|e| e.to_string())?;

                Ok::<_, String>((pkt, signature))
            })
            .await
            .map_err(|e| e.to_string())??;

            let aep_message = aegis_protocol::AepMessage::EncryptedChatMessage {
                sender: my_id,
                recipient: recipient_id,
                init: pkt.init,
                enc_header: pkt.enc_header,
                enc_content: pkt.enc_content,
                signature: Some(signature),
            };

            let serialized_message = tokio::task::spawn_blocking(move || {
                bincode::serialize(&aep_message).map_err(|e| e.to_string())
            })
            .await
            .map_err(|e| e.to_string())??;

            state
                .network_tx
                .send(serialized_message)
                .await
                .map_err(|e| e.to_string())
        }
    })
    .await
}

#[tauri::command]
pub async fn send_encrypted_dm_with_attachments(
    recipient_id: String,
    message: String,
    incoming_attachments: Vec<AttachmentDescriptor>,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    with_state_async(state_container, move |state| {
        let recipient_id = recipient_id.clone();
        let message = message.clone();
        let mut attachments = incoming_attachments;
        async move {
            let my_id = state.identity.peer_id().to_base58();
            let expires_at = parse_optional_datetime(expires_at)?;

            let voice_memos_enabled = state.voice_memos_enabled.load(Ordering::Relaxed);
            if !voice_memos_enabled && attachments.iter().any(is_voice_memo_attachment) {
                return Err("Voice memo attachments are disabled by your settings.".to_string());
            }

            let message_id = Scu128::new().to_string();
            let timestamp = Utc::now();
            let mut db_attachments = Vec::with_capacity(attachments.len());
            let mut attachment_data = Vec::with_capacity(attachments.len());
            let mut payload_attachments = Vec::with_capacity(attachments.len());

            for descriptor in attachments.drain(..) {
                let AttachmentDescriptor {
                    name,
                    content_type,
                    size,
                    data,
                } = descriptor;

                if data.is_empty() {
                    return Err(format!("Attachment '{name}' is missing binary data"));
                }

                let sanitized_size = normalize_size(size, data.len());
                let attachment_id = Scu128::new().to_string();
                let attachment = database::Attachment {
                    id: attachment_id,
                    message_id: message_id.clone(),
                    name: name.clone(),
                    content_type: content_type.clone(),
                    size: sanitized_size,
                };
                db_attachments.push(attachment.clone());
                attachment_data.push(database::AttachmentWithData {
                    metadata: attachment,
                    data: data.clone(),
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
            database::insert_message(&state.db_pool, &new_local_message, &attachment_data)
                .await
                .map_err(|e| e.to_string())?;

            let payload = EncryptedDmPayload {
                content: message,
                attachments: payload_attachments,
                reply_to_message_id,
                reply_snapshot_author,
                reply_snapshot_snippet,
            };

            let identity = state.identity.clone();
            let recipient_id_clone = recipient_id.clone();
            let my_id_clone = my_id.clone();

            let (pkt, signature) = tokio::task::spawn_blocking(move || {
                let plaintext = bincode::serialize(&payload).map_err(|e| e.to_string())?;

                let pkt = {
                    let e2ee_arc = e2ee::init_global_manager();
                    let mut mgr = e2ee_arc.lock();
                    mgr.encrypt_for(&recipient_id_clone, &plaintext)
                        .map_err(|e| format!("E2EE encrypt error: {e}"))?
                };

                let payload_sig_bytes = bincode::serialize(&(
                    my_id_clone,
                    recipient_id_clone,
                    &pkt.enc_header,
                    &pkt.enc_content,
                ))
                .map_err(|e| e.to_string())?;

                let signature = identity
                    .keypair()
                    .sign(&payload_sig_bytes)
                    .map_err(|e| e.to_string())?;

                Ok::<_, String>((pkt, signature))
            })
            .await
            .map_err(|e| e.to_string())??;

            let aep_message = aegis_protocol::AepMessage::EncryptedChatMessage {
                sender: my_id,
                recipient: recipient_id,
                init: pkt.init,
                enc_header: pkt.enc_header,
                enc_content: pkt.enc_content,
                signature: Some(signature),
            };

            let serialized_message = tokio::task::spawn_blocking(move || {
                bincode::serialize(&aep_message).map_err(|e| e.to_string())
            })
            .await
            .map_err(|e| e.to_string())??;

            state
                .network_tx
                .send(serialized_message)
                .await
                .map_err(|e| e.to_string())
        }
    })
    .await
}
