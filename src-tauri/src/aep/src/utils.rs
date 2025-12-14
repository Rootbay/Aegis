use crate::{user_service, AegisError};
use bs58;
use libp2p::identity::PublicKey;
use sqlx::{Pool, Sqlite};
use std::path::Path;

pub fn sanitize_filename(input: &str) -> String {
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

pub fn get_public_key_from_base58_str(pk_base58: &str) -> Result<PublicKey, AegisError> {
    let decoded_bytes = bs58::decode(pk_base58)
        .into_vec()
        .map_err(|e| AegisError::InvalidInput(format!("Invalid base58 decoding: {}", e)))?;
    PublicKey::from_protobuf_encoding(&decoded_bytes)
        .map_err(|e| AegisError::InvalidInput(format!("Invalid public key bytes: {}", e)))
}

pub async fn fetch_public_key_for_user(
    db_pool: &Pool<Sqlite>,
    user_id: &str,
) -> Result<PublicKey, AegisError> {
    if let Some(user) = user_service::get_user(db_pool, user_id).await? {
        if let Some(pk_str) = user.public_key {
            get_public_key_from_base58_str(&pk_str)
        } else {
            Err(AegisError::InvalidInput(format!(
                "Public key missing for user {}",
                user_id
            )))
        }
    } else {
        Err(AegisError::UserNotFound)
    }
}

pub async fn verify_signature(
    db_pool: &Pool<Sqlite>,
    user_id: &str,
    data_bytes: &[u8],
    signature: Option<&Vec<u8>>,
) -> Result<(), AegisError> {
    let public_key = fetch_public_key_for_user(db_pool, user_id).await?;
    
    let sig = signature.ok_or_else(|| {
        AegisError::InvalidInput(format!("Missing signature from user: {}", user_id))
    })?;

    if !public_key.verify(data_bytes, sig) {
        eprintln!("Invalid signature from user: {}", user_id);
        return Err(AegisError::InvalidInput("Invalid signature.".to_string()));
    }

    Ok(())
}