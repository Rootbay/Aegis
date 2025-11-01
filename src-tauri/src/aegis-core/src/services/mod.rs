use aegis_shared_types::AppState;
use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::KeyInit;
use libp2p::PeerId;
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use typenum::U12;


const CHUNK_SIZE: usize = 1024 * 1024; // 1MB

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

pub fn encrypt_file_chunk(data: &[u8], key: &[u8; 32], nonce: &[u8; 12]) -> Result<Vec<u8>, String> {
    let key = Key::<Aes256Gcm>::from(*key);
    let cipher = Aes256Gcm::new(&key);
    let nonce = Nonce::<U12>::from(*nonce);
    cipher.encrypt(&nonce, data).map_err(|e| e.to_string())
}

pub fn decrypt_file_chunk(data: &[u8], key: &[u8; 32], nonce: &[u8; 12]) -> Result<Vec<u8>, String> {
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

    // For the purpose of this example, we will send the key unencrypted.
    // In a real application, this would be a major security vulnerability.
    let _encrypted_key = key.to_vec();

    state.network_tx.send(request_message_bytes).await.map_err(|e| e.to_string())?;

    let mut _chunk_index = 0;
    let mut buffer = vec![0; CHUNK_SIZE];
    loop {
        let bytes_read = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if bytes_read == 0 {
            break;
        }

        let chunk_data = &buffer[..bytes_read];
        let _encrypted_chunk = encrypt_file_chunk(chunk_data, &key, &nonce)?;

        state.network_tx.send(chunk_message_bytes.clone()).await.map_err(|e| e.to_string())?;

        _chunk_index += 1;
    }

    state.network_tx.send(complete_message_bytes).await.map_err(|e| e.to_string())?;

    Ok(())
}
