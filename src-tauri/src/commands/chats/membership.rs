use crate::commands::state::{with_state_async, AppStateContainer};
use aegis_protocol::{
    AddGroupChatMembersData, AepMessage, LeaveGroupChatData, RemoveGroupChatMemberData,
};
use aegis_shared_types::AppState;
use tauri::State;

use super::helpers::GroupChatPayload;

#[tauri::command]
pub async fn leave_group_dm(
    group_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    with_state_async(state_container, move |state| {
        let group_id = group_id.clone();
        async move { leave_group_dm_internal(state, group_id).await }
    })
    .await
}

async fn leave_group_dm_internal(state: AppState, group_id: String) -> Result<(), String> {
    let user_id = state.identity.peer_id().to_base58();

    let removed = aep::database::remove_group_chat_member(&state.db_pool, &group_id, &user_id)
        .await
        .map_err(|e| e.to_string())?;

    if !removed {
        return Err("You are not a member of this group.".to_string());
    }

    let payload = LeaveGroupChatData {
        group_id: group_id.clone(),
        member_id: user_id.clone(),
    };
    let signing_bytes = bincode::serialize(&payload).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&signing_bytes)
        .map_err(|e| e.to_string())?;

    let message = AepMessage::LeaveGroupChat {
        group_id,
        member_id: user_id,
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
pub async fn add_group_dm_member(
    group_id: String,
    member_ids: Vec<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<GroupChatPayload, String> {
    if member_ids.is_empty() {
        return Err("Please select at least one member to add.".to_string());
    }

    with_state_async(state_container, move |state| {
        let group_id = group_id.clone();
        let member_ids = member_ids.clone();
        async move { add_group_dm_member_internal(state, group_id, member_ids).await }
    })
    .await
}

async fn add_group_dm_member_internal(
    state: AppState,
    group_id: String,
    member_ids: Vec<String>,
) -> Result<GroupChatPayload, String> {
    let adder_id = state.identity.peer_id().to_base58();

    let added_members =
        aep::database::add_group_chat_members(&state.db_pool, &group_id, &member_ids)
            .await
            .map_err(|e| e.to_string())?;

    if added_members.is_empty() {
        return Err("No new members were added.".to_string());
    }

    let record = aep::database::get_group_chat_record(&state.db_pool, &group_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Group not found.".to_string())?;

    let payload = GroupChatPayload::from_record(record.clone());

    let signing_payload = AddGroupChatMembersData {
        group_id: group_id.clone(),
        member_ids: added_members.clone(),
        adder_id: adder_id.clone(),
    };
    let signing_bytes = bincode::serialize(&signing_payload).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&signing_bytes)
        .map_err(|e| e.to_string())?;

    let message = AepMessage::AddGroupChatMembers {
        group_id,
        member_ids: added_members,
        adder_id,
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

#[tauri::command]
pub async fn remove_group_dm_member(
    group_id: String,
    member_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Option<GroupChatPayload>, String> {
    with_state_async(state_container, move |state| {
        let group_id = group_id.clone();
        let member_id = member_id.clone();
        async move { remove_group_dm_member_internal(state, group_id, member_id).await }
    })
    .await
}

async fn remove_group_dm_member_internal(
    state: AppState,
    group_id: String,
    member_id: String,
) -> Result<Option<GroupChatPayload>, String> {
    let remover_id = state.identity.peer_id().to_base58();

    let removed = aep::database::remove_group_chat_member(&state.db_pool, &group_id, &member_id)
        .await
        .map_err(|e| e.to_string())?;

    if !removed {
        return Err("Member was not part of the group.".to_string());
    }

    let signing_payload = RemoveGroupChatMemberData {
        group_id: group_id.clone(),
        member_id: member_id.clone(),
        remover_id: remover_id.clone(),
    };
    let signing_bytes = bincode::serialize(&signing_payload).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&signing_bytes)
        .map_err(|e| e.to_string())?;

    let message = AepMessage::RemoveGroupChatMember {
        group_id: group_id.clone(),
        member_id,
        remover_id,
        signature: Some(signature),
    };
    let serialized = bincode::serialize(&message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized)
        .await
        .map_err(|e| e.to_string())?;

    let record = aep::database::get_group_chat_record(&state.db_pool, &group_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(record.map(GroupChatPayload::from_record))
}
