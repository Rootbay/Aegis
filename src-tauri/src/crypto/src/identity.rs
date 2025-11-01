use argon2::password_hash::SaltString;
use chacha20poly1305::XNonce;
use libp2p::identity::{ed25519, Keypair};
use std::convert::TryInto;

#[derive(Debug, thiserror::Error)]
pub enum IdentityError {
    #[error("Failed to decode secret key from bytes: {0}")]
    Decoding(String),
}

#[derive(Clone)]
pub struct Identity {
    keypair: Keypair,
}

impl Identity {
    pub fn from_keypair(keypair: Keypair) -> Self {
        Self { keypair }
    }

    pub fn generate() -> Self {
        let keypair = Keypair::generate_ed25519();
        Self { keypair }
    }

    pub fn from_encrypted_secret(encrypted_secret: &[u8], password: &[u8]) -> Result<Self, IdentityError> {
        let (ciphertext, salt, nonce) = Self::unpack_encrypted_data(encrypted_secret)?;
        let mut decrypted_secret = crate::decrypt(&ciphertext, password, &salt, &nonce)
            .map_err(|e| IdentityError::Decoding(e.to_string()))?;
        let secret_key = ed25519::SecretKey::from_bytes(&mut decrypted_secret)
            .map_err(|e| IdentityError::Decoding(e.to_string()))?;
        let keypair = Keypair::Ed25519(ed25519::Keypair::from(secret_key));
        Ok(Self { keypair })
    }

    pub fn to_encrypted_secret(&self, password: &[u8]) -> Result<Vec<u8>, IdentityError> {
        let secret_bytes = self.to_secret_bytes().ok_or_else(|| IdentityError::Decoding("Could not get secret bytes".to_string()))?;
        let (ciphertext, salt, nonce) = crate::encrypt(&secret_bytes, password)
            .map_err(|e| IdentityError::Decoding(e.to_string()))?;
        Ok(Self::pack_encrypted_data(&ciphertext, &salt, &nonce))
    }

    fn pack_encrypted_data(ciphertext: &[u8], salt: &SaltString, nonce: &XNonce) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(salt.as_ref().as_bytes());
        data.extend_from_slice(nonce.as_ref());
        data.extend_from_slice(ciphertext);
        data
    }

    fn unpack_encrypted_data(data: &[u8]) -> Result<(Vec<u8>, SaltString, XNonce), IdentityError> {
        const SALT_LEN: usize = 22;
        const NONCE_LEN: usize = 24;
        const PREFIX_LEN: usize = SALT_LEN + NONCE_LEN;

        if data.len() < PREFIX_LEN {
            return Err(IdentityError::Decoding("Invalid encrypted data length".to_string()));
        }
        let salt = SaltString::from_b64(&String::from_utf8_lossy(&data[..SALT_LEN]))
            .map_err(|e| IdentityError::Decoding(e.to_string()))?;
        let nonce_bytes: [u8; NONCE_LEN] = data[SALT_LEN..PREFIX_LEN]
            .try_into()
            .map_err(|_| IdentityError::Decoding("Invalid nonce length".to_string()))?;
        let nonce: XNonce = nonce_bytes.into();
        let ciphertext = &data[PREFIX_LEN..];
        Ok((ciphertext.to_vec(), salt, nonce))
    }

    pub fn to_secret_bytes(&self) -> Option<Vec<u8>> {
        if let Keypair::Ed25519(pair) = &self.keypair {
            Some(pair.secret().as_ref().to_vec())
        }
        else {
            None
        }
    }

    pub fn keypair(&self) -> &Keypair {
        &self.keypair
    }

    pub fn peer_id(&self) -> libp2p::PeerId {
        self.keypair.public().to_peer_id()
    }

    /// Returns the libp2p PeerId (base58) derived from the public key
    pub fn peer_id_base58(&self) -> String {
        self.keypair.public().to_peer_id().to_base58()
    }

    /// Returns the public key in libp2p protobuf encoding (raw bytes)
    pub fn public_key_protobuf_bytes(&self) -> Vec<u8> {
        self.keypair.public().to_protobuf_encoding()
    }
}
