use tokio::sync::mpsc::Sender as TokioSender;

use aegis_protocol::AepMessage;
use aegis_shared_types::AppState;
use aep::user_service;
use crypto::identity::Identity;

use super::directories::AppDirectories;

pub(super) async fn initialize_identity_state(
    identity: &Identity,
    db_pool: &sqlx::Pool<sqlx::Sqlite>,
    directories: &AppDirectories,
    app_state: &AppState,
) -> Result<(), String> {
    let my_peer_id = identity.peer_id().to_base58();
    let my_pubkey_b58 = bs58::encode(identity.public_key_protobuf_bytes()).into_string();
    let anon_username = format!("anon-{}", &my_peer_id.chars().take(8).collect::<String>());

    let mut ensure_user = aegis_shared_types::User {
        id: my_peer_id.clone(),
        username: anon_username.clone(),
        avatar: String::new(),
        is_online: false,
        public_key: Some(my_pubkey_b58.clone()),
        bio: None,
        tag: None,
        status_message: None,
        location: None,
    };

    if let Ok(existing) = user_service::get_user(db_pool, &my_peer_id).await {
        match existing {
            Some(mut user) => {
                if user.public_key.as_ref() != Some(&my_pubkey_b58) {
                    user.public_key = Some(my_pubkey_b58.clone());
                    user_service::insert_user(db_pool, &user)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                ensure_user = user;
            }
            None => {
                user_service::insert_user(db_pool, &ensure_user)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    broadcast_profile(identity, &ensure_user, &app_state.network_tx).await?;
    broadcast_prekey_bundle(identity, directories, &app_state.network_tx).await?;

    Ok(())
}

async fn broadcast_profile(
    identity: &Identity,
    user: &aegis_shared_types::User,
    network_tx: &TokioSender<Vec<u8>>,
) -> Result<(), String> {
    let user_bytes = rkyv::to_bytes::<_, 1024>(user).map(|v| v.to_vec()).map_err(|e| e.to_string())?;
    let signature = identity
        .keypair()
        .sign(&user_bytes)
        .map_err(|e| e.to_string())?;
    let profile_msg = AepMessage::ProfileUpdate {
        user: user.clone(),
        signature: Some(signature),
    };
    let profile_msg_bytes = bincode::serialize(&profile_msg).map_err(|e| e.to_string())?;
    network_tx
        .send(profile_msg_bytes)
        .await
        .map_err(|e| e.to_string())
}

async fn broadcast_prekey_bundle(
    identity: &Identity,
    directories: &AppDirectories,
    network_tx: &TokioSender<Vec<u8>>,
) -> Result<(), String> {
    let e2ee_dir = directories.data_dir().join("e2ee");
    if !e2ee_dir.exists() {
        std::fs::create_dir_all(&e2ee_dir).map_err(|e| e.to_string())?;
    }
    let mgr_arc = e2ee::init_with_dir(&e2ee_dir);
    let bundle_bytes = {
        let mut mgr = mgr_arc.lock();
        let bundle = mgr.generate_prekey_bundle(8).map_err(|e| e.to_string())?;
        bincode::serialize(&bundle).map_err(|e| e.to_string())?
    };

    let signature = identity
        .keypair()
        .sign(&bundle_bytes)
        .map_err(|e| e.to_string())?;

    let message = AepMessage::PrekeyBundle {
        user_id: identity.peer_id().to_base58(),
        bundle: bundle_bytes,
        signature: Some(signature),
    };
    let bytes = bincode::serialize(&message).map_err(|e| e.to_string())?;
    network_tx.send(bytes).await.map_err(|e| e.to_string())
}
