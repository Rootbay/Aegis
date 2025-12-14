use super::utils::parse_timestamp;
use aegis_shared_types::{Channel, ChannelCategory};
use chrono::{DateTime, Utc};
use sqlx::{FromRow, Pool, QueryBuilder, Sqlite};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ServerWebhook {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub url: String,
    pub channel_id: Option<String>,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default)]
pub struct ServerWebhookPatch {
    pub name: Option<String>,
    pub url: Option<String>,
    pub channel_id: Option<Option<String>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ChannelDisplayPreference {
    pub user_id: String,
    pub channel_id: String,
    pub hide_member_names: bool,
}

#[derive(Debug, Clone, FromRow)]
struct ServerWebhookRow {
    id: String,
    server_id: String,
    name: String,
    url: String,
    channel_id: Option<String>,
    created_by: String,
    created_at: String,
    updated_at: String,
}

impl TryInto<ServerWebhook> for ServerWebhookRow {
    type Error = sqlx::Error;

    fn try_into(self) -> Result<ServerWebhook, Self::Error> {
        Ok(ServerWebhook {
            id: self.id,
            server_id: self.server_id,
            name: self.name,
            url: self.url,
            channel_id: self.channel_id,
            created_by: self.created_by,
            created_at: parse_timestamp(&self.created_at)?,
            updated_at: parse_timestamp(&self.updated_at)?,
        })
    }
}

pub async fn get_channels_for_servers(
    pool: &Pool<Sqlite>,
    server_ids: &[String],
) -> Result<HashMap<String, Vec<Channel>>, sqlx::Error> {
    let mut channels_map: HashMap<String, Vec<Channel>> = HashMap::new();

    if server_ids.is_empty() {
        return Ok(channels_map);
    }

    let query = format!("SELECT id, server_id, name, channel_type, private, category_id FROM channels WHERE server_id IN ({})",
        server_ids.iter().map(|_| "?").collect::<Vec<&str>>().join(", ")
    );

    let mut q = sqlx::query_as::<_, Channel>(&query);
    for id in server_ids {
        q = q.bind(id);
    }

    let channels = q.fetch_all(pool).await?;

    for channel in channels {
        channels_map
            .entry(channel.server_id.clone())
            .or_insert_with(Vec::new)
            .push(channel);
    }

    Ok(channels_map)
}

pub async fn delete_channel(pool: &Pool<Sqlite>, channel_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM channels WHERE id = ?", channel_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_channel_categories_for_servers(
    pool: &Pool<Sqlite>,
    server_ids: &[String],
) -> Result<HashMap<String, Vec<ChannelCategory>>, sqlx::Error> {
    let mut categories_map: HashMap<String, Vec<ChannelCategory>> = HashMap::new();

    if server_ids.is_empty() {
        return Ok(categories_map);
    }

    let query = format!(
        "SELECT id, server_id, name, position, created_at FROM channel_categories WHERE server_id IN ({}) ORDER BY position ASC, created_at ASC",
        server_ids.iter().map(|_| "?").collect::<Vec<&str>>().join(", "),
    );

    let mut q = sqlx::query_as::<_, ChannelCategory>(&query);
    for id in server_ids {
        q = q.bind(id);
    }

    let categories = q.fetch_all(pool).await?;

    for category in categories {
        categories_map
            .entry(category.server_id.clone())
            .or_insert_with(Vec::new)
            .push(category);
    }

    Ok(categories_map)
}

pub async fn insert_channel(pool: &Pool<Sqlite>, channel: &Channel) -> Result<(), sqlx::Error> {
    let category_id = channel.category_id.clone();
    sqlx::query!(
        "INSERT INTO channels (id, server_id, name, channel_type, private, category_id) VALUES (?, ?, ?, ?, ?, ?)",
        channel.id,
        channel.server_id,
        channel.name,
        channel.channel_type,
        channel.private,
        category_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn replace_server_channels(
    pool: &Pool<Sqlite>,
    server_id: &str,
    channels: &[Channel],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query!("DELETE FROM channels WHERE server_id = ?", server_id)
        .execute(&mut *tx)
        .await?;

    for channel in channels {
        let category_id = channel.category_id.clone();
        sqlx::query!(
            "INSERT INTO channels (id, server_id, name, channel_type, private, category_id) VALUES (?, ?, ?, ?, ?, ?)",
            channel.id,
            channel.server_id,
            channel.name,
            channel.channel_type,
            channel.private,
            category_id,
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn upsert_channel_display_preference(
    pool: &Pool<Sqlite>,
    user_id: &str,
    channel_id: &str,
    hide_member_names: bool,
) -> Result<ChannelDisplayPreference, sqlx::Error> {
    sqlx::query!(
        "INSERT INTO channel_display_preferences (user_id, channel_id, hide_member_names) VALUES (?, ?, ?) ON CONFLICT(user_id, channel_id) DO UPDATE SET hide_member_names = excluded.hide_member_names",
        user_id,
        channel_id,
        hide_member_names,
    )
    .execute(pool)
    .await?;

    sqlx::query_as!(
        ChannelDisplayPreference,
        "SELECT user_id, channel_id, hide_member_names FROM channel_display_preferences WHERE user_id = ? AND channel_id = ?",
        user_id,
        channel_id
    )
    .fetch_one(pool)
    .await
}

pub async fn insert_server_webhook(
    pool: &Pool<Sqlite>,
    webhook: &ServerWebhook,
) -> Result<(), sqlx::Error> {
    let channel_id = webhook.channel_id.clone();
    let created_at = webhook.created_at.to_rfc3339();
    let updated_at = webhook.updated_at.to_rfc3339();

    sqlx::query!(
        "INSERT INTO server_webhooks (id, server_id, name, url, channel_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        webhook.id,
        webhook.server_id,
        webhook.name,
        webhook.url,
        channel_id,
        webhook.created_by,
        created_at,
        updated_at,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_server_webhook_by_id(
    pool: &Pool<Sqlite>,
    webhook_id: &str,
) -> Result<Option<ServerWebhook>, sqlx::Error> {
    let row = sqlx::query_as::<_, ServerWebhookRow>(
        "SELECT id, server_id, name, url, channel_id, created_by, created_at, updated_at FROM server_webhooks WHERE id = ?",
    )
    .bind(webhook_id)
    .fetch_optional(pool)
    .await?;

    if let Some(row) = row {
        let webhook: ServerWebhook = row.try_into()?;
        Ok(Some(webhook))
    } else {
        Ok(None)
    }
}

pub async fn list_server_webhooks(
    pool: &Pool<Sqlite>,
    server_id: &str,
) -> Result<Vec<ServerWebhook>, sqlx::Error> {
    let rows = sqlx::query_as::<_, ServerWebhookRow>(
        "SELECT id, server_id, name, url, channel_id, created_by, created_at, updated_at FROM server_webhooks WHERE server_id = ? ORDER BY name COLLATE NOCASE ASC",
    )
    .bind(server_id)
    .fetch_all(pool)
    .await?;

    let mut webhooks = Vec::with_capacity(rows.len());
    for row in rows {
        webhooks.push(row.try_into()?);
    }
    Ok(webhooks)
}

pub async fn update_server_webhook(
    pool: &Pool<Sqlite>,
    webhook_id: &str,
    patch: ServerWebhookPatch,
) -> Result<ServerWebhook, sqlx::Error> {
    let mut builder = QueryBuilder::<Sqlite>::new("UPDATE server_webhooks SET ");
    let mut has_updates = false;

    let mut push_update = |builder: &mut QueryBuilder<Sqlite>, column: &str| {
        if has_updates {
            builder.push(", ");
        }
        has_updates = true;
        builder.push(column);
        builder.push(" = ");
    };

    if let Some(name) = patch.name {
        push_update(&mut builder, "name");
        builder.push_bind(name);
    }

    if let Some(url) = patch.url {
        push_update(&mut builder, "url");
        builder.push_bind(url);
    }

    if let Some(channel_id) = patch.channel_id {
        push_update(&mut builder, "channel_id");
        builder.push_bind(channel_id);
    }

    if let Some(updated_at) = patch.updated_at {
        push_update(&mut builder, "updated_at");
        builder.push_bind(updated_at.to_rfc3339());
    }

    if !has_updates {
        return get_server_webhook_by_id(pool, webhook_id)
            .await?
            .ok_or_else(|| sqlx::Error::RowNotFound);
    }

    builder.push(" WHERE id = ");
    builder.push_bind(webhook_id);
    builder.push(
        " RETURNING id, server_id, name, url, channel_id, created_by, created_at, updated_at",
    );

    let row: ServerWebhookRow = builder
        .build_query_as::<ServerWebhookRow>()
        .fetch_one(pool)
        .await?;
    row.try_into()
}

pub async fn delete_server_webhook(
    pool: &Pool<Sqlite>,
    webhook_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM server_webhooks WHERE id = ?", webhook_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_channel_by_id(
    pool: &Pool<Sqlite>,
    channel_id: &str,
) -> Result<Channel, sqlx::Error> {
    sqlx::query_as!(
        Channel,
        "SELECT id, server_id, name, channel_type, private, category_id FROM channels WHERE id = ?",
        channel_id
    )
    .fetch_one(pool)
    .await
}

pub async fn get_channels_for_server(
    pool: &Pool<Sqlite>,
    server_id: &str,
) -> Result<Vec<Channel>, sqlx::Error> {
    let channels = sqlx::query_as!(Channel, "SELECT id, server_id, name, channel_type, private, category_id FROM channels WHERE server_id = ?", server_id)
        .fetch_all(pool)
        .await?;
    Ok(channels)
}

pub async fn insert_channel_category(
    pool: &Pool<Sqlite>,
    category: &ChannelCategory,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO channel_categories (id, server_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)",
        category.id,
        category.server_id,
        category.name,
        category.position,
        category.created_at,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_channel_category(
    pool: &Pool<Sqlite>,
    category_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM channel_categories WHERE id = ?", category_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_channel_category_by_id(
    pool: &Pool<Sqlite>,
    category_id: &str,
) -> Result<Option<ChannelCategory>, sqlx::Error> {
    let category = sqlx::query_as!(
        ChannelCategory,
        "SELECT id, server_id, name, position, created_at FROM channel_categories WHERE id = ?",
        category_id,
    )
    .fetch_optional(pool)
    .await?;

    Ok(category)
}

pub async fn get_channel_categories_for_server(
    pool: &Pool<Sqlite>,
    server_id: &str,
) -> Result<Vec<ChannelCategory>, sqlx::Error> {
    let categories = sqlx::query_as!(
        ChannelCategory,
        "SELECT id, server_id, name, position, created_at FROM channel_categories WHERE server_id = ? ORDER BY position ASC, created_at ASC",
        server_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(categories)
}

pub async fn get_channel_display_preferences_for_user(
    pool: &Pool<Sqlite>,
    user_id: &str,
    server_id: Option<&str>,
) -> Result<Vec<ChannelDisplayPreference>, sqlx::Error> {
    if let Some(server_id) = server_id {
        sqlx::query_as!(
            ChannelDisplayPreference,
            "SELECT user_id, channel_id, hide_member_names FROM channel_display_preferences WHERE user_id = ? AND channel_id IN (SELECT id FROM channels WHERE server_id = ?)",
            user_id,
            server_id
        )
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as!(
            ChannelDisplayPreference,
            "SELECT user_id, channel_id, hide_member_names FROM channel_display_preferences WHERE user_id = ?",
            user_id
        )
        .fetch_all(pool)
        .await
    }
}
