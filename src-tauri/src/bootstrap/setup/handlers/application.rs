use tauri::{Emitter, Runtime};
use libp2p::PeerId;
use aegis_protocol::{AepMessage, ReadReceiptData, TypingIndicatorData, EncryptedDmSlot};
use super::super::context::AppContext;
use scu128::Scu128;
use std::sync::Arc;

pub async fn handle_message<R: Runtime>(
    ctx: &Arc<AppContext<R>>,
    message: AepMessage,
    propagation_source: PeerId
) -> Result<(), anyhow::Error> {
    
    match &message {
        AepMessage::PrekeyBundle { user_id, bundle, signature } => {
            process_prekey(ctx, user_id, bundle, signature).await;
        }
        AepMessage::EncryptedChatMessage { sender, recipient, init, enc_header, enc_content, signature } => {
            process_chat(ctx, sender, recipient, init, enc_header, enc_content, signature).await;
        }
        AepMessage::GroupKeyUpdate { server_id, channel_id, epoch, slots, signature } => {
            process_group_key(ctx, &propagation_source, server_id, channel_id, epoch, slots, signature).await;
        }
        AepMessage::ReadReceipt { chat_id, message_id, reader_id, timestamp, signature } => {
            process_read_receipt(ctx, chat_id, message_id, reader_id, timestamp, signature).await;
        }
        AepMessage::TypingIndicator { chat_id, user_id, is_typing, timestamp, signature } => {
            process_typing(ctx, chat_id, user_id, *is_typing, timestamp, signature).await;
        }
        AepMessage::EncryptedGroupMessage { sender, server_id, channel_id, epoch, nonce, ciphertext, signature } => {
            process_group_chat(ctx, sender, server_id, channel_id, *epoch, nonce, ciphertext, signature).await;
        }
        AepMessage::CallSignal { sender_id, recipient_id, call_id, signal } => {
            let my_id = ctx.app_state.identity.peer_id().to_base58();
            if recipient_id == &my_id {
                let _ = ctx.app.emit("call-signal", serde_json::json!({
                    "senderId": sender_id, "callId": call_id, "signal": signal
                }));
            }
        }
        _ => {
            // Existing generic handler
            let _ = aep::handle_aep_message(message.clone(), &ctx.db_pool, ctx.app_state.clone()).await;
        }
    }

    let _ = ctx.event_tx.send(message.clone()).await;
    let _ = ctx.app.emit("new-message", message);
    Ok(())
}

async fn process_prekey<R: Runtime>(ctx: &Arc<AppContext<R>>, user_id: &str, bundle: &[u8], signature: &Option<Vec<u8>>) {
    if verify_sig(ctx, user_id, bundle, signature.as_deref()).await {
         if let Ok(bundle_obj) = bincode::deserialize::<e2ee::PrekeyBundle>(bundle) {
            e2ee::init_global_manager().lock().await.add_remote_bundle(user_id, bundle_obj);
         }
    }
}

async fn process_chat<R: Runtime>(ctx: &Arc<AppContext<R>>, sender: &String, recipient: &String, init: &Option<Vec<u8>>, header: &[u8], content: &[u8], signature: &Option<Vec<u8>>) {
    let payload = bincode::serialize(&(sender.clone(), recipient.clone(), header, content)).unwrap_or_default();
    if !verify_sig(ctx, sender, &payload, signature.as_deref()).await { return; }

    let my_id = ctx.app_state.identity.peer_id().to_base58();
    if recipient != &my_id { return; }

    let packet = e2ee::EncryptedPacket { init: init.clone(), enc_header: header.to_vec(), enc_content: content.to_vec() };
    if let Ok(plaintext) = e2ee::init_global_manager().lock().await.decrypt_from(sender, &packet) {
        insert_db_message(ctx, sender, sender, plaintext).await;
    }
}

async fn process_group_key<R: Runtime>(ctx: &Arc<AppContext<R>>, source: &PeerId, server: &String, channel: &Option<String>, epoch: &u64, slots: &[EncryptedDmSlot], signature: &Option<Vec<u8>>) {
    let issuer = source.to_base58();
    let payload = bincode::serialize(&(issuer.clone(), server, channel, *epoch, slots)).unwrap_or_default();
    if !verify_sig(ctx, &issuer, &payload, signature.as_deref()).await { return; }

    let my_id = ctx.app_state.identity.peer_id().to_base58();
    if let Some(slot) = slots.iter().find(|s| s.recipient == my_id) {
        let packet = e2ee::EncryptedPacket { init: slot.init.clone(), enc_header: slot.enc_header.clone(), enc_content: slot.enc_content.clone() };
        if let Ok(key_bytes) = e2ee::init_global_manager().lock().await.decrypt_from(&my_id, &packet) {
            e2ee::init_global_manager().lock().await.set_group_key(server.as_str(), channel, *epoch, &key_bytes);
        }
    }
}

async fn process_read_receipt<R: Runtime>(ctx: &Arc<AppContext<R>>, chat_id: &str, msg_id: &str, reader: &String, ts: &chrono::DateTime<chrono::Utc>, sig: &Option<Vec<u8>>) {
    let data = ReadReceiptData { chat_id: chat_id.into(), message_id: msg_id.into(), reader_id: reader.clone(), timestamp: *ts };
    let bytes = bincode::serialize(&data).unwrap_or_default();
    if !verify_sig(ctx, reader, &bytes, sig.as_deref()).await { return; }

    let _ = aep::database::mark_message_as_read(&ctx.db_pool, msg_id).await;
    let _ = ctx.app.emit("message-read", crate::commands::messages::ReadReceiptEventPayload {
        chat_id: chat_id.into(), message_id: msg_id.into(), reader_id: reader.clone(), timestamp: ts.to_rfc3339()
    });
}

async fn process_typing<R: Runtime>(ctx: &Arc<AppContext<R>>, chat_id: &str, user: &String, typing: bool, ts: &chrono::DateTime<chrono::Utc>, sig: &Option<Vec<u8>>) {
    let data = TypingIndicatorData { chat_id: chat_id.into(), user_id: user.clone(), is_typing: typing, timestamp: *ts };
    let bytes = bincode::serialize(&data).unwrap_or_default();
    if !verify_sig(ctx, user, &bytes, sig.as_deref()).await { return; }

    let _ = aep::database::upsert_typing_indicator(&ctx.db_pool, chat_id, user, typing, ts.clone()).await;
    let _ = ctx.app.emit("typing-indicator", crate::commands::messages::TypingIndicatorEventPayload {
        chat_id: chat_id.into(), user_id: user.clone(), is_typing: typing, timestamp: ts.to_rfc3339()
    });
}

async fn process_group_chat<R: Runtime>(ctx: &Arc<AppContext<R>>, sender: &String, server: &str, channel: &Option<String>, epoch: u64, nonce: &[u8], ciphertext: &[u8], sig: &Option<Vec<u8>>) {
    let payload = bincode::serialize(&(sender.clone(), server, channel, epoch, nonce, ciphertext)).unwrap_or_default();
    if !verify_sig(ctx, sender, &payload, sig.as_deref()).await { return; }

    if let Ok(plaintext) = e2ee::init_global_manager().lock().await.decrypt_group_message(server, channel, ciphertext) {
        let chat_id = channel.clone().unwrap_or_else(|| server.to_string());
        insert_db_message(ctx, &chat_id, sender, plaintext).await;
    }
}

async fn verify_sig<R: Runtime>(ctx: &Arc<AppContext<R>>, user_id: &str, data: &[u8], signature: Option<&[u8]>) -> bool {
    let sig = match signature { Some(s) => s, None => return false };
    let user_opt = aep::user_service::get_user(&ctx.db_pool, user_id).await.ok().flatten();
    if let Some(user) = user_opt {
        if let Some(pk_b58) = user.public_key {
            if let Ok(bytes) = bs58::decode(pk_b58).into_vec() {
                if let Ok(pk) = libp2p::identity::PublicKey::from_protobuf_encoding(&bytes) {
                    return pk.verify(data, sig);
                }
            }
        }
    }
    false
}

async fn insert_db_message<R: Runtime>(ctx: &Arc<AppContext<R>>, chat_id: &str, sender_id: &str, plaintext: Vec<u8>) {
    let message_id = Scu128::new().to_string();
    let mut db_attachments = Vec::new();
    let mut attachment_data = Vec::new();

    let (content, reply_to, snap_author, snap_snip) = if let Ok(pl) = bincode::deserialize::<crate::commands::messages::EncryptedDmPayload>(&plaintext) {
        for d in pl.attachments {
            if d.data.is_empty() { continue; }
            let att_id = Scu128::new().to_string();
            let att = aep::database::Attachment {
                id: att_id, message_id: message_id.clone(), name: d.name, content_type: d.content_type, size: d.data.len() as u64
            };
            db_attachments.push(att.clone());
            attachment_data.push(aep::database::AttachmentWithData { metadata: att, data: d.data });
        }
        (pl.content, pl.reply_to_message_id, pl.reply_snapshot_author, pl.reply_snapshot_snippet)
    } else {
        (String::from_utf8_lossy(&plaintext).to_string(), None, None, None)
    };

    let msg = aep::database::Message {
        id: message_id, chat_id: chat_id.into(), sender_id: sender_id.into(), content, timestamp: chrono::Utc::now(),
        read: false, pinned: false, attachments: db_attachments, reactions: Default::default(),
        reply_to_message_id: reply_to, reply_snapshot_author: snap_author, reply_snapshot_snippet: snap_snip,
        edited_at: None, edited_by: None, expires_at: None
    };

    let _ = aep::database::insert_message(&ctx.db_pool, &msg, &attachment_data).await;
}
