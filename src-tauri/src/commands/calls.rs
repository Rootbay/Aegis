use crate::commands::state::AppStateContainer;
use aegis_protocol::{AepMessage, CallSignalPayload};
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Clone, Deserialize)]
pub struct CallSignalCommand {
    pub recipient_id: String,
    pub call_id: String,
    pub signal: CallSignalPayload,
}

#[tauri::command]
pub async fn send_call_signal(
    payload: CallSignalCommand,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.load_full().ok_or("State not initialized")?;

    let sender_id = state.identity.peer_id().to_base58();

    let message = AepMessage::CallSignal {
        sender_id,
        recipient_id: payload.recipient_id,
        call_id: payload.call_id,
        signal: payload.signal,
    };

    let serialized = bincode::serialize(&message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())
}
