use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};

pub(crate) const ENVELOPE_VERSION: u8 = 1;
pub(crate) const ENVELOPE_ALGORITHM: &str = "chacha20poly1305";
const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;

#[derive(Debug, Clone)]
pub(crate) struct EnvelopeCipher {
    pub ciphertext: Vec<u8>,
    pub key: Vec<u8>,
    pub nonce: Vec<u8>,
}

impl EnvelopeCipher {
    fn validate_lengths(&self) -> Result<(), String> {
        if self.key.len() != KEY_LEN {
            return Err("Invalid key length".to_string());
        }
        if self.nonce.len() != NONCE_LEN {
            return Err("Invalid nonce length".to_string());
        }
        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct MessageEnvelope {
    version: u8,
    algorithm: String,
    nonce: String,
    key: String,
    ciphertext: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AttachmentEnvelope {
    version: u8,
    algorithm: String,
    nonce: String,
    key: String,
    ciphertext: String,
    original_size: u64,
}

#[derive(Debug, Clone)]
pub(crate) struct AttachmentPayload {
    pub cipher: EnvelopeCipher,
    pub original_size: u64,
}

pub(crate) fn encrypt_bytes(data: &[u8]) -> Result<EnvelopeCipher, String> {
    let mut key = [0u8; KEY_LEN];
    OsRng
        .try_fill_bytes(&mut key)
        .map_err(|e| format!("Failed to generate key: {e}"))?;
    let cipher = ChaCha20Poly1305::new_from_slice(&key)
        .map_err(|e| format!("Failed to initialise cipher: {e}"))?;

    let mut nonce = [0u8; NONCE_LEN];
    OsRng
        .try_fill_bytes(&mut nonce)
        .map_err(|e| format!("Failed to generate nonce: {e}"))?;

    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), data)
        .map_err(|e| format!("Encryption error: {e}"))?;

    Ok(EnvelopeCipher {
        ciphertext,
        key: key.to_vec(),
        nonce: nonce.to_vec(),
    })
}

pub(crate) fn decrypt_bytes(cipher: &EnvelopeCipher) -> Result<Vec<u8>, String> {
    cipher.validate_lengths()?;

    let cipher_impl = ChaCha20Poly1305::new_from_slice(&cipher.key)
        .map_err(|e| format!("Failed to initialise cipher: {e}"))?;

    cipher_impl
        .decrypt(Nonce::from_slice(&cipher.nonce), cipher.ciphertext.as_ref())
        .map_err(|_| "Failed to decrypt payload".to_string())
}

pub(crate) fn serialize_message_envelope(cipher: EnvelopeCipher) -> Result<String, String> {
    let envelope = MessageEnvelope {
        version: ENVELOPE_VERSION,
        algorithm: ENVELOPE_ALGORITHM.to_string(),
        nonce: BASE64.encode(&cipher.nonce),
        key: BASE64.encode(&cipher.key),
        ciphertext: BASE64.encode(&cipher.ciphertext),
    };

    serde_json::to_string(&envelope).map_err(|e| format!("Failed to serialize envelope: {e}"))
}

pub(crate) fn serialize_attachment_envelope(
    cipher: EnvelopeCipher,
    original_size: u64,
) -> Result<Vec<u8>, String> {
    let envelope = AttachmentEnvelope {
        version: ENVELOPE_VERSION,
        algorithm: ENVELOPE_ALGORITHM.to_string(),
        nonce: BASE64.encode(&cipher.nonce),
        key: BASE64.encode(&cipher.key),
        ciphertext: BASE64.encode(&cipher.ciphertext),
        original_size,
    };

    serde_json::to_vec(&envelope)
        .map_err(|e| format!("Failed to serialize attachment envelope: {e}"))
}

pub(crate) fn deserialize_message_envelope(
    content: &str,
) -> Result<Option<EnvelopeCipher>, String> {
    if content.trim().is_empty() {
        return Ok(None);
    }

    let envelope = match serde_json::from_str::<MessageEnvelope>(content) {
        Ok(env) if env.version == ENVELOPE_VERSION => env,
        Ok(_) => return Ok(None),
        Err(_) => return Ok(None),
    };

    let ciphertext = match BASE64.decode(envelope.ciphertext) {
        Ok(bytes) => bytes,
        Err(_) => return Ok(None),
    };
    let key = match BASE64.decode(envelope.key) {
        Ok(bytes) => bytes,
        Err(_) => return Ok(None),
    };
    let nonce = match BASE64.decode(envelope.nonce) {
        Ok(bytes) => bytes,
        Err(_) => return Ok(None),
    };

    Ok(Some(EnvelopeCipher {
        ciphertext,
        key,
        nonce,
    }))
}

pub(crate) fn deserialize_attachment_envelope(data: &[u8]) -> Option<AttachmentPayload> {
    let envelope = serde_json::from_slice::<AttachmentEnvelope>(data).ok()?;
    if envelope.version != ENVELOPE_VERSION {
        return None;
    }

    let cipher = EnvelopeCipher {
        ciphertext: BASE64.decode(envelope.ciphertext).ok()?,
        key: BASE64.decode(envelope.key).ok()?,
        nonce: BASE64.decode(envelope.nonce).ok()?,
    };

    Some(AttachmentPayload {
        cipher,
        original_size: envelope.original_size,
    })
}
