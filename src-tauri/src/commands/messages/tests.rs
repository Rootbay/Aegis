mod tests {
    use super::delivery::persist_and_broadcast_message;
    use super::events::{broadcast_read_receipt, broadcast_typing_indicator};
    use super::moderation::{delete_message_internal, edit_message_internal};
    use super::*;
    use aegis_protocol::{AepMessage, ReadReceiptData, TypingIndicatorData};
    use aegis_shared_types::{
        AppState, FileAclPolicy, IncomingFile, PendingDeviceProvisioning, TrustedDeviceRecord, User,
    };
    use aep::user_service;
    use bs58;
    use chrono::Utc;
    use crypto::identity::Identity;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use tempfile::tempdir;
    use tokio::sync::Mutex;
    use uuid::Uuid;

    fn build_app_state(identity: Identity, db_pool: sqlx::Pool<sqlx::Sqlite>) -> AppState {
        let (network_tx, _network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let temp_dir = tempdir().expect("tempdir");
        let app_data_dir = temp_dir.into_path();
        AppState {
            identity,
            network_tx,
            db_pool,
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
            app_data_dir,
            connectivity_snapshot: Arc::new(Mutex::new(None)),
            voice_memos_enabled: Arc::new(AtomicBool::new(true)),
            relays: Arc::new(Mutex::new(Vec::new())),
            trusted_devices: Arc::new(Mutex::new(Vec::<TrustedDeviceRecord>::new())),
            pending_device_bundles: Arc::new(Mutex::new(HashMap::<
                String,
                PendingDeviceProvisioning,
            >::new())),
        }
    }

    #[tokio::test]
    async fn send_read_receipt_is_broadcast_and_signed() {
        let dir = tempdir().expect("tempdir");
        let db_pool = aep::database::initialize_db(dir.path().join("db.sqlite"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let reader_id = identity.peer_id().to_base58();

        let (network_tx, mut network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let temp_dir = tempdir().expect("tempdir");
        let app_state = AppState {
            identity: identity.clone(),
            network_tx,
            db_pool,
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
            app_data_dir: temp_dir.into_path(),
            connectivity_snapshot: Arc::new(Mutex::new(None)),
            voice_memos_enabled: Arc::new(AtomicBool::new(true)),
            relays: Arc::new(Mutex::new(Vec::new())),
            trusted_devices: Arc::new(Mutex::new(Vec::<TrustedDeviceRecord>::new())),
            pending_device_bundles: Arc::new(Mutex::new(HashMap::<
                String,
                PendingDeviceProvisioning,
            >::new())),
        };

        let chat_id = "chat-abc".to_string();
        let message_id = "message-xyz".to_string();

        broadcast_read_receipt(app_state, chat_id.clone(), message_id.clone())
            .await
            .expect("receipt broadcast succeeds");

        let raw = network_rx
            .recv()
            .await
            .expect("network channel should receive payload");

        let event: AepMessage = bincode::deserialize(&raw).expect("deserializes AEP");

        match event {
            AepMessage::ReadReceipt {
                chat_id: event_chat_id,
                message_id: event_message_id,
                reader_id: event_reader_id,
                timestamp,
                signature,
            } => {
                assert_eq!(event_chat_id, chat_id);
                assert_eq!(event_message_id, message_id);
                assert_eq!(event_reader_id, reader_id);

                let sig = signature.expect("signature included");
                let data = ReadReceiptData {
                    chat_id: event_chat_id,
                    message_id: event_message_id,
                    reader_id: event_reader_id,
                    timestamp,
                };
                let bytes = bincode::serialize(&data).expect("serialize data");
                let public_key = identity.keypair().public();
                assert!(public_key.verify(&bytes, &sig));
            }
            other => panic!("expected read receipt event, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn send_typing_indicator_is_broadcast_and_signed() {
        let dir = tempdir().expect("tempdir");
        let db_pool = aep::database::initialize_db(dir.path().join("db.sqlite"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let user_id = identity.peer_id().to_base58();

        let (network_tx, mut network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let temp_dir = tempdir().expect("tempdir");
        let app_state = AppState {
            identity: identity.clone(),
            network_tx,
            db_pool,
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
            app_data_dir: temp_dir.into_path(),
            connectivity_snapshot: Arc::new(Mutex::new(None)),
            voice_memos_enabled: Arc::new(AtomicBool::new(true)),
            relays: Arc::new(Mutex::new(Vec::new())),
            trusted_devices: Arc::new(Mutex::new(Vec::<TrustedDeviceRecord>::new())),
            pending_device_bundles: Arc::new(Mutex::new(HashMap::<
                String,
                PendingDeviceProvisioning,
            >::new())),
        };

        let chat_id = "chat-typing".to_string();

        broadcast_typing_indicator(app_state, chat_id.clone(), true)
            .await
            .expect("typing indicator broadcast succeeds");

        let raw = network_rx
            .recv()
            .await
            .expect("network channel should receive payload");

        let event: AepMessage = bincode::deserialize(&raw).expect("deserializes AEP");

        match event {
            AepMessage::TypingIndicator {
                chat_id: event_chat_id,
                user_id: event_user_id,
                is_typing,
                timestamp,
                signature,
            } => {
                assert_eq!(event_chat_id, chat_id);
                assert_eq!(event_user_id, user_id);
                assert!(is_typing);

                let sig = signature.expect("signature included");
                let data = TypingIndicatorData {
                    chat_id: event_chat_id,
                    user_id: event_user_id,
                    is_typing,
                    timestamp,
                };
                let bytes = bincode::serialize(&data).expect("serialize data");
                let public_key = identity.keypair().public();
                assert!(public_key.verify(&bytes, &sig));
            }
            other => panic!("expected typing indicator event, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn delete_message_is_broadcast_and_applied() {
        let local_dir = tempdir().expect("tempdir");
        let local_db = aep::database::initialize_db(local_dir.path().join("local.db"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let user_id = identity.peer_id().to_base58();
        let public_key_b58 =
            bs58::encode(identity.keypair().public().to_protobuf_encoding()).into_string();

        let user = User {
            id: user_id.clone(),
            username: "Tester".into(),
            avatar: "avatar.png".into(),
            is_online: true,
            public_key: Some(public_key_b58.clone()),
            bio: None,
            tag: None,
        };

        user_service::insert_user(&local_db, &user)
            .await
            .expect("insert user");

        let message_id = Uuid::new_v4().to_string();
        let chat_id = "chat-123".to_string();

        let message = database::Message {
            id: message_id.clone(),
            chat_id: chat_id.clone(),
            sender_id: user_id.clone(),
            content: "Hello".into(),
            timestamp: Utc::now(),
            read: false,
            pinned: false,
            attachments: Vec::new(),
            reactions: HashMap::new(),
            reply_to_message_id: None,
            reply_snapshot_author: None,
            reply_snapshot_snippet: None,
            edited_at: None,
            edited_by: None,
            expires_at: None,
        };
        database::insert_message(&local_db, &message)
            .await
            .expect("insert message");

        let (network_tx, mut network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let temp_dir = tempdir().expect("tempdir");
        let app_data_dir = temp_dir.into_path();
        let local_state = AppState {
            identity: identity.clone(),
            network_tx,
            db_pool: local_db.clone(),
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
            app_data_dir,
            connectivity_snapshot: Arc::new(Mutex::new(None)),
            voice_memos_enabled: Arc::new(AtomicBool::new(true)),
            relays: Arc::new(Mutex::new(Vec::new())),
            trusted_devices: Arc::new(Mutex::new(Vec::<TrustedDeviceRecord>::new())),
            pending_device_bundles: Arc::new(Mutex::new(HashMap::<
                String,
                PendingDeviceProvisioning,
            >::new())),
        };

        delete_message_internal(
            local_state,
            chat_id.clone(),
            message_id.clone(),
            MessageDeletionScope::Everyone,
        )
        .await
        .expect("delete message locally");

        let remaining = database::get_messages_for_chat(&local_db, &chat_id, 10, 0)
            .await
            .expect("fetch");
        assert!(remaining.is_empty(), "message should be deleted locally");

        let serialized = network_rx
            .recv()
            .await
            .expect("delete event should be emitted");
        let event: AepMessage =
            bincode::deserialize(&serialized).expect("event deserializes correctly");

        let remote_dir = tempdir().expect("tempdir");
        let remote_db = aep::database::initialize_db(remote_dir.path().join("remote.db"))
            .await
            .expect("init remote db");

        user_service::insert_user(&remote_db, &user)
            .await
            .expect("insert remote user");

        database::insert_message(&remote_db, &message)
            .await
            .expect("insert remote message");

        let remote_state = build_app_state(Identity::generate(), remote_db.clone());

        aep::handle_aep_message(event, &remote_db, remote_state)
            .await
            .expect("remote delete should succeed");

        let remote_remaining = database::get_messages_for_chat(&remote_db, &chat_id, 10, 0)
            .await
            .expect("fetch remote");
        assert!(
            remote_remaining.is_empty(),
            "message should be deleted on remote client"
        );
    }

    #[tokio::test]
    async fn voice_memo_attachments_blocked_when_disabled() {
        let temp_dir = tempdir().expect("tempdir");
        let db_pool = aep::database::initialize_db(temp_dir.path().join("voice-memo.db"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let mut state = build_app_state(identity.clone(), db_pool.clone());
        state.voice_memos_enabled.store(false, Ordering::Relaxed);

        let attachments = vec![AttachmentDescriptor {
            name: "voice-message-test.webm".into(),
            content_type: Some("audio/webm".into()),
            size: 4,
            data: vec![0, 1, 2, 3],
        }];

        let result = persist_and_broadcast_message(
            state,
            "Test message".into(),
            attachments,
            Some("chat-voice".into()),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await;

        assert!(
            matches!(result, Err(message) if message.contains("Voice memo attachments are disabled")),
            "Voice memo attachments should be rejected when disabled"
        );
    }

    #[tokio::test]
    async fn edit_message_is_persisted_and_broadcast() {
        let local_dir = tempdir().expect("tempdir");
        let local_db = aep::database::initialize_db(local_dir.path().join("local.db"))
            .await
            .expect("init db");

        let identity = Identity::generate();
        let user_id = identity.peer_id().to_base58();
        let public_key_b58 =
            bs58::encode(identity.keypair().public().to_protobuf_encoding()).into_string();

        let user = User {
            id: user_id.clone(),
            username: "Tester".into(),
            avatar: "avatar.png".into(),
            is_online: true,
            public_key: Some(public_key_b58.clone()),
            bio: None,
            tag: None,
        };

        user_service::insert_user(&local_db, &user)
            .await
            .expect("insert user");

        let message_id = Uuid::new_v4().to_string();
        let chat_id = "chat-456".to_string();

        let message = database::Message {
            id: message_id.clone(),
            chat_id: chat_id.clone(),
            sender_id: user_id.clone(),
            content: "Original".into(),
            timestamp: Utc::now(),
            read: false,
            pinned: false,
            attachments: Vec::new(),
            reactions: HashMap::new(),
            reply_to_message_id: None,
            reply_snapshot_author: None,
            reply_snapshot_snippet: None,
            edited_at: None,
            edited_by: None,
            expires_at: None,
        };
        database::insert_message(&local_db, &message)
            .await
            .expect("insert message");

        let (network_tx, mut network_rx) = tokio::sync::mpsc::channel(8);
        let (file_cmd_tx, _file_cmd_rx) = tokio::sync::mpsc::channel(8);
        let temp_dir = tempdir().expect("tempdir");
        let app_data_dir = temp_dir.into_path();
        let local_state = AppState {
            identity: identity.clone(),
            network_tx,
            db_pool: local_db.clone(),
            incoming_files: Arc::new(Mutex::new(HashMap::<String, IncomingFile>::new())),
            file_cmd_tx,
            file_acl_policy: Arc::new(Mutex::new(FileAclPolicy::Everyone)),
            app_data_dir,
            connectivity_snapshot: Arc::new(Mutex::new(None)),
            voice_memos_enabled: Arc::new(AtomicBool::new(true)),
            relays: Arc::new(Mutex::new(Vec::new())),
            trusted_devices: Arc::new(Mutex::new(Vec::<TrustedDeviceRecord>::new())),
            pending_device_bundles: Arc::new(Mutex::new(HashMap::<
                String,
                PendingDeviceProvisioning,
            >::new())),
        };

        let new_content = "Edited message".to_string();
        edit_message_internal(
            local_state,
            chat_id.clone(),
            message_id.clone(),
            new_content.clone(),
        )
        .await
        .expect("edit message locally");

        let updated_local = database::get_messages_for_chat(&local_db, &chat_id, 10, 0)
            .await
            .expect("fetch local");
        assert_eq!(updated_local.len(), 1);
        let updated = &updated_local[0];
        assert_eq!(updated.content, new_content);
        assert_eq!(updated.edited_by.as_deref(), Some(user_id.as_str()));
        assert!(updated.edited_at.is_some());

        let serialized = network_rx
            .recv()
            .await
            .expect("edit event should be emitted");
        let event: AepMessage =
            bincode::deserialize(&serialized).expect("event deserializes correctly");

        let remote_dir = tempdir().expect("tempdir");
        let remote_db = aep::database::initialize_db(remote_dir.path().join("remote.db"))
            .await
            .expect("init remote db");

        user_service::insert_user(&remote_db, &user)
            .await
            .expect("insert remote user");

        database::insert_message(&remote_db, &message)
            .await
            .expect("insert remote message");

        let remote_state = build_app_state(Identity::generate(), remote_db.clone());

        aep::handle_aep_message(event.clone(), &remote_db, remote_state)
            .await
            .expect("remote edit should succeed");

        if let AepMessage::EditMessage {
            message_id: event_message_id,
            chat_id: event_chat_id,
            editor_id,
            new_content: event_content,
            edited_at: event_time,
            ..
        } = event
        {
            assert_eq!(event_message_id, message_id);
            assert_eq!(event_chat_id, chat_id);
            assert_eq!(editor_id, user_id);
            assert_eq!(event_content, new_content);

            let remote_messages = database::get_messages_for_chat(&remote_db, &chat_id, 10, 0)
                .await
                .expect("fetch remote");
            assert_eq!(remote_messages.len(), 1);
            let remote_message = &remote_messages[0];
            assert_eq!(remote_message.content, new_content);
            assert_eq!(remote_message.edited_by.as_deref(), Some(user_id.as_str()));
            let remote_time = remote_message
                .edited_at
                .expect("remote message should have edited_at");
            assert_eq!(remote_time.to_rfc3339(), event_time.to_rfc3339());
        } else {
            panic!("expected edit message event");
        }
    }
}
