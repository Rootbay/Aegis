use tauri::State;

use crate::commands::state::{with_state_async, AppStateContainer};

use super::super::helpers::parse_optional_datetime;
use super::super::types::EncryptedDmPayload;

#[tauri::command]
pub async fn rotate_group_key(
    server_id: String,
    channel_id: Option<String>,
    epoch: u64,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    with_state_async(state_container, move |state| {
        let server_id = server_id.clone();
        let channel_id = channel_id.clone();
        async move {
            use rand::RngCore;

            let mut key = [0u8; 32];
            rand::rngs::OsRng.fill_bytes(&mut key);

            {
                let arc = e2ee::init_global_manager();
                let mut mgr = arc.lock();
                mgr.set_group_key(&server_id, &channel_id, epoch, &key);
            }

            let members = aep::database::get_server_members(&state.db_pool, &server_id)
                .await
                .map_err(|e| e.to_string())?;

            let mut slots = Vec::new();
            for member in members {
                if member.id == state.identity.peer_id().to_base58() {
                    continue;
                }

                let arc = e2ee::init_global_manager();
                let mut mgr = arc.lock();
                let pkt = mgr
                    .encrypt_for(&member.id, &key)
                    .map_err(|e| format!("E2EE encrypt error: {e}"))?;
                slots.push(aegis_protocol::EncryptedDmSlot {
                    recipient: member.id,
                    init: pkt.init,
                    enc_header: pkt.enc_header,
                    enc_content: pkt.enc_content,
                });
            }

            let issuer_id = state.identity.peer_id().to_base58();
            let payload =
                bincode::serialize(&(issuer_id.clone(), &server_id, &channel_id, epoch, &slots))
                    .map_err(|e| e.to_string())?;
            let signature = state
                .identity
                .keypair()
                .sign(&payload)
                .map_err(|e| e.to_string())?;

            let aep_msg = aegis_protocol::AepMessage::GroupKeyUpdate {
                server_id,
                channel_id,
                epoch,
                slots,
                signature: Some(signature),
            };
            let bytes = bincode::serialize(&aep_msg).map_err(|e| e.to_string())?;
            state
                .network_tx
                .send(bytes)
                .await
                .map_err(|e| e.to_string())
        }
    })
    .await
}

#[tauri::command]
pub async fn send_encrypted_group_message(
    server_id: String,
    channel_id: Option<String>,
    message: String,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    expires_at: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    with_state_async(state_container, move |state| {
        let server_id = server_id.clone();
        let channel_id = channel_id.clone();
        let message = message.clone();
        async move {
            let _ = parse_optional_datetime(expires_at)?;
            let payload = EncryptedDmPayload {
                content: message,
                attachments: Vec::new(),
                reply_to_message_id,
                reply_snapshot_author,
                reply_snapshot_snippet,
            };
            let serialized_payload = bincode::serialize(&payload).map_err(|e| e.to_string())?;

            let (epoch, nonce, ciphertext) = {
                let arc = e2ee::init_global_manager();
                let mgr = arc.lock();
                mgr.encrypt_group_message(&server_id, &channel_id, &serialized_payload)
                    .map_err(|e| format!("Group E2EE: {e}"))?
            };

            let payload = bincode::serialize(&(
                state.identity.peer_id().to_base58(),
                &server_id,
                &channel_id,
                epoch,
                &nonce,
                &ciphertext,
            ))
            .map_err(|e| e.to_string())?;
            let sig = state
                .identity
                .keypair()
                .sign(&payload)
                .map_err(|e| e.to_string())?;

            let msg = aegis_protocol::AepMessage::EncryptedGroupMessage {
                sender: state.identity.peer_id().to_base58(),
                server_id,
                channel_id,
                epoch,
                nonce,
                ciphertext,
                signature: Some(sig),
            };
            let bytes = bincode::serialize(&msg).map_err(|e| e.to_string())?;
            state
                .network_tx
                .send(bytes)
                .await
                .map_err(|e| e.to_string())
        }
    })
    .await
}
