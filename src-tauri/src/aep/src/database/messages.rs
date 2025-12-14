use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, QueryBuilder, Sqlite};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub id: String,
    pub message_id: String,
    pub name: String,
    pub content_type: Option<String>,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentWithData {
    #[serde(flatten)]
    pub metadata: Attachment,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub chat_id: String,
    pub sender_id: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub read: bool,
    pub pinned: bool,
    pub attachments: Vec<Attachment>,
    pub reactions: HashMap<String, Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_snapshot_author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_snapshot_snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edited_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edited_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, FromRow)]
struct MessageRow {
    id: String,
    chat_id: String,
    sender_id: String,
    content: String,
    timestamp: String,
    read: bool,
    pinned: bool,
    reply_to_message_id: Option<String>,
    reply_snapshot_author: Option<String>,
    reply_snapshot_snippet: Option<String>,
    edited_at: Option<String>,
    edited_by: Option<String>,
    expires_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct MessageMetadata {
    pub id: String,
    pub chat_id: String,
    pub sender_id: String,
}

pub async fn insert_message(
    pool: &Pool<Sqlite>, 
    message: &Message, 
    attachment_data: &[AttachmentWithData]
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    let timestamp_str = message.timestamp.to_rfc3339();
    let edited_at_str = message.edited_at.map(|value| value.to_rfc3339());
    let expires_at_str = message.expires_at.map(|value| value.to_rfc3339());
    let reply_to_id = message.reply_to_message_id.clone();
    let reply_snapshot_author = message.reply_snapshot_author.clone();
    let reply_snapshot_snippet = message.reply_snapshot_snippet.clone();

    sqlx::query!(
        "INSERT INTO messages (id, chat_id, sender_id, content, timestamp, read, pinned, reply_to_message_id, reply_snapshot_author, reply_snapshot_snippet, edited_at, edited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        message.id,
        message.chat_id,
        message.sender_id,
        message.content,
        timestamp_str,
        message.read,
        message.pinned,
        reply_to_id,
        reply_snapshot_author,
        reply_snapshot_snippet,
        edited_at_str,
        message.edited_by,
        expires_at_str,
    )
    .execute(&mut *tx)
    .await?;

    for attachment in attachment_data {
        if attachment.metadata.size > i64::MAX as u64 {
            return Err(sqlx::Error::Protocol("attachment size too large".into()));
        }
        let size_i64 = attachment.metadata.size as i64;

        sqlx::query!(
            "INSERT INTO attachments (id, message_id, name, content_type, size, data) VALUES (?, ?, ?, ?, ?, ?)",
            attachment.metadata.id,
            attachment.metadata.message_id,
            attachment.metadata.name,
            attachment.metadata.content_type,
            size_i64,
            attachment.data,
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn delete_message(pool: &Pool<Sqlite>, message_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM messages WHERE id = ?", message_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_messages_for_chat(
    pool: &Pool<Sqlite>,
    chat_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<Message>, sqlx::Error> {
    let messages_rows = sqlx::query_as!(
        MessageRow,
        "SELECT id, chat_id, sender_id, content, timestamp, read, pinned, reply_to_message_id, reply_snapshot_author, reply_snapshot_snippet, edited_at, edited_by, expires_at FROM messages WHERE chat_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
        chat_id,
        limit,
        offset
    )
    .fetch_all(pool)
    .await?;

    hydrate_messages_from_rows(pool, messages_rows).await
}

async fn hydrate_messages_from_rows(
    pool: &Pool<Sqlite>,
    message_rows: Vec<MessageRow>,
) -> Result<Vec<Message>, sqlx::Error> {
    let mut messages = Vec::with_capacity(message_rows.len());
    let mut message_ids: Vec<String> = Vec::with_capacity(message_rows.len());
    
    for row in message_rows {
        let timestamp = DateTime::parse_from_rfc3339(&row.timestamp)
            .map(|dt| dt.with_timezone(&Utc))
            .map_err(|e| sqlx::Error::Decode(format!("Failed to parse timestamp: {}", e).into()))?;
        
        let edited_at = match row.edited_at {
             Some(v) => Some(DateTime::parse_from_rfc3339(&v).map(|dt| dt.with_timezone(&Utc)).map_err(|e| sqlx::Error::Decode(format!("{}", e).into()))?),
             None => None,
        };
        let expires_at = match row.expires_at {
             Some(v) => Some(DateTime::parse_from_rfc3339(&v).map(|dt| dt.with_timezone(&Utc)).map_err(|e| sqlx::Error::Decode(format!("{}", e).into()))?),
             None => None,
        };

        message_ids.push(row.id.clone());
        messages.push(Message {
            id: row.id,
            chat_id: row.chat_id,
            sender_id: row.sender_id,
            content: row.content,
            timestamp,
            read: row.read,
            pinned: row.pinned,
            attachments: Vec::new(),
            reactions: HashMap::new(),
            reply_to_message_id: row.reply_to_message_id,
            reply_snapshot_author: row.reply_snapshot_author,
            reply_snapshot_snippet: row.reply_snapshot_snippet,
            edited_at,
            edited_by: row.edited_by,
            expires_at,
        });
    }

    if !message_ids.is_empty() {
        #[derive(FromRow)]
        struct AttachmentRow {
            id: String,
            message_id: String,
            name: String,
            content_type: Option<String>,
            size: i64,
        }

        let mut query_builder = QueryBuilder::<Sqlite>::new(
            "SELECT id, message_id, name, content_type, size FROM attachments WHERE message_id IN (",
        );
        {
            let mut separated = query_builder.separated(", ");
            for message_id in &message_ids {
                separated.push_bind(message_id);
            }
        }
        query_builder.push(") ORDER BY id");
        
        let attachment_rows = query_builder
            .build_query_as::<AttachmentRow>()
            .fetch_all(pool)
            .await?;

        let mut attachments_map: HashMap<String, Vec<Attachment>> = HashMap::new();
        for row in attachment_rows {
            let size_u64 = if row.size < 0 { 0 } else { row.size as u64 };
            attachments_map
                .entry(row.message_id.clone())
                .or_default()
                .push(Attachment {
                    id: row.id,
                    message_id: row.message_id,
                    name: row.name,
                    content_type: row.content_type,
                    size: size_u64,
                });
        }

        for message in &mut messages {
            if let Some(mut attachments) = attachments_map.remove(&message.id) {
                attachments.sort_by(|a, b| a.id.cmp(&b.id));
                message.attachments = attachments;
            }
        }

        #[derive(FromRow)]
        struct ReactionRow { message_id: String, user_id: String, emoji: String }
        
        let mut reactions_query = QueryBuilder::<Sqlite>::new(
            "SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (",
        );
        {
            let mut separated = reactions_query.separated(", ");
            for message_id in &message_ids { separated.push_bind(message_id); }
        }
        reactions_query.push(")");
        let reaction_rows = reactions_query.build_query_as::<ReactionRow>().fetch_all(pool).await?;

        let mut reaction_map: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();
        for row in reaction_rows {
            reaction_map.entry(row.message_id).or_default().entry(row.emoji).or_default().push(row.user_id);
        }

        for message in &mut messages {
            if let Some(reactions) = reaction_map.remove(&message.id) {
                message.reactions = reactions;
            }
        }
    }

    messages.reverse();
    Ok(messages)
}

pub async fn update_message_content(
    pool: &Pool<Sqlite>,
    message_id: &str,
    new_content: &str,
    edited_at: DateTime<Utc>,
    edited_by: &str,
) -> Result<(), sqlx::Error> {
    let edited_at_str = edited_at.to_rfc3339();
    sqlx::query!(
        "UPDATE messages SET content = ?, edited_at = ?, edited_by = ? WHERE id = ?",
        new_content,
        edited_at_str,
        edited_by,
        message_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_message_as_read(
    pool: &Pool<Sqlite>,
    message_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!("UPDATE messages SET read = 1 WHERE id = ?", message_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn set_message_pinned(
    pool: &Pool<Sqlite>,
    message_id: &str,
    pinned: bool,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "UPDATE messages SET pinned = ? WHERE id = ?",
        pinned,
        message_id
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn get_message_metadata(
    pool: &Pool<Sqlite>,
    message_id: &str,
) -> Result<Option<MessageMetadata>, sqlx::Error> {
    let record = sqlx::query!(
        "SELECT id, chat_id, sender_id FROM messages WHERE id = ?",
        message_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(record.map(|row| MessageMetadata {
        id: row.id,
        chat_id: row.chat_id,
        sender_id: row.sender_id,
    }))
}

pub async fn upsert_typing_indicator(
    pool: &Pool<Sqlite>,
    chat_id: &str,
    user_id: &str,
    is_typing: bool,
    timestamp: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    let ts = timestamp.to_rfc3339();
    let is_typing_i64 = if is_typing { 1 } else { 0 };
    sqlx::query!(
        r#"
        INSERT INTO typing_indicators (chat_id, user_id, is_typing, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(chat_id, user_id) DO UPDATE SET
            is_typing = excluded.is_typing,
            updated_at = excluded.updated_at
        "#,
        chat_id,
        user_id,
        is_typing_i64,
        ts,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn add_reaction_to_message(
    pool: &Pool<Sqlite>,
    message_id: &str,
    user_id: &str,
    emoji: &str,
) -> Result<(), sqlx::Error> {
    let created_at = Utc::now().to_rfc3339();
    sqlx::query!(
        r#"
        INSERT INTO message_reactions (message_id, user_id, emoji, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(message_id, user_id, emoji) DO UPDATE SET created_at = excluded.created_at
        "#,
        message_id,
        user_id,
        emoji,
        created_at,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn remove_reaction_from_message(
    pool: &Pool<Sqlite>,
    message_id: &str,
    user_id: &str,
    emoji: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
        message_id,
        user_id,
        emoji,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn search_messages(
    pool: &Pool<Sqlite>,
    chat_id: &str,
    query: Option<&str>,
    limit: i64,
    offset: i64,
    pinned: Option<bool>,
    sender_ids: Option<&[String]>,
    before: Option<&str>,
    after: Option<&str>,
) -> Result<Vec<Message>, sqlx::Error> {
    let mut builder = QueryBuilder::<Sqlite>::new("SELECT m.id, m.chat_id, m.sender_id, m.content, m.timestamp, m.read, m.pinned, m.reply_to_message_id, m.reply_snapshot_author, m.reply_snapshot_snippet, m.edited_at, m.edited_by, m.expires_at FROM messages m");

    if let Some(q) = query {
        if !q.trim().is_empty() {
            builder.push(" JOIN messages_fts fts ON m.id = fts.id ");
        }
    }

    builder.push(" WHERE m.chat_id = ");
    builder.push_bind(chat_id);

    if let Some(q) = query {
        let trimmed = q.trim();
        if !trimmed.is_empty() {
            builder.push(" AND messages_fts MATCH ");
            builder.push_bind(format!("\"{}\"", trimmed)); 
        }
    }

    if let Some(pinned) = pinned {
        builder.push(" AND m.pinned = ");
        builder.push_bind(pinned);
    }

    if let Some(ids) = sender_ids {
        let valid_sender_ids: Vec<&String> =
            ids.iter().filter(|value| !value.trim().is_empty()).collect();
        if !valid_sender_ids.is_empty() {
            builder.push(" AND m.sender_id IN (");
            {
                let mut separated = builder.separated(", ");
                for id in valid_sender_ids {
                    separated.push_bind(id);
                }
            }
            builder.push(")");
        }
    }

    if let Some(before) = before {
        builder.push(" AND m.timestamp < ");
        builder.push_bind(before);
    }

    if let Some(after) = after {
        builder.push(" AND m.timestamp > ");
        builder.push_bind(after);
    }

    builder.push(" ORDER BY m.timestamp DESC LIMIT ");
    builder.push_bind(limit);
    builder.push(" OFFSET ");
    builder.push_bind(offset);

    let rows = builder
        .build_query_as::<MessageRow>()
        .fetch_all(pool)
        .await?;
        
    hydrate_messages_from_rows(pool, rows).await
}

pub async fn get_attachment_data(
    pool: &Pool<Sqlite>,
    attachment_id: &str,
) -> Result<Vec<u8>, sqlx::Error> {
    let record = sqlx::query!("SELECT data FROM attachments WHERE id = ?", attachment_id)
        .fetch_optional(pool)
        .await?;

    match record {
        Some(row) => Ok(row.data),
        None => Err(sqlx::Error::RowNotFound),
    }
}
