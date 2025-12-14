use aegis_protocol::AepMessage;
use aegis_shared_types::AppState;
use aegis_types::AegisError;
use sqlx::{Pool, Sqlite};
use std::fs;
use std::io;
use std::sync::{Once, OnceLock};

pub mod database;
pub mod user_service;
mod rkyv_utils;

mod handlers;
mod utils;

static AEP_INIT: Once = Once::new();
static PROTOCOL_CONFIG: OnceLock<Option<String>> = OnceLock::new();

fn load_protocol_config() -> Option<String> {
    let mut data_dir = dirs::data_dir()?;
    data_dir.push("Aegis");
    data_dir.push("aep");

    if let Err(err) = fs::create_dir_all(&data_dir) {
        eprintln!(
            "Failed to prepare AEP data directory {}: {}",
            data_dir.display(),
            err
        );
        return None;
    }

    let config_path = data_dir.join("protocol_config.json");
    match fs::read_to_string(&config_path) {
        Ok(contents) => Some(contents),
        Err(err) if err.kind() == io::ErrorKind::NotFound => {
            let default = "{}";
            match fs::write(&config_path, default) {
                Ok(()) => Some(default.to_string()),
                Err(write_err) => {
                    eprintln!(
                        "Failed to persist default AEP config {}: {}",
                        config_path.display(),
                        write_err
                    );
                    None
                }
            }
        }
        Err(err) => {
            eprintln!(
                "Failed to load AEP config {}: {}",
                config_path.display(),
                err
            );
            None
        }
    }
}

pub fn initialize_aep() {
    AEP_INIT.call_once(|| {
        let _ = PROTOCOL_CONFIG.set(load_protocol_config());
    });
}

pub fn protocol_config() -> Option<&'static str> {
    PROTOCOL_CONFIG.get().and_then(|config| config.as_deref())
}

pub async fn handle_aep_message(
    message: AepMessage,
    db_pool: &Pool<Sqlite>,
    state: AppState,
) -> Result<(), AegisError> {
    use handlers::*;

    match message {
        AepMessage::ChatMessage { .. }
        | AepMessage::MessageReaction { .. }
        | AepMessage::DeleteMessage { .. }
        | AepMessage::EditMessage { .. }
        | AepMessage::ReadReceipt { .. }
        | AepMessage::TypingIndicator { .. } => {
            chat::handle_chat_message_wrapper(message, db_pool, state).await
        }

        AepMessage::FileTransferRequest { .. }
        | AepMessage::FileTransferChunk { .. }
        | AepMessage::FileTransferComplete { .. }
        | AepMessage::FileTransferError { .. } => {
            files::handle_file_message_wrapper(message, state).await
        }

        AepMessage::CreateGroupChat { .. }
        | AepMessage::LeaveGroupChat { .. }
        | AepMessage::AddGroupChatMembers { .. }
        | AepMessage::RemoveGroupChatMember { .. }
        | AepMessage::RenameGroupChat { .. } => {
            groups::handle_group_message_wrapper(message, db_pool, state).await
        }

        AepMessage::CreateServer { .. }
        | AepMessage::JoinServer { .. }
        | AepMessage::DeleteServer { .. }
        | AepMessage::SendServerInvite { .. }
        | AepMessage::CreateChannel { .. }
        | AepMessage::DeleteChannel { .. } => {
            servers::handle_server_message_wrapper(message, db_pool).await
        }

        AepMessage::PeerDiscovery { .. }
        | AepMessage::PresenceUpdate { .. }
        | AepMessage::ProfileUpdate { .. } => {
            discovery::handle_discovery_message_wrapper(message, db_pool).await
        }

        AepMessage::CallSignal {
            sender_id,
            recipient_id,
            call_id,
            signal,
        } => voice::handle_call_signal(db_pool, sender_id, recipient_id, call_id, signal).await,

        AepMessage::FriendRequest {
            sender_id,
            target_id,
            signature,
        } => friendship::handle_friend_request(db_pool, sender_id, target_id, signature).await,

        AepMessage::FriendRequestResponse {
            sender_id,
            target_id,
            accepted,
            signature,
        } => {
            friendship::handle_friend_response(db_pool, sender_id, target_id, accepted, signature)
                .await
        }

        AepMessage::BlockUser {
            blocker_id,
            blocked_id,
            signature,
        } => friendship::handle_block_user(db_pool, blocker_id, blocked_id, signature).await,

        AepMessage::UnblockUser {
            unblocker_id,
            unblocked_id,
            signature,
        } => friendship::handle_unblock_user(db_pool, unblocker_id, unblocked_id, signature).await,

        AepMessage::RemoveFriendship {
            remover_id,
            removed_id,
            signature,
        } => friendship::handle_remove_friendship(db_pool, remover_id, removed_id, signature).await,

        // --- Ignored / Handled Elsewhere ---
        AepMessage::CollaborationUpdate { .. } => Ok(()),

        AepMessage::EncryptedChatMessage { .. }
        | AepMessage::PrekeyBundle { .. }
        | AepMessage::GroupKeyUpdate { .. }
        | AepMessage::EncryptedGroupMessage { .. } => Ok(()),
    }
}