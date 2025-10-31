use std::collections::HashMap;
use std::sync::atomic::Ordering;

use aegis_protocol::AepMessage;
use aegis_shared_types::AppState;
use aep::database;
use chrono::Utc;
use tauri::State;

use crate::commands::state::AppStateContainer;

use super::helpers::{is_voice_memo_attachment, parse_optional_datetime};
use super::types::AttachmentDescriptor;

pub(super) async fn persist_and_broadcast_message(
    state: AppState,
    message: String,
    attachments: Vec<AttachmentDescriptor>,
    conversation_id: Option<String>,
    channel_id: Option<String>,
    server_id: Option<String>,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<chrono::DateTime<Utc>>,
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

    let voice_memos_enabled = state.voice_memos_enabled.load(Ordering::Relaxed);
    if !voice_memos_enabled && attachments.iter().any(is_voice_memo_attachment) {
        return Err("Voice memo attachments are disabled by your settings.".to_string());
    }

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
        pinned: false,
        attachments: db_attachments,
        reactions: HashMap::new(),
        reply_to_message_id: reply_to_message_id.clone(),
        reply_snapshot_author: reply_snapshot_author.clone(),
        reply_snapshot_snippet: reply_snapshot_snippet.clone(),
        edited_at: None,
        edited_by: None,
        expires_at: expires_at.clone(),
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
        expires_at: expires_at.clone(),
        reply_to_message_id: reply_to_message_id.clone(),
        reply_snapshot_author: reply_snapshot_author.clone(),
        reply_snapshot_snippet: reply_snapshot_snippet.clone(),
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
        expires_at,
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
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
pub async fn send_message(
    message: String,
    channel_id: Option<String>,
    server_id: Option<String>,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    let expires_at = parse_optional_datetime(expires_at)?;

    persist_and_broadcast_message(
        state,
        message,
        Vec::new(),
        None,
        channel_id,
        server_id,
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
        expires_at,
    )
    .await
}

#[tauri::command]
pub async fn send_message_with_attachments(
    message: String,
    attachments: Vec<AttachmentDescriptor>,
    channel_id: Option<String>,
    server_id: Option<String>,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    let expires_at = parse_optional_datetime(expires_at)?;

    persist_and_broadcast_message(
        state,
        message,
        attachments,
        None,
        channel_id,
        server_id,
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
        expires_at,
    )
    .await
}

#[tauri::command]
pub async fn send_direct_message(
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

    let expires_at = parse_optional_datetime(expires_at)?;

    persist_and_broadcast_message(
        state,
        message,
        Vec::new(),
        Some(recipient_id),
        None,
        None,
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
        expires_at,
    )
    .await
}

#[tauri::command]
pub async fn send_direct_message_with_attachments(
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

    let expires_at = parse_optional_datetime(expires_at)?;

    persist_and_broadcast_message(
        state,
        message,
        attachments,
        Some(recipient_id),
        None,
        None,
        reply_to_message_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
        expires_at,
    )
    .await
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
