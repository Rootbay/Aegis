use tokio::sync::mpsc::Sender as TokioSender;

use aegis_protocol::EncryptedDmSlot;
use crypto::identity::Identity;

pub(super) async fn broadcast_group_key_update(
    db_pool: &sqlx::Pool<sqlx::Sqlite>,
    identity: Identity,
    net_tx: &TokioSender<Vec<u8>>,
    server_id: &str,
    channel_id: &Option<String>,
) -> Result<(), String> {
    let issuer_id = identity.peer_id_base58();
    let members = aep::database::get_server_members(db_pool, server_id)
        .await
        .map_err(|e| e.to_string())?;
    let mut slots: Vec<EncryptedDmSlot> = Vec::new();

    let epoch = {
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock().await;
        let (epoch, key_bytes) = mgr.get_group_key(server_id, channel_id)
            .ok_or_else(|| "Missing group key for broadcast".to_string())?;

        for m in members {
            if m.id == issuer_id {
                continue;
            }
            if let Ok(pkt) = mgr.encrypt_for(&m.id, &key_bytes) {
                slots.push(EncryptedDmSlot {
                    recipient: m.id,
                    init: pkt.init,
                    enc_header: pkt.enc_header,
                    enc_content: pkt.enc_content,
                });
            }
        }
        epoch
    };

    let payload = bincode::serialize(&(issuer_id.clone(), server_id, channel_id, epoch, &slots)).map_err(|e| e.to_string())?;
    let signature = identity
        .keypair()
        .sign(&payload)
        .map_err(|e| e.to_string())?;

    let msg = aegis_protocol::AepMessage::GroupKeyUpdate {
        issuer_id,
        server_id: server_id.to_string(),
        channel_id: channel_id.clone(),
        epoch,
        slots,
        signature: Some(signature),
    };
    let bytes = bincode::serialize(&msg).map_err(|e| e.to_string())?;
    net_tx.send(bytes).await.map_err(|e| e.to_string())
}

pub(super) async fn rotate_and_broadcast_group_key(
    db_pool: &sqlx::Pool<sqlx::Sqlite>,
    identity: Identity,
    net_tx: &TokioSender<Vec<u8>>,
    server_id: &str,
    channel_id: &Option<String>,
    epoch: u64,
) -> Result<(), String> {
    let issuer_id = identity.peer_id_base58();
    let members = aep::database::get_server_members(db_pool, server_id)
        .await
        .map_err(|e| e.to_string())?;
    let mut slots: Vec<EncryptedDmSlot> = Vec::new();

    {
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock().await;
        let key = mgr.generate_and_set_group_key(server_id, channel_id, epoch);

        for m in members {
            if m.id == issuer_id {
                continue;
            }
            if let Ok(pkt) = mgr.encrypt_for(&m.id, &key) {
                slots.push(EncryptedDmSlot {
                    recipient: m.id,
                    init: pkt.init,
                    enc_header: pkt.enc_header,
                    enc_content: pkt.enc_content,
                });
            }
        }
    };

    let payload = bincode::serialize(&(issuer_id.clone(), server_id, channel_id, epoch, &slots)).map_err(|e| e.to_string())?;
    let signature = identity
        .keypair()
        .sign(&payload)
        .map_err(|e| e.to_string())?;

    let msg = aegis_protocol::AepMessage::GroupKeyUpdate {
        issuer_id,
        server_id: server_id.to_string(),
        channel_id: channel_id.clone(),
        epoch,
        slots,
        signature: Some(signature),
    };
    let bytes = bincode::serialize(&msg).map_err(|e| e.to_string())?;
    net_tx.send(bytes).await.map_err(|e| e.to_string())
}
