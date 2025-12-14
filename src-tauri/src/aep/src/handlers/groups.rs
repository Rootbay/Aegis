use crate::database;
use crate::rkyv_utils::serialize;
use crate::utils::verify_signature;
use aegis_protocol::{
    AddGroupChatMembersData, AepMessage, CreateGroupChatData, LeaveGroupChatData,
    RemoveGroupChatMemberData, RenameGroupChatData,
};
use aegis_shared_types::AppState;
use aegis_types::AegisError;
use sqlx::{Pool, Sqlite};

pub async fn handle_group_message_wrapper(
    message: AepMessage,
    db_pool: &Pool<Sqlite>,
    state: AppState,
) -> Result<(), AegisError> {
    match message {
        AepMessage::CreateGroupChat {
            group_id,
            name,
            creator_id,
            member_ids,
            created_at,
            signature,
        } => {
            let data = CreateGroupChatData {
                group_id: group_id.clone(),
                name: name.clone(),
                creator_id: creator_id.clone(),
                member_ids: member_ids.clone(),
                created_at: created_at.clone(),
            };
            let bytes = serialize(&data)?;
            verify_signature(db_pool, &creator_id, &bytes, signature.as_ref()).await?;

            let my_id = state.identity.peer_id().to_base58();
            if !member_ids.iter().any(|member| member == &my_id) {
                return Ok(());
            }

            let chat = database::GroupChat {
                id: group_id.clone(),
                name: name.clone(),
                owner_id: creator_id.clone(),
                created_at: created_at.clone(),
            };

            let members: Vec<database::GroupChatMember> = member_ids
                .iter()
                .map(|member_id| database::GroupChatMember {
                    group_chat_id: group_id.clone(),
                    user_id: member_id.clone(),
                    added_at: created_at.clone(),
                })
                .collect();

            database::upsert_group_chat(db_pool, &chat, &members).await?;
        }
        AepMessage::LeaveGroupChat {
            group_id,
            member_id,
            signature,
        } => {
            let data = LeaveGroupChatData {
                group_id: group_id.clone(),
                member_id: member_id.clone(),
            };
            let bytes = serialize(&data)?;
            verify_signature(db_pool, &member_id, &bytes, signature.as_ref()).await?;

            let removed =
                database::remove_group_chat_member(db_pool, &group_id, &member_id).await?;
            if !removed {
                eprintln!(
                    "Leave group chat message received but membership not found: group {} member {}",
                    group_id, member_id
                );
            }
        }
        AepMessage::AddGroupChatMembers {
            group_id,
            member_ids,
            adder_id,
            signature,
        } => {
            let data = AddGroupChatMembersData {
                group_id: group_id.clone(),
                member_ids: member_ids.clone(),
                adder_id: adder_id.clone(),
            };
            let bytes = serialize(&data)?;
            verify_signature(db_pool, &adder_id, &bytes, signature.as_ref()).await?;

            if !member_ids.is_empty() {
                database::add_group_chat_members(db_pool, &group_id, &member_ids).await?;
            }
        }
        AepMessage::RemoveGroupChatMember {
            group_id,
            member_id,
            remover_id,
            signature,
        } => {
            let data = RemoveGroupChatMemberData {
                group_id: group_id.clone(),
                member_id: member_id.clone(),
                remover_id: remover_id.clone(),
            };
            let bytes = serialize(&data)?;
            verify_signature(db_pool, &remover_id, &bytes, signature.as_ref()).await?;

            database::remove_group_chat_member(db_pool, &group_id, &member_id).await?;
        }
        AepMessage::RenameGroupChat {
            group_id,
            name,
            updater_id,
            signature,
        } => {
            let data = RenameGroupChatData {
                group_id: group_id.clone(),
                name: name.clone(),
                updater_id: updater_id.clone(),
            };
            let bytes = serialize(&data)?;
            verify_signature(db_pool, &updater_id, &bytes, signature.as_ref()).await?;

            database::update_group_chat_name(db_pool, &group_id, name).await?;
        }
        _ => {}
    }
    Ok(())
}