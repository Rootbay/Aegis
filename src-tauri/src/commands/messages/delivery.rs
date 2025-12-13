use std::collections::HashMap;
use std::sync::atomic::Ordering;

use aegis_protocol::AepMessage;
use aegis_shared_types::AppState;
use aep::database;
use chrono::{TimeZone, Utc};
use serde::Deserialize;
use tauri::State;

use crate::commands::state::AppStateContainer;
use scu128::Scu128;

use super::helpers::{is_voice_memo_attachment, parse_optional_datetime};
use super::types::{AttachmentDescriptor, SearchMessagesResponse};

#[derive(Debug, Deserialize, Default)]
pub struct SearchMessagesFilters {
    pinned: Option<bool>,
    from: Option<Vec<String>>,
    before: Option<i64>,
    after: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SearchMessagesPayload {
    #[serde(alias = "chatId")]
    chat_id: Option<String>,
    query: Option<String>,
    limit: Option<i64>,
    cursor: Option<String>,
    filters: Option<SearchMessagesFilters>,
}

fn timestamp_from_millis(millis: i64) -> Option<String> {
    Utc.timestamp_millis_opt(millis)
        .single()
        .map(|dt| dt.to_rfc3339())
}

#[tauri::command]
pub async fn search_messages(
    payload: SearchMessagesPayload,
    state_container: State<'_, AppStateContainer>,
) -> Result<SearchMessagesResponse, String> {
    let chat_id = payload
        .chat_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "chat_id is required".to_string())?
        .to_string();

    let filters = payload.filters.unwrap_or_default();
    let limit = payload.limit.unwrap_or(50).max(1).min(200);
    let offset = payload
        .cursor
        .and_then(|value| value.parse::<i64>().ok())
        .map(|value| value.max(0))
        .unwrap_or(0);

    let query = payload
        .query
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let sender_ids = filters.from.and_then(|values| {
        let cleaned: Vec<String> = values
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect();
        if cleaned.is_empty() {
            None
        } else {
            Some(cleaned)
        }
    });

    let before_iso = filters.before.and_then(timestamp_from_millis);
    let after_iso = filters.after.and_then(timestamp_from_millis);

    let fetch_limit = limit + 1;

    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;

    let mut results = aep::database::search_messages(
        &state.db_pool,
        &chat_id,
        query.as_deref(),
        fetch_limit,
        offset,
        filters.pinned,
        sender_ids.as_deref(),
        before_iso.as_deref(),
        after_iso.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?;

    let has_more = (results.len() as i64) > limit;
    if has_more {
        results.pop();
    }

    let cursor_value = if has_more {
        Some((offset + limit).to_string())
    } else {
        None
    };

    Ok(SearchMessagesResponse {
        messages: results,
        has_more,
        next_cursor: cursor_value.clone(),
        cursor: cursor_value,
    })
}

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

    let message_id = Scu128::new().to_string();
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

        let attachment_id = Scu128::new().to_string();
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

    let identity = state.identity.clone();
    let signature = tokio::task::spawn_blocking(move || {
        let chat_message_bytes =
            bincode::serialize(&chat_message_data).map_err(|e| e.to_string())?;
        let signature = identity
            .keypair()
            .sign(&chat_message_bytes)
            .map_err(|e| e.to_string())?;
        Ok::<_, String>(signature)
    })
    .await
    .map_err(|e| e.to_string())??;

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

    let serialized_final = tokio::task::spawn_blocking(move || {
        bincode::serialize(&aep_message).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    state
        .network_tx
        .send(serialized_final)
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
