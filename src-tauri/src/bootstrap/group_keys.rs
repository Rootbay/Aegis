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
    let (epoch, key_bytes) = {
        let arc = e2ee::init_global_manager();
        let mgr = arc.lock();
        mgr.get_group_key(server_id, channel_id)
            .ok_or_else(|| "Missing group key for broadcast".to_string())?
    };
    let issuer_id = identity.peer_id().to_base58();

    let members = aep::database::get_server_members(db_pool, server_id)
        .await
        .map_err(|e| e.to_string())?;
    let mut slots: Vec<EncryptedDmSlot> = Vec::new();
    for m in members {
        if m.id == issuer_id {
            continue;
        }
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock();
        if let Ok(pkt) = mgr.encrypt_for(&m.id, &key_bytes) {
            slots.push(EncryptedDmSlot {
                recipient: m.id,
                init: pkt.init,
                enc_header: pkt.enc_header,
                enc_content: pkt.enc_content,
            });
        }
    }

    let payload = rkyv::to_bytes::<_, 1024>(&(issuer_id.clone(), server_id.to_string(), channel_id.clone(), epoch, slots.clone())).map(|v| v.to_vec()).map_err(|e| e.to_string())?;
    let signature = identity
        .keypair()
        .sign(&payload)
        .map_err(|e| e.to_string())?;

    let msg = aegis_protocol::AepMessage::GroupKeyUpdate {
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
    let key = {
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock();
        mgr.generate_and_set_group_key(server_id, channel_id, epoch)
    };
    let issuer_id = identity.peer_id().to_base58();

    let members = aep::database::get_server_members(db_pool, server_id)
        .await
        .map_err(|e| e.to_string())?;
    let mut slots: Vec<EncryptedDmSlot> = Vec::new();
    for m in members {
        if m.id == issuer_id {
            continue;
        }
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock();
        if let Ok(pkt) = mgr.encrypt_for(&m.id, &key) {
            slots.push(EncryptedDmSlot {
                recipient: m.id,
                init: pkt.init,
                enc_header: pkt.enc_header,
                enc_content: pkt.enc_content,
            });
        }
    }

    let payload = rkyv::to_bytes::<_, 1024>(&(issuer_id.clone(), server_id.to_string(), channel_id.clone(), epoch, slots.clone())).map(|v| v.to_vec()).map_err(|e| e.to_string())?;
    let signature = identity
        .keypair()
        .sign(&payload)
        .map_err(|e| e.to_string())?;

    let msg = aegis_protocol::AepMessage::GroupKeyUpdate {
        server_id: server_id.to_string(),
        channel_id: channel_id.clone(),
        epoch,
        slots,
        signature: Some(signature),
    };
    let bytes = bincode::serialize(&msg).map_err(|e| e.to_string())?;
    net_tx.send(bytes).await.map_err(|e| e.to_string())
}
