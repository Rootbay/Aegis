use aep::database;
use chrono::Utc;
use std::collections::HashMap;
use tempfile::tempdir;
use uuid::Uuid;

#[tokio::test]
async fn message_with_attachments_round_trips() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("attachments.db");

    let pool = database::initialize_db(db_path).await.expect("init db");

    let message_id = Uuid::new_v4().to_string();
    let chat_id = "chat-room".to_string();
    let sender_id = "sender-1".to_string();
    let content = "hello with files".to_string();
    let attachment_bytes: Vec<u8> = b"file-bytes".to_vec();

    let attachment = database::Attachment {
        id: Uuid::new_v4().to_string(),
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
