use crate::commands::state::{with_state_async, AppStateContainer};
use aegis_protocol::{AepMessage, RenameGroupChatData};
use aegis_shared_types::AppState;
use tauri::State;

use super::helpers::{normalize_group_name, GroupChatPayload};

#[tauri::command]
pub async fn rename_group_dm(
    group_id: String,
    name: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<GroupChatPayload, String> {
    if group_id.trim().is_empty() {
        return Err("Group ID is required".to_string());
    }

    let trimmed_name = name.trim().to_string();

    with_state_async(state_container, move |state| {
        let group_id = group_id.clone();
        let trimmed_name = trimmed_name.clone();
        async move { rename_group_dm_internal(state, group_id, trimmed_name).await }
    })
    .await
}

async fn rename_group_dm_internal(
    state: AppState,
    group_id: String,
    trimmed_name: String,
) -> Result<GroupChatPayload, String> {
    let updater_id = state.identity.peer_id().to_base58();

    let is_member = aep::database::is_group_chat_member(&state.db_pool, &group_id, &updater_id)
        .await
        .map_err(|e| e.to_string())?;

    if !is_member {
        return Err("You are not a member of this group.".to_string());
    }

    let normalized_name = normalize_group_name(Some(trimmed_name), &group_id);

    aep::database::update_group_chat_name(&state.db_pool, &group_id, normalized_name.clone())
        .await
        .map_err(|e| e.to_string())?;

    let record = aep::database::get_group_chat_record(&state.db_pool, &group_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Group not found.".to_string())?;

    let payload = GroupChatPayload::from_record(record);

    let rename_payload = RenameGroupChatData {
        group_id: group_id.clone(),
        name: normalized_name.clone(),
        updater_id: updater_id.clone(),
    };

    let signing_bytes = bincode::serialize(&rename_payload).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&signing_bytes)
        .map_err(|e| e.to_string())?;

    let message = AepMessage::RenameGroupChat {
        group_id,
        name: normalized_name,
        updater_id,
        signature: Some(signature),
    };

    let serialized = bincode::serialize(&message).map_err(|e| e.to_string())?;

    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())?;

    Ok(payload)
}
