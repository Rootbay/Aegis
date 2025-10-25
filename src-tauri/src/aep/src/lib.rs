
use sqlx::{Pool, Sqlite};
use aegis_shared_types::{AppState, IncomingFile};
use std::path::Path;
use aegis_protocol::{AepMessage, ChatMessageData, PeerDiscoveryData, PresenceUpdateData, FriendRequestData, FriendRequestResponseData, BlockUserData, UnblockUserData, RemoveFriendshipData, CreateServerData, JoinServerData, CreateChannelData, DeleteChannelData, DeleteServerData, SendServerInviteData};
use aegis_types::AegisError;
use libp2p::identity::PublicKey;
use aegis_core::services;
use bs58;
use std::convert::TryInto;
use std::fs::{self, File};
use std::io::{self, Write};
use std::sync::{Once, OnceLock};

const MAX_FILE_SIZE_BYTES: u64 = 1_073_741_824; // 1 GiB
const MAX_INFLIGHT_FILE_BYTES: u64 = 536_870_912; // 512 MiB
const MAX_UNAPPROVED_BUFFER_BYTES: u64 = 8_388_608; // 8 MiB

fn sanitize_filename(input: &str) -> String {
    let candidate = Path::new(input)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file");

    let mut sanitized = String::with_capacity(candidate.len());
    for ch in candidate.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | ' ' | '(' | ')') {
            sanitized.push(ch);
        } else {
            sanitized.push('_');
        }
    }

    while sanitized.starts_with('.') || sanitized.starts_with('_') {
        sanitized.remove(0);
        if sanitized.is_empty() {
            break;
        }
    }

    sanitized.truncate(128);

    if sanitized.is_empty() || sanitized.chars().all(|c| c == '_' || c == '.') {
        format!("file-{}", chrono::Utc::now().timestamp())
    } else {
        sanitized
    }
}

pub mod database;
pub mod user_service;

static AEP_INIT: Once = Once::new();
static PROTOCOL_CONFIG: OnceLock<Option<String>> = OnceLock::new();

fn load_protocol_config() -> Option<String> {
    let mut data_dir = dirs::data_dir()?;
    data_dir.push("Aegis");
    data_dir.push("aep");

    if let Err(err) = fs::create_dir_all(&data_dir) {
        eprintln!("Failed to prepare AEP data directory {}: {}", data_dir.display(), err);
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

fn get_public_key_from_base58_str(pk_base58: &str) -> Result<PublicKey, AegisError> {
    let decoded_bytes = bs58::decode(pk_base58).into_vec().map_err(|e| AegisError::InvalidInput(format!("Invalid base58 decoding: {}", e)))?;
    PublicKey::from_protobuf_encoding(&decoded_bytes).map_err(|e| AegisError::InvalidInput(format!("Invalid public key bytes: {}", e)))
}

async fn fetch_public_key_for_user(db_pool: &Pool<Sqlite>, user_id: &str) -> Result<PublicKey, AegisError> {
    if let Some(user) = user_service::get_user(db_pool, user_id).await? {
        if let Some(pk_str) = user.public_key {
            get_public_key_from_base58_str(&pk_str)
        } else {
            Err(AegisError::InvalidInput(format!("Public key missing for user {}", user_id)))
        }
    } else {
        Err(AegisError::UserNotFound)
    }
}

pub async fn handle_aep_message(message: AepMessage, db_pool: &Pool<Sqlite>, state: AppState) -> Result<(), AegisError> {
    match message {
        AepMessage::ChatMessage { sender, content, channel_id, server_id, conversation_id, signature } => {
            let chat_message_data = ChatMessageData { sender: sender.clone(), content: content.clone(), channel_id: channel_id.clone(), server_id: server_id.clone(), conversation_id: conversation_id.clone() };
            let chat_message_bytes = bincode::serialize(&chat_message_data).map_err(|e| AegisError::Serialization(e))?;
            let public_key = fetch_public_key_for_user(db_pool, &sender).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&chat_message_bytes, &sig) {
                    eprintln!("Invalid signature for chat message from user: {}", sender);
                    return Err(AegisError::InvalidInput("Invalid signature for chat message.".to_string()));
                }
            } else {
                eprintln!("Missing signature for chat message from user: {}", sender);
                return Err(AegisError::InvalidInput("Missing signature for chat message.".to_string()));
            }

            println!("Received chat message from {}: {} (Channel: {:?}, Server: {:?})", sender, content, channel_id, server_id);
            let chat_id = if let Some(conversation_id) = conversation_id {
                conversation_id
            } else if let Some(channel_id) = channel_id {
                channel_id
            } else if let Some(server_id) = server_id {
                // If it's a server message but no specific channel, use server ID as chat ID
                server_id
            } else {
                // Assuming it's a DM if no channel or server ID is provided
                sender.clone() // Use sender ID as chat ID for DMs
            };

            let new_message = database::Message {
                id: uuid::Uuid::new_v4().to_string(),
                chat_id,
                sender_id: sender,
                content: content,
                timestamp: chrono::Utc::now(),
                read: false,
            };
            database::insert_message(db_pool, &new_message).await?;
        }
        AepMessage::EncryptedChatMessage { .. } => {
            // handled in bootstrap for E2EE flow
        }
        AepMessage::PrekeyBundle { .. } => {
            // handled in bootstrap for E2EE prekey distribution
        }
        AepMessage::GroupKeyUpdate { .. } => {
            // handled in bootstrap for E2EE group key distribution
        }
        AepMessage::EncryptedGroupMessage { .. } => {
            // handled in bootstrap for E2EE group message
        }
        AepMessage::PeerDiscovery { peer_id, address, signature } => {
            let peer_discovery_data = PeerDiscoveryData { peer_id: peer_id.clone(), address: address.clone() };
            let peer_discovery_bytes = bincode::serialize(&peer_discovery_data).map_err(|e| AegisError::Serialization(e))?;
            let public_key = fetch_public_key_for_user(db_pool, &peer_id).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&peer_discovery_bytes, &sig) {
                    eprintln!("Invalid signature for peer discovery from peer: {}", peer_id);
                    return Err(AegisError::InvalidInput("Invalid signature for peer discovery.".to_string()));
                }
            } else {
                eprintln!("Missing signature for peer discovery from peer: {}", peer_id);
                return Err(AegisError::InvalidInput("Missing signature for peer discovery.".to_string()));
            }
            println!("Discovered peer {} at {}", peer_id, address);
        }
        AepMessage::PresenceUpdate { user_id, is_online, signature } => {
            let presence_update_data = PresenceUpdateData { user_id: user_id.clone(), is_online };
            let presence_update_bytes = bincode::serialize(&presence_update_data).map_err(|e| AegisError::Serialization(e))?;
            let public_key = fetch_public_key_for_user(db_pool, &user_id).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&presence_update_bytes, &sig) {
                    eprintln!("Invalid signature for presence update from user: {}", user_id);
                    return Err(AegisError::InvalidInput("Invalid signature for presence update.".to_string()));
                }
            } else {
                eprintln!("Missing signature for presence update from user: {}", user_id);
                return Err(AegisError::InvalidInput("Missing signature for presence update.".to_string()));
            }
            println!("User {} is now {}", user_id, if is_online { "online" } else { "offline" });
            user_service::update_user_online_status(db_pool, &user_id, is_online).await?;
        }
        AepMessage::ProfileUpdate { user, signature } => {
            println!("Received profile update for user: {}", user.id);
            let public_key = match user.public_key.as_ref() {
                Some(pk_str) => {
                    let decoded_bytes = bs58::decode(pk_str).into_vec().map_err(|e| AegisError::InvalidInput(format!("Invalid base58 decoding: {}", e)))?;
                    PublicKey::from_protobuf_encoding(&decoded_bytes).map_err(|e| AegisError::InvalidInput(format!("Invalid public key bytes: {}", e)))?
                },
                None => return Err(AegisError::InvalidInput("Public key missing from profile update.".to_string())),
            };

            let user_data_bytes = bincode::serialize(&user).map_err(|e| AegisError::Serialization(e))?;

            if public_key.verify(&user_data_bytes, signature.as_ref().unwrap()) {
                user_service::insert_user(db_pool, &user).await?;
            } else {
                eprintln!("Invalid signature for profile update from user: {}", user.id);
                return Err(AegisError::InvalidInput("Invalid signature for profile update.".to_string()));
            }
        }
        AepMessage::FileTransferRequest { sender_id, recipient_id: _, file_name, file_size, encrypted_key, nonce } => {
            let map_key = format!("{}:{}", sender_id, file_name);
            let mut incoming_files = state.incoming_files.lock().await;
            if file_size > MAX_FILE_SIZE_BYTES {
                eprintln!("Rejecting file {} from {}: exceeds maximum size", file_name, sender_id);
                return Ok(());
            }
            let safe_name = sanitize_filename(&file_name);
            let incoming_file = IncomingFile {
                name: file_name.clone(),
                size: file_size,
                received_chunks: std::collections::HashMap::new(),
                key: encrypted_key,
                nonce,
                sender_id: sender_id.clone(),
                accepted: false,
            };
            incoming_files.insert(map_key, incoming_file);
            println!("Started receiving file {} from {}", safe_name, sender_id);
        }
        AepMessage::FileTransferChunk { sender_id, recipient_id: _, file_name, chunk_index, data } => {
            let map_key = format!("{}:{}", sender_id, file_name);
            let mut incoming_files = state.incoming_files.lock().await;
            if let Some(incoming_file) = incoming_files.get_mut(&map_key) {
                let chunk_len = data.len() as u64;
                let existing_len = incoming_file
                    .received_chunks
                    .get(&chunk_index)
                    .map(|chunk| chunk.len() as u64)
                    .unwrap_or(0);
                let current_total: u64 = incoming_file
                    .received_chunks
                    .values()
                    .map(|chunk| chunk.len() as u64)
                    .sum();
                let adjusted_total = current_total.saturating_sub(existing_len);
                let new_total = adjusted_total.saturating_add(chunk_len);
                if new_total > incoming_file.size {
                    incoming_files.remove(&map_key);
                    eprintln!("Dropping transfer {} from {}: exceeded advertised size", file_name, sender_id);
                    return Ok(());
                }
                let inflight_limit = MAX_INFLIGHT_FILE_BYTES.min(incoming_file.size);
                if new_total > inflight_limit {
                    incoming_files.remove(&map_key);
                    eprintln!("Dropping transfer {} from {}: exceeds inflight buffer limit", file_name, sender_id);
                    return Ok(());
                }
                if !incoming_file.accepted {
                    let unapproved_limit = MAX_UNAPPROVED_BUFFER_BYTES.min(inflight_limit);
                    if new_total > unapproved_limit {
                        incoming_files.remove(&map_key);
                        eprintln!("Dropping transfer {} from {}: awaiting approval", file_name, sender_id);
                        return Ok(());
                    }
                }
                incoming_file.received_chunks.insert(chunk_index, data);
            } else {
                eprintln!("Received chunk {} for unknown transfer {} from {}", chunk_index, file_name, sender_id);
            }
        },
        AepMessage::FileTransferComplete { sender_id, recipient_id: _, file_name } => {
            let map_key = format!("{}:{}", sender_id, file_name);
            let incoming_file = {
                let mut incoming_files = state.incoming_files.lock().await;
                incoming_files.remove(&map_key)
            };

            if let Some(incoming_file) = incoming_file {
                let safe_name = sanitize_filename(&incoming_file.name);
                if !incoming_file.accepted {
                    eprintln!(
                        "File transfer {} from {} completed but was not approved locally",
                        file_name, sender_id
                    );
                    return Ok(());
                }

                let key: [u8; 32] = incoming_file
                    .key
                    .as_slice()
                    .try_into()
                    .map_err(|_| AegisError::InvalidInput("Invalid symmetric key length".into()))?;
                let nonce: [u8; 12] = incoming_file
                    .nonce
                    .as_slice()
                    .try_into()
                    .map_err(|_| AegisError::InvalidInput("Invalid nonce length".into()))?;

                let mut ordered_chunks: Vec<_> = incoming_file.received_chunks.into_iter().collect();
                ordered_chunks.sort_by_key(|(idx, _)| *idx);

                let mut plaintext = Vec::new();
                for (idx, chunk) in ordered_chunks {
                    let decrypted = services::decrypt_file_chunk(&chunk, &key, &nonce)
                        .map_err(|e| AegisError::Internal(format!(
                            "Failed to decrypt chunk {} for file {}: {}",
                            idx, file_name, e
                        )))?;
                    plaintext.extend_from_slice(&decrypted);
                }

                if plaintext.len() as u64 != incoming_file.size {
                    eprintln!(
                        "Reconstructed file {} from {} has size {} but expected {}",
                        file_name,
                        sender_id,
                        plaintext.len(),
                        incoming_file.size
                    );
                }

                let mut target_dir = dirs::data_dir()
                    .ok_or_else(|| {
                        AegisError::Internal("Unable to determine data directory for received files".into())
                    })?;
                target_dir.push("Aegis");
                target_dir.push("received_files");
                fs::create_dir_all(&target_dir).map_err(|e| {
                    AegisError::Internal(format!(
                        "Failed to prepare receive directory {}: {}",
                        target_dir.display(),
                        e
                    ))
                })?;

                let final_path = target_dir.join(&safe_name);
                let mut outfile = File::create(&final_path).map_err(|e| {
                    AegisError::Internal(format!(
                        "Failed to create file {}: {}",
                        final_path.display(),
                        e
                    ))
                })?;
                outfile.write_all(&plaintext).map_err(|e| {
                    AegisError::Internal(format!(
                        "Failed to write file {}: {}",
                        final_path.display(),
                        e
                    ))
                })?;
                println!(
                    "Saved received file {} from {} to {}",
                    safe_name,
                    sender_id,
                    final_path.display()
                );
            } else {
                eprintln!(
                    "Received completion message for unknown transfer {} from {}",
                    file_name,
                    sender_id
                );
            }
        }
        AepMessage::FileTransferError { sender_id, recipient_id: _, file_name, error } => {
            let map_key = format!("{}:{}", sender_id, file_name);
            let mut incoming_files = state.incoming_files.lock().await;
            incoming_files.remove(&map_key);
            eprintln!(
                "File transfer error for file {} from {}: {}",
                file_name,
                sender_id,
                error
            );
        },
        AepMessage::FriendRequest { sender_id, target_id, signature } => {
            let friend_request_data = FriendRequestData { sender_id: sender_id.clone(), target_id: target_id.clone() };
            let friend_request_bytes = bincode::serialize(&friend_request_data).map_err(|e| AegisError::Serialization(e))?;
            let public_key = fetch_public_key_for_user(db_pool, &sender_id).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&friend_request_bytes, &sig) {
                    eprintln!("Invalid signature for friend request from user: {}", sender_id);
                    return Err(AegisError::InvalidInput("Invalid signature for friend request.".to_string()));
                }
            } else {
                eprintln!("Missing signature for friend request from user: {}", sender_id);
                return Err(AegisError::InvalidInput("Missing signature for friend request.".to_string()));
            }

            println!("Received friend request from {} to {}", sender_id, target_id);
            // Logic to store the friend request in the database for the target user
            let now = chrono::Utc::now();
            let friendship = database::Friendship {
                id: uuid::Uuid::new_v4().to_string(),
                user_a_id: sender_id.clone(),
                user_b_id: target_id.clone(),
                status: database::FriendshipStatus::Pending.to_string(),
                created_at: now,
                updated_at: now,
            };
            database::insert_friendship(db_pool, &friendship).await?;
        }
        AepMessage::FriendRequestResponse { sender_id, target_id, accepted, signature } => {
            let friend_request_response_data = FriendRequestResponseData { sender_id: sender_id.clone(), target_id: target_id.clone(), accepted };
            let friend_request_response_bytes = bincode::serialize(&friend_request_response_data).map_err(|e| AegisError::Serialization(e))?;
            let public_key = fetch_public_key_for_user(db_pool, &sender_id).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&friend_request_response_bytes, &sig) {
                    eprintln!("Invalid signature for friend request response from user: {}", sender_id);
                    return Err(AegisError::InvalidInput("Invalid signature for friend request response.".to_string()));
                }
            } else {
                eprintln!("Missing signature for friend request response from user: {}", sender_id);
                return Err(AegisError::InvalidInput("Missing signature for friend request response.".to_string()));
            }

            println!("Received friend request response from {} to {}: Accepted = {}", sender_id, target_id, accepted);
            // Logic to update the friendship status in the database
            if accepted {
                if let Some(friendship) = database::get_friendship(db_pool, &sender_id, &target_id).await? {
                    database::update_friendship_status(db_pool, &friendship.id, database::FriendshipStatus::Accepted).await?;
                }
            } else {
                if let Some(friendship) = database::get_friendship(db_pool, &sender_id, &target_id).await? {
                    database::delete_friendship(db_pool, &friendship.id).await?;
                }
            }
        }
        AepMessage::BlockUser { blocker_id, blocked_id, signature } => {
            let block_user_data = BlockUserData { blocker_id: blocker_id.clone(), blocked_id: blocked_id.clone() };
            let block_user_bytes = bincode::serialize(&block_user_data).map_err(|e| AegisError::Serialization(e))?;
            let public_key = fetch_public_key_for_user(db_pool, &blocker_id).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&block_user_bytes, &sig) {
                    eprintln!("Invalid signature for block user message from user: {}", blocker_id);
                    return Err(AegisError::InvalidInput("Invalid signature for block user message.".to_string()));
                }
            } else {
                eprintln!("Missing signature for block user message from user: {}", blocker_id);
                return Err(AegisError::InvalidInput("Missing signature for block user message.".to_string()));
            }

            println!("Received block user message: {} blocked {}", blocker_id, blocked_id);
            let now = chrono::Utc::now();
            if let Some(friendship) = database::get_friendship(db_pool, &blocker_id, &blocked_id).await? {
                let new_status = if friendship.user_a_id == blocker_id {
                    database::FriendshipStatus::BlockedByA
                } else {
                    database::FriendshipStatus::BlockedByB
                };
                database::update_friendship_status(db_pool, &friendship.id, new_status).await?;
            } else {
                let friendship = database::Friendship {
                    id: uuid::Uuid::new_v4().to_string(),
                    user_a_id: blocker_id.clone(),
                    user_b_id: blocked_id.clone(),
                    status: database::FriendshipStatus::BlockedByA.to_string(), // Assuming blocker_id is user_a
                    created_at: now,
                    updated_at: now,
                };
                database::insert_friendship(db_pool, &friendship).await?;
            }
        }
        AepMessage::UnblockUser { unblocker_id, unblocked_id, signature } => {
            let unblock_user_data = UnblockUserData { unblocker_id: unblocker_id.clone(), unblocked_id: unblocked_id.clone() };
            let unblock_user_bytes = bincode::serialize(&unblock_user_data).map_err(|e| AegisError::Serialization(e))?;
            let public_key = fetch_public_key_for_user(db_pool, &unblocker_id).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&unblock_user_bytes, &sig) {
                    eprintln!("Invalid signature for unblock user message from user: {}", unblocker_id);
                    return Err(AegisError::InvalidInput("Invalid signature for unblock user message.".to_string()));
                }
            } else {
                eprintln!("Missing signature for unblock user message from user: {}", unblocker_id);
                return Err(AegisError::InvalidInput("Missing signature for unblock user message.".to_string()));
            }

            println!("Received unblock user message: {} unblocked {}", unblocker_id, unblocked_id);
            if let Some(friendship) = database::get_friendship(db_pool, &unblocker_id, &unblocked_id).await? {
                database::delete_friendship(db_pool, &friendship.id).await?;
            }
        }
        AepMessage::RemoveFriendship { remover_id, removed_id, signature } => {
            let remove_friendship_data = RemoveFriendshipData { remover_id: remover_id.clone(), removed_id: removed_id.clone() };
            let remove_friendship_bytes = bincode::serialize(&remove_friendship_data).map_err(|e| AegisError::Serialization(e))?;
            let public_key = fetch_public_key_for_user(db_pool, &remover_id).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&remove_friendship_bytes, &sig) {
                    eprintln!("Invalid signature for remove friendship message from user: {}", remover_id);
                    return Err(AegisError::InvalidInput("Invalid signature for remove friendship message.".to_string()));
                }
            } else {
                eprintln!("Missing signature for remove friendship message from user: {}", remover_id);
                return Err(AegisError::InvalidInput("Missing signature for remove friendship message.".to_string()));
            }

            println!("Received remove friendship message: {} removed {}", remover_id, removed_id);
            if let Some(friendship) = database::get_friendship(db_pool, &remover_id, &removed_id).await? {
                database::delete_friendship(db_pool, &friendship.id).await?;
            }
        }
        AepMessage::CreateServer { server, signature } => {
            let create_server_data = CreateServerData { server: server.clone() };
            let create_server_bytes = bincode::serialize(&create_server_data).map_err(|e| AegisError::Serialization(e))?;
            let public_key = fetch_public_key_for_user(db_pool, &server.owner_id).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&create_server_bytes, &sig) {
                    eprintln!("Invalid signature for create server message from user: {}", server.owner_id);
                    return Err(AegisError::InvalidInput("Invalid signature for create server message.".to_string()));
                }
            } else {
                eprintln!("Missing signature for create server message from user: {}", server.owner_id);
                return Err(AegisError::InvalidInput("Missing signature for create server message.".to_string()));
            }

            println!("Received create server message for server: {}", server.name);
            database::insert_server(db_pool, &server).await?;
            database::add_server_member(db_pool, &server.id, &server.owner_id).await?;
            let default_channel = database::Channel {
                id: uuid::Uuid::new_v4().to_string(),
                server_id: server.id.clone(),
                name: "general".to_string(),
                channel_type: "text".to_string(),
                private: false,
            };
            database::insert_channel(db_pool, &default_channel).await?;
        }
        AepMessage::JoinServer { server_id, user_id, signature } => {
            let join_server_data = JoinServerData { server_id: server_id.clone(), user_id: user_id.clone() };
            let join_server_bytes = bincode::serialize(&join_server_data).map_err(|e| AegisError::Serialization(e))?;
            let public_key = fetch_public_key_for_user(db_pool, &user_id).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&join_server_bytes, &sig) {
                    eprintln!("Invalid signature for join server message from user: {}", user_id);
                    return Err(AegisError::InvalidInput("Invalid signature for join server message.".to_string()));
                }
            } else {
                eprintln!("Missing signature for join server message from user: {}", user_id);
                return Err(AegisError::InvalidInput("Missing signature for join server message.".to_string()));
            }

            println!("Received join server message: user {} joining server {}", user_id, server_id);
            database::add_server_member(db_pool, &server_id, &user_id).await?;
        }
        AepMessage::CreateChannel { channel, signature } => {
            let create_channel_data = CreateChannelData { channel: channel.clone() };
            let create_channel_bytes = bincode::serialize(&create_channel_data).map_err(|e| AegisError::Serialization(e))?;

            // Authorize via server owner's key
            let server = database::get_server_by_id(db_pool, &channel.server_id).await?;
            let public_key = fetch_public_key_for_user(db_pool, &server.owner_id).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&create_channel_bytes, &sig) {
                    eprintln!("Invalid signature for create channel (server: {})", channel.server_id);
                    return Err(AegisError::InvalidInput("Invalid signature for create channel.".to_string()));
                }
            } else {
                eprintln!("Missing signature for create channel (server: {})", channel.server_id);
                return Err(AegisError::InvalidInput("Missing signature for create channel.".to_string()));
            }

            println!("Received create channel message for channel: {}", channel.name);
            database::insert_channel(db_pool, &channel).await?;
        }
        AepMessage::DeleteChannel { channel_id, signature } => {
            let delete_channel_data = DeleteChannelData { channel_id: channel_id.clone() };
            let delete_channel_bytes = bincode::serialize(&delete_channel_data).map_err(|e| AegisError::Serialization(e))?;

            // Reconstruct server context from channel to verify via server owner
            let channel = database::get_channel_by_id(db_pool, &channel_id).await?;
            let server = database::get_server_by_id(db_pool, &channel.server_id).await?;
            let public_key = fetch_public_key_for_user(db_pool, &server.owner_id).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&delete_channel_bytes, &sig) {
                    eprintln!("Invalid signature for delete channel (channel: {}, server: {})", channel_id, channel.server_id);
                    return Err(AegisError::InvalidInput("Invalid signature for delete channel.".to_string()));
                }
            } else {
                eprintln!("Missing signature for delete channel (channel: {})", channel_id);
                return Err(AegisError::InvalidInput("Missing signature for delete channel.".to_string()));
            }

            println!("Received delete channel message for channel: {}", channel_id);
            database::delete_channel(db_pool, &channel_id).await?;
        }
        AepMessage::DeleteServer { server_id, signature } => {
            let delete_server_data = DeleteServerData { server_id: server_id.clone() };
            let delete_server_bytes = bincode::serialize(&delete_server_data).map_err(|e| AegisError::Serialization(e))?;

            // Authorize via server owner's key
            let server = database::get_server_by_id(db_pool, &server_id).await?;
            let public_key = fetch_public_key_for_user(db_pool, &server.owner_id).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&delete_server_bytes, &sig) {
                    eprintln!("Invalid signature for delete server (server: {})", server_id);
                    return Err(AegisError::InvalidInput("Invalid signature for delete server.".to_string()));
                }
            } else {
                eprintln!("Missing signature for delete server (server: {})", server_id);
                return Err(AegisError::InvalidInput("Missing signature for delete server.".to_string()));
            }

            println!("Received delete server message for server: {}", server_id);
            database::delete_server(db_pool, &server_id).await?;
        }
        AepMessage::SendServerInvite { server_id, user_id, signature } => {
            let send_server_invite_data = SendServerInviteData { server_id: server_id.clone(), user_id: user_id.clone() };
            let send_server_invite_bytes = bincode::serialize(&send_server_invite_data).map_err(|e| AegisError::Serialization(e))?;

            // Authorize via server owner's key
            let server = database::get_server_by_id(db_pool, &server_id).await?;
            let public_key = fetch_public_key_for_user(db_pool, &server.owner_id).await?;

            if let Some(sig) = signature {
                if !public_key.verify(&send_server_invite_bytes, &sig) {
                    eprintln!("Invalid signature for server invite (server: {})", server_id);
                    return Err(AegisError::InvalidInput("Invalid signature for server invite.".to_string()));
                }
            } else {
                eprintln!("Missing signature for server invite (server: {})", server_id);
                return Err(AegisError::InvalidInput("Missing signature for server invite.".to_string()));
            }

            println!("Received server invite for user {} to server {}", user_id, server_id);
            database::add_server_member(db_pool, &server_id, &user_id).await?;
        }
    }
    Ok(())
}
