use crate::database;
use crate::rkyv_utils::serialize;
use crate::utils::verify_signature;
use aegis_protocol::{
    AepMessage, CreateChannelData, CreateServerData, DeleteChannelData, DeleteServerData,
    JoinServerData, SendServerInviteData,
};
use aegis_types::AegisError;
use scu128::Scu128;
use sqlx::{Pool, Sqlite};

pub async fn handle_server_message_wrapper(
    message: AepMessage,
    db_pool: &Pool<Sqlite>,
) -> Result<(), AegisError> {
    match message {
        AepMessage::CreateServer { server, signature } => {
            let data = CreateServerData {
                server: server.clone(),
            };
            let bytes = serialize(&data)?;
            verify_signature(db_pool, &server.owner_id, &bytes, signature.as_ref()).await?;

            println!("Received create server message for server: {}", server.name);
            database::insert_server(db_pool, &server).await?;
            database::add_server_member(db_pool, &server.id, &server.owner_id).await?;
            let default_channel = database::Channel {
                id: Scu128::new().to_string(),
                server_id: server.id.clone(),
                name: "general".to_string(),
                channel_type: "text".to_string(),
                private: false,
                category_id: None,
            };
            database::insert_channel(db_pool, &default_channel).await?;
        }
        AepMessage::JoinServer {
            server_id,
            user_id,
            signature,
        } => {
            let data = JoinServerData {
                server_id: server_id.clone(),
                user_id: user_id.clone(),
            };
            let bytes = serialize(&data)?;
            verify_signature(db_pool, &user_id, &bytes, signature.as_ref()).await?;

            println!(
                "Received join server message: user {} joining server {}",
                user_id, server_id
            );
            database::add_server_member(db_pool, &server_id, &user_id).await?;
        }
        AepMessage::CreateChannel { channel, signature } => {
            let data = CreateChannelData {
                channel: channel.clone(),
            };
            let bytes = serialize(&data)?;

            let server = database::get_server_by_id(db_pool, &channel.server_id).await?;
            verify_signature(db_pool, &server.owner_id, &bytes, signature.as_ref()).await
                .map_err(|_| AegisError::InvalidInput(
                    format!("Invalid signature for create channel (server: {})", channel.server_id)
                ))?;

            println!(
                "Received create channel message for channel: {}",
                channel.name
            );
            database::insert_channel(db_pool, &channel).await?;
        }
        AepMessage::DeleteChannel {
            channel_id,
            signature,
        } => {
            let data = DeleteChannelData {
                channel_id: channel_id.clone(),
            };
            let bytes = serialize(&data)?;

            let channel = database::get_channel_by_id(db_pool, &channel_id).await?;
            let server = database::get_server_by_id(db_pool, &channel.server_id).await?;
            
            verify_signature(db_pool, &server.owner_id, &bytes, signature.as_ref()).await
                .map_err(|_| AegisError::InvalidInput(
                    format!("Invalid signature for delete channel (channel: {})", channel_id)
                ))?;

            println!(
                "Received delete channel message for channel: {}",
                channel_id
            );
            database::delete_channel(db_pool, &channel_id).await?;
        }
        AepMessage::DeleteServer {
            server_id,
            signature,
        } => {
            let data = DeleteServerData {
                server_id: server_id.clone(),
            };
            let bytes = serialize(&data)?;

            let server = database::get_server_by_id(db_pool, &server_id).await?;
            verify_signature(db_pool, &server.owner_id, &bytes, signature.as_ref()).await
                .map_err(|_| AegisError::InvalidInput(
                    format!("Invalid signature for delete server (server: {})", server_id)
                ))?;

            println!("Received delete server message for server: {}", server_id);
            database::delete_server(db_pool, &server_id).await?;
        }
        AepMessage::SendServerInvite {
            server_id,
            user_id,
            signature,
        } => {
            let data = SendServerInviteData {
                server_id: server_id.clone(),
                user_id: user_id.clone(),
            };
            let bytes = serialize(&data)?;

            let server = database::get_server_by_id(db_pool, &server_id).await?;
            verify_signature(db_pool, &server.owner_id, &bytes, signature.as_ref()).await
                .map_err(|_| AegisError::InvalidInput(
                    format!("Invalid signature for server invite (server: {})", server_id)
                ))?;

            println!(
                "Received server invite for user {} to server {}",
                user_id, server_id
            );
            database::add_server_member(db_pool, &server_id, &user_id).await?;
        }
        _ => {}
    }
    Ok(())
}