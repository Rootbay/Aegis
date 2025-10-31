use tauri::State;

use aegis_protocol::{AepMessage, MessageReactionData, ReactionAction};
use aegis_shared_types::AppState;
use aep::database;

use crate::commands::state::AppStateContainer;

async fn broadcast_reaction(
    state: AppState,
    chat_id: String,
    message_id: String,
    emoji: String,
    action: ReactionAction,
) -> Result<(), String> {
    let user_id = state.identity.peer_id().to_base58();

    let reaction_data = MessageReactionData {
        message_id: message_id.clone(),
        chat_id: chat_id.clone(),
        emoji: emoji.clone(),
        user_id: user_id.clone(),
        action: action.clone(),
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
        action,
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

    broadcast_reaction(state, chat_id, message_id, emoji, ReactionAction::Add).await
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

    broadcast_reaction(state, chat_id, message_id, emoji, ReactionAction::Remove).await
}
