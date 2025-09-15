pub mod identity;

use argon2::{
    password_hash::{
        rand_core::OsRng,
        SaltString
    },
    Argon2
};
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit},
    XChaCha20Poly1305,
    XNonce
};

pub fn encrypt(data: &[u8], password: &[u8]) -> Result<(Vec<u8>, SaltString, XNonce), Box<dyn std::error::Error>> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let mut key_bytes = [0u8; 32];
    argon2.hash_password_into(password, salt.as_ref().as_bytes(), &mut key_bytes).map_err(|e| e.to_string())?;

    let cipher = XChaCha20Poly1305::new(key_bytes.as_ref().into());
    let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher.encrypt(&nonce, data).map_err(|e| e.to_string())?;

    Ok((ciphertext, salt, nonce))
}

pub fn decrypt(ciphertext: &[u8], password: &[u8], salt: &SaltString, nonce: &XNonce) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let argon2 = Argon2::default();
    let mut key_bytes = [0u8; 32];
    argon2.hash_password_into(password, salt.as_ref().as_bytes(), &mut key_bytes).map_err(|e| e.to_string())?;

    let cipher = XChaCha20Poly1305::new(key_bytes.as_ref().into());
    let plaintext = cipher.decrypt(nonce, ciphertext).map_err(|e| e.to_string())?;

    Ok(plaintext)
}