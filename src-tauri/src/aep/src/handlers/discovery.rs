use crate::rkyv_utils::serialize;
use crate::user_service;
use crate::utils::verify_signature;
use aegis_protocol::{AepMessage, PeerDiscoveryData, PresenceUpdateData};
use aegis_types::AegisError;
use bs58;
use libp2p::identity::PublicKey;
use sqlx::{Pool, Sqlite};

pub async fn handle_discovery_message_wrapper(
    message: AepMessage,
    db_pool: &Pool<Sqlite>,
) -> Result<(), AegisError> {
    match message {
        AepMessage::PeerDiscovery {
            peer_id,
            address,
            signature,
        } => {
            let data = PeerDiscoveryData {
                peer_id: peer_id.clone(),
                address: address.clone(),
            };
            let bytes = serialize(&data)?;
            verify_signature(db_pool, &peer_id, &bytes, signature.as_ref()).await?;

            println!("Discovered peer {} at {}", peer_id, address);
        }
        AepMessage::PresenceUpdate {
            user_id,
            is_online,
            status_message,
            location,
            signature,
        } => {
            let data = PresenceUpdateData {
                user_id: user_id.clone(),
                is_online,
                status_message: status_message.clone(),
                location: location.clone(),
            };
            let bytes = serialize(&data)?;
            verify_signature(db_pool, &user_id, &bytes, signature.as_ref()).await?;

            println!(
                "User {} is now {}",
                user_id,
                if is_online { "online" } else { "offline" }
            );
            user_service::update_user_presence(
                db_pool,
                &user_id,
                is_online,
                Some(status_message.clone()),
                Some(location.clone()),
            )
            .await?;
        }
        AepMessage::ProfileUpdate { user, signature } => {
            println!("Received profile update for user: {}", user.id);
            let public_key = match user.public_key.as_ref() {
                Some(pk_str) => {
                    let decoded_bytes = bs58::decode(pk_str).into_vec().map_err(|e| {
                        AegisError::InvalidInput(format!("Invalid base58 decoding: {}", e))
                    })?;
                    PublicKey::from_protobuf_encoding(&decoded_bytes).map_err(|e| {
                        AegisError::InvalidInput(format!("Invalid public key bytes: {}", e))
                    })?
                }
                None => {
                    return Err(AegisError::InvalidInput(
                        "Public key missing from profile update.".to_string(),
                    ))
                }
            };

            let user_data_bytes = serialize(&user).map_err(|e| AegisError::Serialization(e))?;

            let signature_bytes = signature.as_ref().ok_or_else(|| {
                 AegisError::InvalidInput("Missing signature for profile update.".to_string())
            })?;

            if public_key.verify(&user_data_bytes, signature_bytes) {
                user_service::insert_user(db_pool, &user).await?;
            } else {
                eprintln!(
                    "Invalid signature for profile update from user: {}",
                    user.id
                );
                return Err(AegisError::InvalidInput(
                    "Invalid signature for profile update.".to_string(),
                ));
            }
        }
        _ => {}
    }
    Ok(())
}