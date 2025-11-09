use aegis_protocol::{AepMessage, FriendRequestResponseData};
use aegis_shared_types::AppState;
use aep::database;

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

pub async fn send_friend_request_response(
    state: &AppState,
    friendship: &database::Friendship,
    accepted: bool,
) -> CommandResult<()> {
    let my_id = state.identity.peer_id().to_base58();
    let counterpart_id = if friendship.user_a_id == my_id {
        friendship.user_b_id.clone()
    } else if friendship.user_b_id == my_id {
        friendship.user_a_id.clone()
    } else {
        return Err("Caller identity mismatch".to_string());
    };

    let friend_request_response_data = FriendRequestResponseData {
        sender_id: my_id.clone(),
        target_id: counterpart_id.clone(),
        accepted,
    };
    let friend_request_response_bytes = serialize(&friend_request_response_data)?;
    let signature = state
        .identity
        .keypair()
        .sign(&friend_request_response_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::FriendRequestResponse {
        sender_id: my_id.clone(),
        target_id: counterpart_id,
        accepted,
        signature: Some(signature),
    };
    let serialized_message = serialize(&aep_message)?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())
}
