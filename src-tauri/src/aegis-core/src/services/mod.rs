use aegis_protocol;
use aegis_shared_types::AppState;
use aes_gcm::aead::Aead;
use aes_gcm::KeyInit;
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::{Engine as _, engine::general_purpose};
use e2ee;
use libp2p::PeerId;
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use typenum::U12;

const CHUNK_SIZE: usize = 1024 * 1024;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileMetadata {
    pub name: String,
    pub size: u64,
}

pub fn generate_symmetric_key() -> ([u8; 32], [u8; 12]) {
    let mut key = [0u8; 32];
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut key);
    OsRng.fill_bytes(&mut nonce);
    (key, nonce)
}

pub fn encrypt_file_chunk(
    data: &[u8],
    key: &[u8; 32],
    nonce: &[u8; 12],
) -> Result<Vec<u8>, String> {
    let key = Key::<Aes256Gcm>::from(*key);
    let cipher = Aes256Gcm::new(&key);
    let nonce = Nonce::<U12>::from(*nonce);
    cipher.encrypt(&nonce, data).map_err(|e| e.to_string())
}

pub fn decrypt_file_chunk(
    data: &[u8],
    key: &[u8; 32],
    nonce: &[u8; 12],
) -> Result<Vec<u8>, String> {
    let key = Key::<Aes256Gcm>::from(*key);
    let cipher = Aes256Gcm::new(&key);
    let nonce = Nonce::<U12>::from(*nonce);
    cipher.decrypt(&nonce, data).map_err(|e| e.to_string())
}

pub async fn send_file(
    state: AppState,
    file_path: &str,
    _recipient_peer_id: PeerId,
    request_message_bytes: Vec<u8>,
    chunk_message_bytes: Vec<u8>,
    complete_message_bytes: Vec<u8>,
) -> Result<(), String> {
    let path = Path::new(file_path);
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let _file_name = path.file_name().unwrap().to_str().unwrap().to_string();
    let _file_size = file.metadata().map_err(|e| e.to_string())?.len();

    let (key, nonce) = generate_symmetric_key();

    let key_b64 = general_purpose::STANDARD.encode(&key);

    let e2ee_mgr = e2ee::init_global_manager();
    let mut mgr = e2ee_mgr.lock().await;
    let encrypted_packet = mgr.encrypt_for(&_recipient_peer_id.to_base58(), key_b64.as_bytes())
        .map_err(|e| format!("Failed to encrypt symmetric key: {}", e))?;
    let encrypted_key_bytes = bincode::serialize(&encrypted_packet)
        .map_err(|e| format!("Failed to serialize encrypted key: {}", e))?;

    let mut request_message: aegis_protocol::AepMessage = bincode::deserialize(&request_message_bytes)
        .map_err(|e| format!("Failed to deserialize request message: {}", e))?;
    if let aegis_protocol::AepMessage::FileTransferRequest { ref mut encrypted_key, ref mut nonce, .. } = request_message {
        *encrypted_key = encrypted_key_bytes;
        *nonce = nonce.to_vec();
    } else {
        return Err("Invalid request message type".to_string());
    }
    let updated_request_bytes = bincode::serialize(&request_message)
        .map_err(|e| format!("Failed to serialize updated request message: {}", e))?;

    state
        .network_tx
        .send(updated_request_bytes)
        .await
        .map_err(|e| e.to_string())?;

    let mut _chunk_index = 0;
    let mut buffer = vec![0; CHUNK_SIZE];
    loop {
        let bytes_read = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if bytes_read == 0 {
            break;
        }

        let chunk_data = &buffer[..bytes_read];
        let _encrypted_chunk = encrypt_file_chunk(chunk_data, &key, &nonce)?;

        state
            .network_tx
            .send(chunk_message_bytes.clone())
            .await
            .map_err(|e| e.to_string())?;

        _chunk_index += 1;
    }

    state
        .network_tx
        .send(complete_message_bytes)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
