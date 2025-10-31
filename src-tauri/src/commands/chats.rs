use crate::commands::state::AppStateContainer;
use aegis_protocol::{
    AddGroupChatMembersData,
    AepMessage,
    CreateGroupChatData,
    LeaveGroupChatData,
    RemoveGroupChatMemberData,
    RenameGroupChatData,
};
use aep::database::{self, GroupChat, GroupChatMember, GroupChatRecord};
use chrono::Utc;
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
pub struct GroupChatPayload {
    pub id: String,
    pub name: Option<String>,
    pub owner_id: String,
    pub created_at: String,
    pub member_ids: Vec<String>,
}

fn normalize_group_name(name: Option<String>, group_id: &str) -> Option<String> {
    name.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
    .or_else(|| {
        Some(format!(
            "Group {}",
            &group_id.chars().take(8).collect::<String>()
        ))
    })
}

#[tauri::command]
pub async fn create_group_dm(
    member_ids: Vec<String>,
    name: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<GroupChatPayload, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();

    let creator_id = state.identity.peer_id().to_base58();

    let mut participants = Vec::with_capacity(member_ids.len() + 1);
    participants.push(creator_id.clone());
    for member_id in member_ids {
        if member_id == creator_id {
            continue;
        }
        if !participants.iter().any(|existing| existing == &member_id) {
            participants.push(member_id);
        }
    }

    if participants.len() < 2 {
        return Err("Please select at least one additional member.".to_string());
    }

    let group_id = Uuid::new_v4().to_string();
    let created_at = Utc::now();
    let normalized_name = normalize_group_name(name, &group_id);

    let chat = GroupChat {
        id: group_id.clone(),
        name: normalized_name.clone(),
        owner_id: creator_id.clone(),
        created_at,
    };

    let members: Vec<GroupChatMember> = participants
        .iter()
        .map(|member_id| GroupChatMember {
            group_chat_id: group_id.clone(),
            user_id: member_id.clone(),
            added_at: created_at,
        })
        .collect();

    database::upsert_group_chat(&state.db_pool, &chat, &members)
        .await
        .map_err(|e| e.to_string())?;

    let payload = GroupChatPayload {
        id: chat.id.clone(),
        name: chat.name.clone(),
        owner_id: chat.owner_id.clone(),
        created_at: chat.created_at.to_rfc3339(),
        member_ids: participants.clone(),
    };

    let signing_payload = CreateGroupChatData {
        group_id: chat.id.clone(),
        name: chat.name.clone(),
        creator_id: chat.owner_id.clone(),
        member_ids: participants.clone(),
        created_at: chat.created_at,
    };
    let signing_bytes = bincode::serialize(&signing_payload).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&signing_bytes)
        .map_err(|e| e.to_string())?;

    let message = AepMessage::CreateGroupChat {
        group_id: chat.id.clone(),
        name: chat.name.clone(),
        creator_id: chat.owner_id.clone(),
        member_ids: participants,
        created_at: chat.created_at,
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

fn map_record_to_payload(record: GroupChatRecord) -> GroupChatPayload {
    GroupChatPayload {
        id: record.chat.id,
        name: record.chat.name,
        owner_id: record.chat.owner_id,
        created_at: record.chat.created_at.to_rfc3339(),
        member_ids: record.member_ids,
    }
}

#[tauri::command]
pub async fn get_group_chats(
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<GroupChatPayload>, String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();

    let current_user_id = state.identity.peer_id().to_base58();
    let records = database::get_group_chats_for_user(&state.db_pool, &current_user_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(records.into_iter().map(map_record_to_payload).collect())
}

#[tauri::command]
pub async fn leave_group_dm(
    group_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();

    let user_id = state.identity.peer_id().to_base58();

    let removed = database::remove_group_chat_member(&state.db_pool, &group_id, &user_id)
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
        .map_err(|e| e.to_string())?;

    Ok(())
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

    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();

    let adder_id = state.identity.peer_id().to_base58();

    let added_members = database::add_group_chat_members(
        &state.db_pool,
        &group_id,
        &member_ids,
    )
    .await
    .map_err(|e| e.to_string())?;

    if added_members.is_empty() {
        return Err("No new members were added.".to_string());
    }

    let record = database::get_group_chat_record(&state.db_pool, &group_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Group not found.".to_string())?;

    let payload = map_record_to_payload(record.clone());

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
    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();

    let remover_id = state.identity.peer_id().to_base58();

    let removed = database::remove_group_chat_member(&state.db_pool, &group_id, &member_id)
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

    let record = database::get_group_chat_record(&state.db_pool, &group_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(record.map(map_record_to_payload))
}

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

    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();

    let updater_id = state.identity.peer_id().to_base58();

    let is_member = database::is_group_chat_member(&state.db_pool, &group_id, &updater_id)
        .await
        .map_err(|e| e.to_string())?;

    if !is_member {
        return Err("You are not a member of this group.".to_string());
    }

    let normalized_name = normalize_group_name(Some(trimmed_name), &group_id);

    database::update_group_chat_name(&state.db_pool, &group_id, normalized_name.clone())
        .await
        .map_err(|e| e.to_string())?;

    let record = database::get_group_chat_record(&state.db_pool, &group_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Group not found.".to_string())?;

    let payload = map_record_to_payload(record);

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
