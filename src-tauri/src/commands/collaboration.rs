use crate::commands::state::AppStateContainer;
use aegis_protocol::{AepMessage, CollaborationKind};
use chrono::Utc;
use serde::Deserialize;
use std::collections::HashSet;
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CollaborationKindCommand {
    Document,
    Whiteboard,
}

impl From<CollaborationKindCommand> for CollaborationKind {
    fn from(value: CollaborationKindCommand) -> Self {
        match value {
            CollaborationKindCommand::Document => CollaborationKind::Document,
            CollaborationKindCommand::Whiteboard => CollaborationKind::Whiteboard,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CollaborationUpdateCommand {
    #[serde(rename = "documentId")]
    pub document_id: String,
    pub update: Vec<u8>,
    pub kind: CollaborationKindCommand,
    #[serde(default)]
    pub participants: Vec<String>,
}

#[tauri::command]
pub async fn send_collaboration_update(
    payload: CollaborationUpdateCommand,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();

    let sender_id = state.identity.peer_id().to_base58();
    let mut participants: HashSet<String> = payload.participants.into_iter().collect();
    participants.insert(sender_id.clone());

    let message = AepMessage::CollaborationUpdate {
        document_id: payload.document_id,
        update: payload.update,
        kind: payload.kind.into(),
        sender_id,
        participants: participants.into_iter().collect(),
        timestamp: Some(Utc::now()),
    };

    let serialized = bincode::serialize(&message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}
