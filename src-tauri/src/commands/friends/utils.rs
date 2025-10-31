use aegis_shared_types::AppState;

use super::models::CommandResult;

pub fn ensure_caller_identity(state: &AppState, current_user_id: &str) -> CommandResult<String> {
    let my_id = state.identity.peer_id().to_base58();
    if current_user_id == my_id {
        Ok(my_id)
    } else {
        Err("Caller identity mismatch".to_string())
    }
}

pub fn serialize<T: serde::Serialize>(value: &T) -> CommandResult<Vec<u8>> {
    bincode::serialize(value).map_err(|e| e.to_string())
}
