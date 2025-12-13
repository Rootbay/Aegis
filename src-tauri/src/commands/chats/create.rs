use crate::commands::state::{with_state_async, AppStateContainer};
use scu128::Scu128;
use aegis_protocol::{AepMessage, CreateGroupChatData};
use aegis_shared_types::AppState;
use aep::database::{self, GroupChat, GroupChatMember};
use chrono::Utc;
use tauri::State;

use super::helpers::{normalize_group_name, GroupChatPayload};

#[tauri::command]
pub async fn create_group_dm(
    member_ids: Vec<String>,
    name: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<GroupChatPayload, String> {
    with_state_async(state_container, move |state| {
        let member_ids = member_ids.clone();
        let name = name.clone();
        async move { create_group_dm_internal(state, member_ids, name).await }
    })
    .await
}

async fn create_group_dm_internal(
    state: AppState,
    member_ids: Vec<String>,
    name: Option<String>,
) -> Result<GroupChatPayload, String> {
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

    let group_id = Scu128::new().to_string();
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

    let payload = GroupChatPayload::from_chat(&chat, participants.clone());

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
