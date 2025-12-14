use super::utils::parse_timestamp;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, QueryBuilder, Sqlite};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GroupChat {
    pub id: String,
    pub name: Option<String>,
    pub owner_id: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GroupChatMember {
    pub group_chat_id: String,
    pub user_id: String,
    pub added_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupChatRecord {
    pub chat: GroupChat,
    pub member_ids: Vec<String>,
}

pub async fn upsert_group_chat(
    pool: &Pool<Sqlite>,
    chat: &GroupChat,
    members: &[GroupChatMember],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    let created_at_str = chat.created_at.to_rfc3339();
    sqlx::query!(
        r#"
        INSERT INTO group_chats (id, name, owner_id, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            owner_id = excluded.owner_id,
            created_at = excluded.created_at
        "#,
        chat.id,
        chat.name,
        chat.owner_id,
        created_at_str,
    )
    .execute(&mut *tx)
    .await?;

    for member in members {
        let added_at_str = member.added_at.to_rfc3339();
        sqlx::query!(
            r#"
            INSERT INTO group_chat_members (group_chat_id, user_id, added_at)
            VALUES (?, ?, ?)
            ON CONFLICT(group_chat_id, user_id) DO UPDATE SET
                added_at = excluded.added_at
            "#,
            member.group_chat_id,
            member.user_id,
            added_at_str,
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn get_group_chats_for_user(
    pool: &Pool<Sqlite>,
    user_id: &str,
) -> Result<Vec<GroupChatRecord>, sqlx::Error> {
    #[derive(FromRow)]
    struct GroupChatRow {
        id: String,
        name: Option<String>,
        owner_id: String,
        created_at: String,
    }

    let chat_rows = sqlx::query_as!(
        GroupChatRow,
        r#"
        SELECT gc.id, gc.name, gc.owner_id, gc.created_at as "created_at: String"
        FROM group_chats gc
        INNER JOIN group_chat_members gcm ON gcm.group_chat_id = gc.id
        WHERE gcm.user_id = ?
        ORDER BY gc.created_at ASC
        "#,
        user_id,
    )
    .fetch_all(pool)
    .await?;

    if chat_rows.is_empty() {
        return Ok(Vec::new());
    }

    let mut chats = Vec::with_capacity(chat_rows.len());
    let mut chat_ids = Vec::with_capacity(chat_rows.len());

    for row in chat_rows {
        chats.push(GroupChat {
            id: row.id.clone(),
            name: row.name,
            owner_id: row.owner_id,
            created_at: parse_timestamp(&row.created_at)?,
        });
        chat_ids.push(row.id);
    }

    #[derive(FromRow)]
    struct MemberRow {
        group_chat_id: String,
        user_id: String,
        added_at: String,
    }

    let mut query_builder = QueryBuilder::<Sqlite>::new(
        "SELECT group_chat_id, user_id, added_at FROM group_chat_members WHERE group_chat_id IN (",
    );
    {
        let mut separated = query_builder.separated(", ");
        for chat_id in &chat_ids {
            separated.push_bind(chat_id);
        }
    }
    query_builder.push(") ORDER BY added_at ASC");
    let member_rows = query_builder.build_query_as::<MemberRow>().fetch_all(pool).await?;

    let mut members_by_chat: HashMap<String, Vec<GroupChatMember>> = HashMap::new();
    for row in member_rows {
        members_by_chat.entry(row.group_chat_id.clone()).or_default().push(GroupChatMember {
            group_chat_id: row.group_chat_id,
            user_id: row.user_id,
            added_at: parse_timestamp(&row.added_at)?,
        });
    }

    let mut records = Vec::with_capacity(chats.len());
    for chat in chats {
        let members = members_by_chat.remove(&chat.id).unwrap_or_default();
        let member_ids = members.into_iter().map(|m| m.user_id).collect();
        records.push(GroupChatRecord { chat, member_ids });
    }

    Ok(records)
}

pub async fn is_group_chat_member(pool: &Pool<Sqlite>, group_chat_id: &str, user_id: &str) -> Result<bool, sqlx::Error> {
    let count: i64 = sqlx::query_scalar!(
        "SELECT COUNT(1) as \"count!: i64\" FROM group_chat_members WHERE group_chat_id = ? AND user_id = ?",
        group_chat_id,
        user_id
    )
    .fetch_one(pool)
    .await?;
    Ok(count > 0)
}

pub async fn update_group_chat_name(pool: &Pool<Sqlite>, group_chat_id: &str, name: Option<String>) -> Result<(), sqlx::Error> {
    sqlx::query!("UPDATE group_chats SET name = ? WHERE id = ?", name, group_chat_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_group_chat_record(pool: &Pool<Sqlite>, group_chat_id: &str) -> Result<Option<GroupChatRecord>, sqlx::Error> {
    #[derive(FromRow)]
    struct GroupChatRow {
        id: String,
        name: Option<String>,
        owner_id: String,
        created_at: String,
    }

    let row = match sqlx::query_as!(GroupChatRow, "SELECT id, name, owner_id, created_at as \"created_at: String\" FROM group_chats WHERE id = ?", group_chat_id).fetch_optional(pool).await? {
        Some(r) => r,
        None => return Ok(None),
    };

    let member_rows = sqlx::query!("SELECT user_id FROM group_chat_members WHERE group_chat_id = ? ORDER BY added_at ASC", group_chat_id).fetch_all(pool).await?;
    
    Ok(Some(GroupChatRecord {
        chat: GroupChat {
            id: row.id,
            name: row.name,
            owner_id: row.owner_id,
            created_at: parse_timestamp(&row.created_at)?,
        },
        member_ids: member_rows.into_iter().map(|r| r.user_id).collect(),
    }))
}

pub async fn remove_group_chat_member(pool: &Pool<Sqlite>, group_chat_id: &str, user_id: &str) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let result = sqlx::query!("DELETE FROM group_chat_members WHERE group_chat_id = ? AND user_id = ?", group_chat_id, user_id).execute(&mut *tx).await?;

    if result.rows_affected() == 0 {
        tx.rollback().await?;
        return Ok(false);
    }

    let remaining: i64 = sqlx::query_scalar!("SELECT COUNT(1) as \"count!: i64\" FROM group_chat_members WHERE group_chat_id = ?", group_chat_id).fetch_one(&mut *tx).await?;

    if remaining == 0 {
        sqlx::query!("DELETE FROM group_chats WHERE id = ?", group_chat_id).execute(&mut *tx).await?;
    }

    tx.commit().await?;
    Ok(true)
}

pub async fn add_group_chat_members(pool: &Pool<Sqlite>, group_chat_id: &str, member_ids: &[String]) -> Result<Vec<String>, sqlx::Error> {
    if member_ids.is_empty() { return Ok(Vec::new()); }
    let mut tx = pool.begin().await?;
    let timestamp = Utc::now().to_rfc3339();
    let mut added = Vec::new();

    for member_id in member_ids {
        let result = sqlx::query!("INSERT OR IGNORE INTO group_chat_members (group_chat_id, user_id, added_at) VALUES (?, ?, ?)", group_chat_id, member_id, timestamp).execute(&mut *tx).await?;
        if result.rows_affected() > 0 { added.push(member_id.clone()); }
    }
    tx.commit().await?;
    Ok(added)
}
