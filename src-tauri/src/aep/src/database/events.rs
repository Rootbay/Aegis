use super::utils::{parse_timestamp, parse_optional_timestamp};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, QueryBuilder, Sqlite};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ServerEvent {
    pub id: String,
    pub server_id: String,
    pub title: String,
    pub description: Option<String>,
    pub channel_id: Option<String>,
    pub scheduled_for: DateTime<Utc>,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub status: String,
    pub cancelled_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Default)]
pub struct ServerEventPatch {
    pub title: Option<String>,
    pub description: Option<Option<String>>,
    pub channel_id: Option<Option<String>>,
    pub scheduled_for: Option<DateTime<Utc>>,
    pub status: Option<String>,
    pub cancelled_at: Option<Option<DateTime<Utc>>>,
}

#[derive(Debug, Clone, FromRow)]
struct ServerEventRow {
    id: String,
    server_id: String,
    title: String,
    description: Option<String>,
    channel_id: Option<String>,
    scheduled_for: String,
    created_by: String,
    created_at: String,
    status: String,
    cancelled_at: Option<String>,
}

impl TryInto<ServerEvent> for ServerEventRow {
    type Error = sqlx::Error;

    fn try_into(self) -> Result<ServerEvent, Self::Error> {
        Ok(ServerEvent {
            id: self.id,
            server_id: self.server_id,
            title: self.title,
            description: self.description,
            channel_id: self.channel_id,
            scheduled_for: parse_timestamp(&self.scheduled_for)?,
            created_by: self.created_by,
            created_at: parse_timestamp(&self.created_at)?,
            status: self.status,
            cancelled_at: parse_optional_timestamp(self.cancelled_at)?,
        })
    }
}

pub async fn insert_server_event(
    pool: &Pool<Sqlite>,
    event: &ServerEvent,
) -> Result<(), sqlx::Error> {
    let scheduled_for = event.scheduled_for.to_rfc3339();
    let created_at = event.created_at.to_rfc3339();
    let cancelled_at = event.cancelled_at.as_ref().map(|dt| dt.to_rfc3339());

    sqlx::query!(
        "INSERT INTO server_events (id, server_id, title, description, channel_id, scheduled_for, created_by, created_at, status, cancelled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        event.id,
        event.server_id,
        event.title,
        event.description,
        event.channel_id,
        scheduled_for,
        event.created_by,
        created_at,
        event.status,
        cancelled_at,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_server_event_by_id(
    pool: &Pool<Sqlite>,
    event_id: &str,
) -> Result<Option<ServerEvent>, sqlx::Error> {
    let row = sqlx::query_as::<_, ServerEventRow>(
        "SELECT id, server_id, title, description, channel_id, scheduled_for, created_by, created_at, status, cancelled_at FROM server_events WHERE id = ?",
    )
    .bind(event_id)
    .fetch_optional(pool)
    .await?;

    match row {
        Some(r) => r.try_into().map(Some),
        None => Ok(None)
    }
}

pub async fn get_server_events(
    pool: &Pool<Sqlite>,
    server_id: &str,
) -> Result<Vec<ServerEvent>, sqlx::Error> {
    let rows = sqlx::query_as::<_, ServerEventRow>(
        "SELECT id, server_id, title, description, channel_id, scheduled_for, created_by, created_at, status, cancelled_at FROM server_events WHERE server_id = ? ORDER BY scheduled_for ASC",
    )
    .bind(server_id)
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(|r| r.try_into()).collect()
}

pub async fn update_server_event(
    pool: &Pool<Sqlite>,
    event_id: &str,
    patch: ServerEventPatch,
) -> Result<ServerEvent, sqlx::Error> {
    let mut builder = QueryBuilder::<Sqlite>::new("UPDATE server_events SET ");
    let mut has_updates = false;

    let mut push_comma = |builder: &mut QueryBuilder<Sqlite>| {
        if has_updates {
            builder.push(", ");
        }
        has_updates = true;
    };

    if let Some(title) = patch.title {
        push_comma(&mut builder);
        builder.push("title = ").push_bind(title);
    }
    if let Some(description) = patch.description {
        push_comma(&mut builder);
        builder.push("description = ").push_bind(description);
    }
    if let Some(channel_id) = patch.channel_id {
        push_comma(&mut builder);
        builder.push("channel_id = ").push_bind(channel_id);
    }
    if let Some(scheduled_for) = patch.scheduled_for {
        push_comma(&mut builder);
        builder.push("scheduled_for = ").push_bind(scheduled_for.to_rfc3339());
    }
    if let Some(status) = patch.status {
        push_comma(&mut builder);
        builder.push("status = ").push_bind(status);
    }
    if let Some(cancelled_at) = patch.cancelled_at {
        push_comma(&mut builder);
        builder.push("cancelled_at = ").push_bind(cancelled_at.map(|dt| dt.to_rfc3339()));
    }

    if !has_updates {
        return get_server_event_by_id(pool, event_id)
            .await?
            .ok_or_else(|| sqlx::Error::RowNotFound);
    }

    builder.push(" WHERE id = ").push_bind(event_id);
    builder.push(" RETURNING id, server_id, title, description, channel_id, scheduled_for, created_by, created_at, status, cancelled_at");

    let row: ServerEventRow = builder
        .build_query_as::<ServerEventRow>()
        .fetch_one(pool)
        .await?;
    row.try_into()
}
