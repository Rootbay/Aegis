use aegis_protocol::{AepMessage, DeleteMessageData, MessageDeletionScope, MessageEditData};
use aegis_shared_types::AppState;
use aep::database;
use tauri::State;

use crate::commands::state::AppStateContainer;

pub(super) async fn delete_message_internal(
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

pub(super) async fn edit_message_internal(
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
pub async fn pin_message(
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

    let metadata = database::get_message_metadata(&state.db_pool, &message_id)
        .await
        .map_err(|e| e.to_string())?;

    let metadata = metadata.ok_or_else(|| "Message not found".to_string())?;
    if metadata.chat_id != chat_id {
        return Err("Message does not belong to the specified chat".to_string());
    }

    let updated = database::set_message_pinned(&state.db_pool, &message_id, true)
        .await
        .map_err(|e| e.to_string())?;

    if !updated {
        return Err("Failed to pin message".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn unpin_message(
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

    let metadata = database::get_message_metadata(&state.db_pool, &message_id)
        .await
        .map_err(|e| e.to_string())?;

    let metadata = metadata.ok_or_else(|| "Message not found".to_string())?;
    if metadata.chat_id != chat_id {
        return Err("Message does not belong to the specified chat".to_string());
    }

    let updated = database::set_message_pinned(&state.db_pool, &message_id, false)
        .await
        .map_err(|e| e.to_string())?;

    if !updated {
        return Err("Failed to unpin message".to_string());
    }

    Ok(())
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
