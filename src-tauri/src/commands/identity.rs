use argon2::password_hash::SaltString;
use bs58;
use chacha20poly1305::XNonce;
use crypto::identity::Identity;
use libp2p::identity::{ed25519, Keypair};
use std::fs;
use std::io::{Read, Write};
use tauri::{Manager, Runtime, State};

use crate::commands::state::{with_state, AppStateContainer};

#[tauri::command]
pub fn is_identity_created<R: Runtime>(app: tauri::AppHandle<R>) -> bool {
    let app_data_dir = match app.path().app_data_dir() {
        Ok(p) => p,
        Err(_) => return false,
    };
    if !app_data_dir.exists() {
        return false;
    }
    let identity_path = app_data_dir.join("identity.bin");
    identity_path.exists()
}

#[tauri::command]
pub async fn get_peer_id(state_container: State<'_, AppStateContainer>) -> Result<String, String> {
    with_state(state_container, |state| {
        Ok(state.identity.peer_id().to_base58())
    })
    .await
}

#[tauri::command]
pub async fn get_public_key(
    state_container: State<'_, AppStateContainer>,
) -> Result<String, String> {
    with_state(state_container, |state| {
        let pk_bytes = state.identity.public_key_protobuf_bytes();
        Ok(bs58::encode(pk_bytes).into_string())
    })
    .await
}

#[tauri::command]
pub async fn initialize_app<R: Runtime>(
    app: tauri::AppHandle<R>,
    password: &str,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    crate::bootstrap::initialize_app_state(app, password, state_container).await
}

#[tauri::command]
pub async fn unlock_identity<R: Runtime>(
    app: tauri::AppHandle<R>,
    password: &str,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    crate::bootstrap::initialize_app_state(app, password, state_container).await
}

// Helper used by initialization
pub(crate) fn get_or_create_identity<R: Runtime>(
    app: &tauri::AppHandle<R>,
    password: &str,
) -> Result<Identity, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
    }
    let identity_path = app_data_dir.join("identity.bin");
    let salt_path = app_data_dir.join("identity.salt");
    let nonce_path = app_data_dir.join("identity.nonce");

    if identity_path.exists() && salt_path.exists() && nonce_path.exists() {
        let mut encrypted_secret = Vec::new();
        fs::File::open(&identity_path)
            .map_err(|e| e.to_string())?
            .read_to_end(&mut encrypted_secret)
            .map_err(|e| e.to_string())?;

        let mut salt_bytes = Vec::new();
        fs::File::open(&salt_path)
            .map_err(|e| e.to_string())?
            .read_to_end(&mut salt_bytes)
            .map_err(|e| e.to_string())?;
        let salt = SaltString::from_b64(&String::from_utf8_lossy(&salt_bytes))
            .map_err(|e| e.to_string())?;

        let mut nonce_bytes = Vec::new();
        fs::File::open(&nonce_path)
            .map_err(|e| e.to_string())?
            .read_to_end(&mut nonce_bytes)
            .map_err(|e| e.to_string())?;
        let nonce = XNonce::clone_from_slice(&nonce_bytes);

        let decrypted_secret =
            crypto::decrypt(&encrypted_secret, password.as_bytes(), &salt, &nonce)
                .map_err(|e| format!("Failed to decrypt identity: {}", e))?;

        let secret_key = ed25519::SecretKey::from_bytes(&mut decrypted_secret.clone())
            .map_err(|e| e.to_string())?;
        let keypair = Keypair::Ed25519(ed25519::Keypair::from(secret_key));
        Ok(Identity::from_keypair(keypair))
    } else {
        let identity = Identity::generate();
        let secret = identity
            .to_secret_bytes()
            .ok_or_else(|| "Could not get secret bytes".to_string())?;

        let (encrypted_secret, salt, nonce) = crypto::encrypt(&secret, password.as_bytes())
            .map_err(|e| format!("Failed to encrypt identity: {}", e))?;

        fs::File::create(&identity_path)
            .map_err(|e| e.to_string())?
            .write_all(&encrypted_secret)
            .map_err(|e| e.to_string())?;
        fs::File::create(&salt_path)
            .map_err(|e| e.to_string())?
            .write_all(salt.as_ref().as_bytes())
            .map_err(|e| e.to_string())?;
        fs::File::create(&nonce_path)
            .map_err(|e| e.to_string())?
            .write_all(nonce.as_slice())
            .map_err(|e| e.to_string())?;

        Ok(identity)
    }
}
