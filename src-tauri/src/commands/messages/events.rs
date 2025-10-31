use chrono::Utc;
use serde::Serialize;
use tauri::State;

use aegis_protocol::{AepMessage, ReadReceiptData, TypingIndicatorData};
use aegis_shared_types::AppState;

use crate::commands::state::AppStateContainer;

#[derive(Clone, Debug, Serialize)]
pub struct ReadReceiptEventPayload {
    #[serde(rename = "chatId")]
    pub chat_id: String,
    #[serde(rename = "messageId")]
    pub message_id: String,
    #[serde(rename = "readerId")]
    pub reader_id: String,
    pub timestamp: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct TypingIndicatorEventPayload {
    #[serde(rename = "chatId")]
    pub chat_id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(rename = "isTyping")]
    pub is_typing: bool,
    pub timestamp: String,
}

pub(super) async fn broadcast_read_receipt(
    state: AppState,
    chat_id: String,
    message_id: String,
) -> Result<(), String> {
    let reader_id = state.identity.peer_id().to_base58();
    let timestamp = Utc::now();

    let payload = ReadReceiptData {
        chat_id: chat_id.clone(),
        message_id: message_id.clone(),
        reader_id: reader_id.clone(),
        timestamp,
    };
    let bytes = bincode::serialize(&payload).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&bytes)
        .map_err(|e| e.to_string())?;

    let message = AepMessage::ReadReceipt {
        chat_id,
        message_id,
        reader_id,
        timestamp,
        signature: Some(signature),
    };

    let serialized = bincode::serialize(&message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}

pub(super) async fn broadcast_typing_indicator(
    state: AppState,
    chat_id: String,
    is_typing: bool,
) -> Result<(), String> {
    let user_id = state.identity.peer_id().to_base58();
    let timestamp = Utc::now();

    let payload = TypingIndicatorData {
        chat_id: chat_id.clone(),
        user_id: user_id.clone(),
        is_typing,
        timestamp,
    };
    let bytes = bincode::serialize(&payload).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&bytes)
        .map_err(|e| e.to_string())?;

    let message = AepMessage::TypingIndicator {
        chat_id,
        user_id,
        is_typing,
        timestamp,
        signature: Some(signature),
    };
    let serialized = bincode::serialize(&message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_read_receipt(
    _app: tauri::AppHandle,
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

    broadcast_read_receipt(state, chat_id, message_id).await
}

#[tauri::command]
pub async fn send_typing_indicator(
    _app: tauri::AppHandle,
    chat_id: String,
    is_typing: bool,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();
    drop(state_guard);

    broadcast_typing_indicator(state, chat_id, is_typing).await
}
