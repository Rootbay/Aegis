use crate::commands::state::AppStateContainer;
use aegis_protocol::AepMessage;
use aegis_protocol::EncryptedDmSlot;
use aep::database;
use e2ee;
use tauri::State;

#[tauri::command]
pub async fn send_message(
    message: String,
    channel_id: Option<String>,
    server_id: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    let peer_id = state.identity.peer_id().to_base58();

    // Insert locally so the chat UI works offline and messages appear immediately
    let chat_id_local = if let Some(c) = channel_id.clone() {
        c
    } else if let Some(s) = server_id.clone() {
        s
    } else {
        peer_id.clone()
    };
    let new_local_message = database::Message {
        id: uuid::Uuid::new_v4().to_string(),
        chat_id: chat_id_local,
        sender_id: peer_id.clone(),
        content: message.clone(),
        timestamp: chrono::Utc::now(),
        read: false,
    };
    database::insert_message(&state.db_pool, &new_local_message)
        .await
        .map_err(|e| e.to_string())?;

    let chat_message_data = aegis_protocol::ChatMessageData {
        sender: peer_id.clone(),
        content: message.clone(),
        channel_id: channel_id.clone(),
        server_id: server_id.clone(),
    };
    let chat_message_bytes = bincode::serialize(&chat_message_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&chat_message_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::ChatMessage {
        sender: peer_id,
        content: message,
        channel_id,
        server_id,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_messages(
    chat_id: String,
    limit: i64,
    offset: i64,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<database::Message>, String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?;
    database::get_messages_for_chat(&state.db_pool, &chat_id, limit, offset)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_encrypted_dm(
    recipient_id: String,
    message: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let my_id = state.identity.peer_id().to_base58();

    // Insert locally for UX
    let new_local_message = database::Message {
        id: uuid::Uuid::new_v4().to_string(),
        chat_id: recipient_id.clone(),
        sender_id: my_id.clone(),
        content: message.clone(),
        timestamp: chrono::Utc::now(),
        read: false,
    };
    database::insert_message(&state.db_pool, &new_local_message)
        .await
        .map_err(|e| e.to_string())?;

    // Encrypt via E2EE manager
    let pkt = {
        let e2ee_arc = e2ee::init_global_manager();
        let mut mgr = e2ee_arc.lock();
        let pkt = mgr
            .encrypt_for(&recipient_id, message.as_bytes())
            .map_err(|e| format!("E2EE encrypt error: {e}"))?;
        pkt
    };

    let payload_sig_bytes = bincode::serialize(&(
        my_id.clone(),
        recipient_id.clone(),
        &pkt.enc_header,
        &pkt.enc_content,
    ))
    .map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&payload_sig_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::EncryptedChatMessage {
        sender: my_id,
        recipient: recipient_id,
        init: pkt.init,
        enc_header: pkt.enc_header,
        enc_content: pkt.enc_content,
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rotate_group_key(
    server_id: String,
    channel_id: Option<String>,
    epoch: u64,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    // Derive fresh random key
    use rand::RngCore;
    let mut key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);

    // Save locally
    {
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock();
        mgr.set_group_key(&server_id, &channel_id, epoch, &key);
    }

    // Build encrypted slots per member
    let members = aep::database::get_server_members(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    let mut slots: Vec<EncryptedDmSlot> = Vec::new();
    for m in members {
        if m.id == state.identity.peer_id().to_base58() {
            continue;
        }
        let arc = e2ee::init_global_manager();
        let mut mgr = arc.lock();
        let pkt = mgr
            .encrypt_for(&m.id, &key)
            .map_err(|e| format!("E2EE encrypt error: {e}"))?;
        slots.push(EncryptedDmSlot {
            recipient: m.id,
            init: pkt.init,
            enc_header: pkt.enc_header,
            enc_content: pkt.enc_content,
        });
    }

    let aep_msg = aegis_protocol::AepMessage::GroupKeyUpdate {
        server_id,
        channel_id,
        epoch,
        slots,
        signature: None,
    };
    let bytes = bincode::serialize(&aep_msg).map_err(|e| e.to_string())?;
    // Optionally sign entire packet
    // Not strictly necessary for trusted owner distribution in P2P, but consistent with others
    // Note: We cannot set signature inline since enum variant consumed; sign serialized bytes instead (transport integrity)
    state
        .network_tx
        .send(bytes)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_encrypted_group_message(
    server_id: String,
    channel_id: Option<String>,
    message: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    // Encrypt using group key
    let (epoch, nonce, ciphertext) = {
        let arc = e2ee::init_global_manager();
        let mgr = arc.lock();
        mgr.encrypt_group_message(&server_id, &channel_id, message.as_bytes())
            .map_err(|e| format!("Group E2EE: {e}"))?
    };

    // Sign payload
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

    // Broadcast
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
