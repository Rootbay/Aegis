use aep::database;
use chrono::Utc;
use std::collections::HashMap;
use tempfile::tempdir;
use scu128::Scu128;

#[tokio::test]
async fn message_with_attachments_round_trips() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("attachments.db");

    let pool = database::initialize_db(db_path).await.expect("init db");

    let message_id = Scu128::new().to_string();
    let chat_id = "chat-room".to_string();
    let sender_id = "sender-1".to_string();
    let content = "hello with files".to_string();
    let attachment_bytes: Vec<u8> = b"file-bytes".to_vec();

    let attachment = database::Attachment {
        id: Scu128::new().to_string(),
        message_id: message_id.clone(),
        name: "greeting.txt".to_string(),
        content_type: Some("text/plain".to_string()),
        size: attachment_bytes.len() as u64,
        data: Some(attachment_bytes.clone()),
    };

    let message = database::Message {
        id: message_id.clone(),
        chat_id: chat_id.clone(),
        sender_id: sender_id.clone(),
        content: content.clone(),
        timestamp: Utc::now(),
        read: false,
        pinned: false,
        attachments: vec![attachment.clone()],
        reactions: HashMap::new(),
        reply_to_message_id: None,
        reply_snapshot_author: None,
        reply_snapshot_snippet: None,
        edited_at: None,
        edited_by: None,
        expires_at: None,
    };

    database::insert_message(&pool, &message)
        .await
        .expect("insert message");

    let fetched = database::get_messages_for_chat(&pool, &chat_id, 10, 0)
        .await
        .expect("fetch messages");

    assert_eq!(fetched.len(), 1);
    let fetched_message = &fetched[0];
    assert_eq!(fetched_message.id, message_id);
    assert_eq!(fetched_message.chat_id, chat_id);
    assert_eq!(fetched_message.sender_id, sender_id);
    assert_eq!(fetched_message.content, content);
    assert_eq!(fetched_message.attachments.len(), 1);

    let fetched_attachment = &fetched_message.attachments[0];
    assert_eq!(fetched_attachment.name, attachment.name);
    assert_eq!(fetched_attachment.content_type, attachment.content_type);
    assert_eq!(fetched_attachment.size, attachment_bytes.len() as u64);
    assert!(fetched_attachment.data.is_none());

    let fetched_bytes = database::get_attachment_data(&pool, &attachment.id)
        .await
        .expect("fetch attachment bytes");
    assert_eq!(fetched_bytes, attachment_bytes);
}

#[tokio::test]
async fn message_reply_snapshot_round_trips() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("replies.db");

    let pool = database::initialize_db(db_path).await.expect("init db");

    let message_id = Scu128::new().to_string();
    let chat_id = "chat-reply".to_string();
    let sender_id = "replier".to_string();
    let reply_target = Scu128::new().to_string();

    let message = database::Message {
        id: message_id.clone(),
        chat_id: chat_id.clone(),
        sender_id: sender_id.clone(),
        content: "reply content".to_string(),
        timestamp: Utc::now(),
        read: false,
        pinned: false,
        attachments: Vec::new(),
        reactions: HashMap::new(),
        reply_to_message_id: Some(reply_target.clone()),
        reply_snapshot_author: Some("original author".to_string()),
        reply_snapshot_snippet: Some("original message".to_string()),
        edited_at: None,
        edited_by: None,
        expires_at: None,
    };

    database::insert_message(&pool, &message)
        .await
        .expect("insert reply message");

    let fetched = database::get_messages_for_chat(&pool, &chat_id, 10, 0)
        .await
        .expect("fetch reply message");

    assert_eq!(fetched.len(), 1);
    let fetched_message = &fetched[0];
    assert_eq!(
        fetched_message.reply_to_message_id.as_deref(),
        Some(reply_target.as_str())
    );
    assert_eq!(
        fetched_message.reply_snapshot_author.as_deref(),
        Some("original author")
    );
    assert_eq!(
        fetched_message.reply_snapshot_snippet.as_deref(),
        Some("original message")
    );
}
