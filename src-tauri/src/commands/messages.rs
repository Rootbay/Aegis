use crate::commands::state::AppStateContainer;
use aegis_protocol::AepMessage;
use aegis_protocol::EncryptedDmSlot;
use aep::database;
use aegis_shared_types::AppState;
use e2ee;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Clone, Deserialize)]
pub struct AttachmentDescriptor {
    pub name: String,
    #[serde(rename = "type")]
    pub content_type: Option<String>,
    pub size: u64,
}

async fn persist_and_broadcast_message(
    state: AppState,
    message: String,
    channel_id: Option<String>,
    server_id: Option<String>,
) -> Result<(), String> {
    let peer_id = state.identity.peer_id().to_base58();

    let chat_id_local = if let Some(ref c) = channel_id {
        c.clone()
    } else if let Some(ref s) = server_id {
        s.clone()
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
pub async fn send_message(
    message: String,
    channel_id: Option<String>,
    server_id: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    persist_and_broadcast_message(state, message, channel_id, server_id).await
}

#[tauri::command]
pub async fn send_message_with_attachments(
    message: String,
    attachments: Vec<AttachmentDescriptor>,
    channel_id: Option<String>,
    server_id: Option<String>,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    if !attachments.is_empty() {
        let attachment_count = attachments.len();
        let sample: Vec<String> = attachments.iter().take(3).map(|a| a.name.clone()).collect();
        eprintln!("send_message_with_attachments invoked with {attachment_count} attachment(s); deferring to basic message pipeline. Samples: {:?}", sample);
    }
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();

    persist_and_broadcast_message(state, message, channel_id, server_id).await
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
pub async fn delete_message(
    chat_id: String,
    message_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    let state = state.as_ref().ok_or("State not initialized")?.clone();
    let _ = chat_id;
    database::delete_message(&state.db_pool, &message_id)
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

    let issuer_id = state.identity.peer_id().to_base58();
    let payload = bincode::serialize(&(issuer_id.clone(), &server_id, &channel_id, epoch, &slots))
        .map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&payload)
        .map_err(|e| e.to_string())?;

    let aep_msg = aegis_protocol::AepMessage::GroupKeyUpdate {
        issuer_id,
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

#[tauri::command]
pub async fn add_reaction(
    chat_id: String,
    message_id: String,
    emoji: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    if state.as_ref().is_none() {
        return Err("State not initialized".to_string());
    }
    drop(state);
    let _ = (chat_id, message_id, emoji);
    Ok(())
}

#[tauri::command]
pub async fn remove_reaction(
    chat_id: String,
    message_id: String,
    emoji: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = state_container.0.lock().await;
    if state.as_ref().is_none() {
        return Err("State not initialized".to_string());
    }
    drop(state);
    let _ = (chat_id, message_id, emoji);
    Ok(())
}

