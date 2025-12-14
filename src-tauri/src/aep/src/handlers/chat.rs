use crate::database::{self, messages::AttachmentWithData};
use crate::rkyv_utils::serialize;
use crate::utils::verify_signature;
use aegis_protocol::{
    AepMessage, ChatMessageData, DeleteMessageData, MessageDeletionScope, MessageEditData,
    MessageReactionData, ReactionAction,
};
use aegis_shared_types::AppState;
use aegis_types::AegisError;
use sqlx::{Pool, Sqlite};

pub async fn handle_chat_message_wrapper(
    message: AepMessage,
    db_pool: &Pool<Sqlite>,
    state: AppState,
) -> Result<(), AegisError> {
    match message {
        AepMessage::ChatMessage {
            id,
            timestamp,
            sender,
            content,
            channel_id,
            server_id,
            conversation_id,
            attachments,
            expires_at,
            reply_to_message_id,
            reply_snapshot_author,
            reply_snapshot_snippet,
            signature,
        } => {
            let data = ChatMessageData {
                id: id.clone(),
                timestamp: timestamp.clone(),
                sender: sender.clone(),
                content: content.clone(),
                channel_id: channel_id.clone(),
                server_id: server_id.clone(),
                conversation_id: conversation_id.clone(),
                attachments: attachments.clone(),
                expires_at,
                reply_to_message_id: reply_to_message_id.clone(),
                reply_snapshot_author: reply_snapshot_author.clone(),
                reply_snapshot_snippet: reply_snapshot_snippet.clone(),
            };
            let bytes = serialize(&data)?;
            verify_signature(db_pool, &sender, &bytes, signature.as_ref()).await?;

            println!(
                "Received chat message from {}: {} (Channel: {:?}, Server: {:?})",
                sender, content, channel_id, server_id
            );
            
            let chat_id = if let Some(conversation_id) = conversation_id {
                conversation_id
            } else if let Some(channel_id) = channel_id {
                channel_id
            } else if let Some(server_id) = server_id {
                server_id
            } else {
                sender.clone()
            };

            let mut attachments_for_db = Vec::new();
            let mut attachment_data = Vec::new();

            for attachment in &attachments {
                let data_len = attachment.data.len() as u64;
                let sanitized_size = if attachment.size == 0 {
                    data_len
                } else if attachment.size != data_len {
                    data_len
                } else {
                    attachment.size
                };

                let metadata = database::Attachment {
                    id: attachment.id.clone(),
                    message_id: id.clone(),
                    name: attachment.name.clone(),
                    content_type: attachment.content_type.clone(),
                    size: sanitized_size,
                };

                attachments_for_db.push(metadata.clone());
                attachment_data.push(AttachmentWithData {
                    metadata,
                    data: attachment.data.clone(),
                });
            }

            let new_message = database::Message {
                id,
                chat_id,
                sender_id: sender,
                content,
                timestamp,
                read: false,
                pinned: false,
                attachments: attachments_for_db,
                reactions: std::collections::HashMap::new(),
                reply_to_message_id,
                reply_snapshot_author,
                reply_snapshot_snippet,
                edited_at: None,
                edited_by: None,
                expires_at,
            };

            database::insert_message(db_pool, &new_message, &attachment_data).await?;
        }
        AepMessage::MessageReaction {
            message_id,
            chat_id,
            emoji,
            user_id,
            action,
            signature,
        } => {
            let data = MessageReactionData {
                message_id: message_id.clone(),
                chat_id: chat_id.clone(),
                emoji: emoji.clone(),
                user_id: user_id.clone(),
                action: action.clone(),
            };
            let bytes = serialize(&data)?;
            verify_signature(db_pool, &user_id, &bytes, signature.as_ref()).await?;

            match action {
                ReactionAction::Add => {
                    database::add_reaction_to_message(db_pool, &message_id, &user_id, &emoji)
                        .await?;
                }
                ReactionAction::Remove => {
                    database::remove_reaction_from_message(
                        db_pool,
                        &message_id,
                        &user_id,
                        &emoji,
                    )
                    .await?;
                }
            }
        }
        AepMessage::DeleteMessage {
            message_id,
            chat_id,
            initiator_id,
            scope,
            signature,
        } => {
            let data = DeleteMessageData {
                message_id: message_id.clone(),
                chat_id: chat_id.clone(),
                initiator_id: initiator_id.clone(),
                scope: scope.clone(),
            };
            let bytes = serialize(&data)?;
            verify_signature(db_pool, &initiator_id, &bytes, signature.as_ref()).await?;

            let my_id = state.identity.peer_id().to_base58();
            let should_apply = match &scope {
                MessageDeletionScope::Everyone => true,
                MessageDeletionScope::SpecificUsers { user_ids } => {
                    user_ids.iter().any(|id| id == &my_id)
                }
            };

            if !should_apply {
                return Ok(());
            }

            if let Some(metadata) =
                database::get_message_metadata(db_pool, &message_id).await?
            {
                if metadata.chat_id != chat_id {
                    eprintln!(
                        "DeleteMessage chat mismatch: expected {}, received {}",
                        metadata.chat_id, chat_id
                    );
                    return Err(AegisError::InvalidInput(
                        "DeleteMessage chat mismatch.".into(),
                    ));
                }
                if metadata.sender_id != initiator_id {
                    eprintln!(
                        "DeleteMessage sender mismatch for {}: initiator {} is not {}",
                        message_id, initiator_id, metadata.sender_id
                    );
                    return Err(AegisError::InvalidInput(
                        "DeleteMessage sender mismatch.".into(),
                    ));
                }
            }

            if let Err(err) = database::delete_message(db_pool, &message_id).await {
                if !matches!(err, sqlx::Error::RowNotFound) {
                    return Err(err.into());
                }
            }
        }
        AepMessage::EditMessage {
            message_id,
            chat_id,
            editor_id,
            new_content,
            edited_at,
            signature,
        } => {
            let data = MessageEditData {
                message_id: message_id.clone(),
                chat_id: chat_id.clone(),
                editor_id: editor_id.clone(),
                new_content: new_content.clone(),
                edited_at,
            };
            let bytes = serialize(&data)?;
            verify_signature(db_pool, &editor_id, &bytes, signature.as_ref()).await?;

            if let Some(metadata) =
                database::get_message_metadata(db_pool, &message_id).await?
            {
                if metadata.chat_id != chat_id {
                    eprintln!(
                        "EditMessage chat mismatch: expected {}, received {}",
                        metadata.chat_id, chat_id
                    );
                    return Err(AegisError::InvalidInput(
                        "EditMessage chat mismatch.".into(),
                    ));
                }
                if metadata.sender_id != editor_id {
                    eprintln!(
                        "EditMessage editor mismatch for {}: editor {} is not {}",
                        message_id, editor_id, metadata.sender_id
                    );
                    return Err(AegisError::InvalidInput(
                        "EditMessage editor mismatch.".into(),
                    ));
                }
            }

            database::update_message_content(
                db_pool,
                &message_id,
                &new_content,
                edited_at,
                &editor_id,
            )
            .await?;
        }
        _ => {}
    }
    Ok(())
}