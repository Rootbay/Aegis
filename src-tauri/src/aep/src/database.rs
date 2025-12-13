use aegis_types::AegisError;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json;
use sqlx::{sqlite::SqlitePoolOptions, FromRow, Pool, QueryBuilder, Sqlite};
use std::collections::HashMap;
use std::convert::TryInto;
use std::fmt;

use scu128::Scu128;

pub use aegis_shared_types::{Channel, ChannelCategory, Role, Server, ServerInvite, User};

// Define migrations for the database schema
// The path is relative to the crate root (src/aep), pointing up two levels to src-tauri/migrations.
static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../migrations");

fn parse_timestamp(value: &str) -> Result<DateTime<Utc>, sqlx::Error> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| sqlx::Error::Decode(format!("Failed to parse timestamp: {}", e).into()))
}

fn parse_optional_timestamp(value: Option<String>) -> Result<Option<DateTime<Utc>>, sqlx::Error> {
    match value {
        Some(ts) => parse_timestamp(&ts).map(Some),
        None => Ok(None),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Friendship {
    pub id: String,
    pub user_a_id: String,
    pub user_b_id: String,
    pub status: String, // 'pending', 'accepted', 'blocked_by_a', 'blocked_by_b'
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendshipWithProfile {
    pub friendship: Friendship,
    pub counterpart: Option<User>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FriendshipStatus {
    Pending,
    Accepted,
    BlockedByA,
    BlockedByB,
}

impl ToString for FriendshipStatus {
    fn to_string(&self) -> String {
        match self {
            FriendshipStatus::Pending => "pending".to_string(),
            FriendshipStatus::Accepted => "accepted".to_string(),
            FriendshipStatus::BlockedByA => "blocked_by_a".to_string(),
            FriendshipStatus::BlockedByB => "blocked_by_b".to_string(),
        }
    }
}

impl TryFrom<&str> for FriendshipStatus {
    type Error = AegisError;

    fn try_from(s: &str) -> Result<Self, Self::Error> {
        match s {
            "pending" => Ok(FriendshipStatus::Pending),
            "accepted" => Ok(FriendshipStatus::Accepted),
            "blocked_by_a" => Ok(FriendshipStatus::BlockedByA),
            "blocked_by_b" => Ok(FriendshipStatus::BlockedByB),
            _ => Err(AegisError::InvalidInput(format!(
                "Unknown friendship status: {}",
                s
            ))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub id: String,
    pub message_id: String,
    pub name: String,
    pub content_type: Option<String>,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub chat_id: String, // friend_id or channel_id
    pub sender_id: String,
    pub content: String,
    pub timestamp: DateTime<Utc>, // ISO 8601 string
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ReviewSubject {
    User,
    Server,
}

impl ReviewSubject {
    pub fn as_str(&self) -> &'static str {
        match self {
            ReviewSubject::User => "user",
            ReviewSubject::Server => "server",
        }
    }
}

impl TryFrom<&str> for ReviewSubject {
    type Error = sqlx::Error;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "user" => Ok(ReviewSubject::User),
            "server" => Ok(ReviewSubject::Server),
            other => Err(sqlx::Error::Decode(
                format!("Invalid review subject: {other}").into(),
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Review {
    pub id: String,
    pub subject_type: ReviewSubject,
    pub subject_id: String,
    pub author_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_avatar: Option<String>,
    pub rating: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewReview {
    pub id: String,
    pub subject: ReviewSubject,
    pub subject_id: String,
    pub author_id: String,
    pub rating: i64,
    pub content: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
struct ReviewRow {
    id: String,
    subject_type: String,
    subject_id: String,
    author_id: String,
    rating: i64,
    content: Option<String>,
    created_at: String,
    author_username: Option<String>,
    author_avatar: Option<String>,
}

impl TryFrom<ReviewRow> for Review {
    type Error = sqlx::Error;

    fn try_from(value: ReviewRow) -> Result<Self, Self::Error> {
        Ok(Review {
            id: value.id,
            subject_type: ReviewSubject::try_from(value.subject_type.as_str())?,
            subject_id: value.subject_id,
            author_id: value.author_id,
            author_username: value.author_username,
            author_avatar: value.author_avatar,
            rating: value.rating,
            content: value.content,
            created_at: parse_timestamp(&value.created_at)?,
        })
    }
}

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

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ServerBan {
    pub server_id: String,
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub created_at: DateTime<Utc>,
}

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

pub async fn initialize_db(db_path: std::path::PathBuf) -> Result<Pool<Sqlite>, sqlx::Error> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(
            sqlx::sqlite::SqliteConnectOptions::new()
                .filename(db_path)
                .create_if_missing(true),
        )
        .await?;

    // Run migrations
    // This will create the tables if they don't exist
    MIGRATOR.run(&pool).await?;

    Ok(pool)
}

pub async fn insert_friendship(
    pool: &Pool<Sqlite>,
    friendship: &Friendship,
) -> Result<(), sqlx::Error> {
    let created_at_str = friendship.created_at.to_rfc3339();
    let updated_at_str = friendship.updated_at.to_rfc3339();
    sqlx::query!(
        "INSERT INTO friendships (id, user_a_id, user_b_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        friendship.id,
        friendship.user_a_id,
        friendship.user_b_id,
        friendship.status,
        created_at_str,
        updated_at_str,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_friendship_status(
    pool: &Pool<Sqlite>,
    friendship_id: &str,
    status: FriendshipStatus,
) -> Result<(), sqlx::Error> {
    let updated_at = Utc::now().to_rfc3339();
    let status_str = status.to_string();
    sqlx::query!(
        "UPDATE friendships SET status = ?, updated_at = ? WHERE id = ?",
        status_str,
        updated_at,
        friendship_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_friendship(
    pool: &Pool<Sqlite>,
    user_a_id: &str,
    user_b_id: &str,
) -> Result<Option<Friendship>, sqlx::Error> {
    let friendship = sqlx::query_as!(Friendship,
        "SELECT id, user_a_id, user_b_id, status, created_at as \"created_at!: DateTime<Utc>\", updated_at as \"updated_at!: DateTime<Utc>\" FROM friendships WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)",
        user_a_id,
        user_b_id,
        user_b_id,
        user_a_id,
    )
    .fetch_optional(pool)
    .await?;
    Ok(friendship)
}

pub async fn get_all_friendships_for_user(
    pool: &Pool<Sqlite>,
    user_id: &str,
) -> Result<Vec<Friendship>, sqlx::Error> {
    let friendships = sqlx::query_as!(Friendship,
        "SELECT id, user_a_id, user_b_id, status, created_at as \"created_at!: DateTime<Utc>\", updated_at as \"updated_at!: DateTime<Utc>\" FROM friendships WHERE user_a_id = ? OR user_b_id = ?",
        user_id,
        user_id,
    )
    .fetch_all(pool)
    .await?;
    Ok(friendships)
}

pub async fn get_friendships_with_profiles(
    pool: &Pool<Sqlite>,
    user_id: &str,
) -> Result<Vec<FriendshipWithProfile>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"
        SELECT
            f.id as friendship_id,
            f.user_a_id,
            f.user_b_id,
            f.status,
            f.created_at as "friendship_created_at!: DateTime<Utc>",
            f.updated_at as "friendship_updated_at!: DateTime<Utc>",
            u.id as "counterpart_id?",
            u.username as "counterpart_username?",
            u.avatar as "counterpart_avatar?",
            u.is_online as "counterpart_is_online?: bool",
            u.public_key as "counterpart_public_key?",
            u.bio as "counterpart_bio?",
            u.tag as "counterpart_tag?",
            u.status_message as "counterpart_status_message?",
            u.location as "counterpart_location?"
        FROM friendships f
        LEFT JOIN users u
            ON u.id = CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
        WHERE f.user_a_id = ? OR f.user_b_id = ?
        "#,
        user_id,
        user_id,
        user_id,
    )
    .fetch_all(pool)
    .await?;

    let friendships = rows
        .into_iter()
        .map(|row| {
            let friendship = Friendship {
                id: row.friendship_id,
                user_a_id: row.user_a_id,
                user_b_id: row.user_b_id,
                status: row.status,
                created_at: row.friendship_created_at,
                updated_at: row.friendship_updated_at,
            };

            let counterpart = if let Some(counterpart_id) = row.counterpart_id {
                Some(User {
                    id: counterpart_id,
                    username: row.counterpart_username.unwrap_or_default(),
                    avatar: row.counterpart_avatar.unwrap_or_default(),
                    is_online: row.counterpart_is_online.unwrap_or(false),
                    public_key: row.counterpart_public_key,
                    bio: row.counterpart_bio,
                    tag: row.counterpart_tag,
                    status_message: row.counterpart_status_message,
                    location: row.counterpart_location,
                })
            } else {
                None
            };

            FriendshipWithProfile {
                friendship,
                counterpart,
            }
        })
        .collect();

    Ok(friendships)
}

pub async fn get_friendship_with_profile_for_user(
    pool: &Pool<Sqlite>,
    friendship_id: &str,
    user_id: &str,
) -> Result<Option<FriendshipWithProfile>, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        SELECT
            f.id as friendship_id,
            f.user_a_id,
            f.user_b_id,
            f.status,
            f.created_at as "friendship_created_at!: DateTime<Utc>",
            f.updated_at as "friendship_updated_at!: DateTime<Utc>",
            u.id as "counterpart_id?",
            u.username as "counterpart_username?",
            u.avatar as "counterpart_avatar?",
            u.is_online as "counterpart_is_online?: bool",
            u.public_key as "counterpart_public_key?",
            u.bio as "counterpart_bio?",
            u.tag as "counterpart_tag?",
            u.status_message as "counterpart_status_message?",
            u.location as "counterpart_location?"
        FROM friendships f
        LEFT JOIN users u
            ON u.id = CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
        WHERE f.id = ? AND (f.user_a_id = ? OR f.user_b_id = ?)
        "#,
        user_id,
        friendship_id,
        user_id,
        user_id,
    )
    .fetch_optional(pool)
    .await?;

    let result = row.map(|row| {
        let friendship = Friendship {
            id: row.friendship_id,
            user_a_id: row.user_a_id,
            user_b_id: row.user_b_id,
            status: row.status,
            created_at: row.friendship_created_at,
            updated_at: row.friendship_updated_at,
        };

        let counterpart = row.counterpart_id.map(|counterpart_id| User {
            id: counterpart_id,
            username: row.counterpart_username.unwrap_or_default(),
            avatar: row.counterpart_avatar.unwrap_or_default(),
            is_online: row.counterpart_is_online.unwrap_or(false),
            public_key: row.counterpart_public_key,
            bio: row.counterpart_bio,
            tag: row.counterpart_tag,
            status_message: row.counterpart_status_message,
            location: row.counterpart_location,
        });

        FriendshipWithProfile {
            friendship,
            counterpart,
        }
    });

    Ok(result)
}

pub async fn delete_friendship(
    pool: &Pool<Sqlite>,
    friendship_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM friendships WHERE id = ?", friendship_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_friendship_by_id(
    pool: &Pool<Sqlite>,
    friendship_id: &str,
) -> Result<Option<Friendship>, sqlx::Error> {
    let friendship = sqlx::query_as!(Friendship,
        "SELECT id, user_a_id, user_b_id, status, created_at as \"created_at!: DateTime<Utc>\", updated_at as \"updated_at!: DateTime<Utc>\" FROM friendships WHERE id = ?",
        friendship_id,
    )
    .fetch_optional(pool)
    .await?;
    Ok(friendship)
}

fn bool_from_i64(value: i64) -> bool {
    value != 0
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerMetadataUpdate {
    pub name: Option<String>,
    pub icon_url: Option<Option<String>>,
    pub description: Option<Option<String>>,
    pub default_channel_id: Option<Option<String>>,
    pub allow_invites: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerModerationUpdate {
    pub moderation_level: Option<Option<String>>,
    pub explicit_content_filter: Option<bool>,
    pub transparent_edits: Option<bool>,
    pub deleted_message_display: Option<String>,
    pub read_receipts_enabled: Option<bool>,
}

pub async fn insert_server(pool: &Pool<Sqlite>, server: &Server) -> Result<(), sqlx::Error> {
    let created_at_str = server.created_at.to_rfc3339();
    sqlx::query!(
        "INSERT INTO servers (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)",
        server.id,
        server.name,
        server.owner_id,
        created_at_str,
    )
    .execute(pool)
    .await?;

    let mut metadata_update = ServerMetadataUpdate::default();
    let mut has_metadata_updates = false;
    if server.icon_url.is_some() {
        metadata_update.icon_url = Some(server.icon_url.clone());
        has_metadata_updates = true;
    }
    if let Some(description) = server.description.clone() {
        metadata_update.description = Some(Some(description));
        has_metadata_updates = true;
    }
    if let Some(default_channel_id) = server.default_channel_id.clone() {
        metadata_update.default_channel_id = Some(Some(default_channel_id));
        has_metadata_updates = true;
    }
    if let Some(allow_invites) = server.allow_invites {
        metadata_update.allow_invites = Some(allow_invites);
        has_metadata_updates = true;
    }

    if has_metadata_updates {
        update_server_metadata(pool, &server.id, &metadata_update).await?;
    }

    let mut moderation_update = ServerModerationUpdate::default();
    let mut has_moderation_updates = false;
    if let Some(level) = server.moderation_level.clone() {
        moderation_update.moderation_level = Some(Some(level));
        has_moderation_updates = true;
    }
    if let Some(explicit_content_filter) = server.explicit_content_filter {
        moderation_update.explicit_content_filter = Some(explicit_content_filter);
        has_moderation_updates = true;
    }
    if let Some(transparent_edits) = server.transparent_edits {
        moderation_update.transparent_edits = Some(transparent_edits);
        has_moderation_updates = true;
    }
    if let Some(deleted_message_display) = server.deleted_message_display.clone() {
        moderation_update.deleted_message_display = Some(deleted_message_display);
        has_moderation_updates = true;
    }
    if let Some(read_receipts_enabled) = server.read_receipts_enabled {
        moderation_update.read_receipts_enabled = Some(read_receipts_enabled);
        has_moderation_updates = true;
    }

    if has_moderation_updates {
        update_server_moderation(pool, &server.id, &moderation_update).await?;
    }

    Ok(())
}

pub async fn update_server_metadata(
    pool: &Pool<Sqlite>,
    server_id: &str,
    update: &ServerMetadataUpdate,
) -> Result<(), sqlx::Error> {
    let mut builder = QueryBuilder::<Sqlite>::new("UPDATE servers SET ");
    let mut has_updates = false;
    {
        let mut separated = builder.separated(", ");
        if let Some(name) = &update.name {
            has_updates = true;
            separated.push("name = ").push_bind(name);
        }
        if let Some(icon_url) = &update.icon_url {
            has_updates = true;
            separated.push("icon_url = ").push_bind(icon_url);
        }
        if let Some(description) = &update.description {
            has_updates = true;
            separated.push("description = ").push_bind(description);
        }
        if let Some(default_channel_id) = &update.default_channel_id {
            has_updates = true;
            separated
                .push("default_channel_id = ")
                .push_bind(default_channel_id);
        }
        if let Some(allow_invites) = update.allow_invites {
            has_updates = true;
            separated.push("allow_invites = ").push_bind(allow_invites);
        }
    }

    if !has_updates {
        return Ok(());
    }

    builder.push(" WHERE id = ").push_bind(server_id);
    builder.build().execute(pool).await?;
    Ok(())
}

pub async fn update_server_moderation(
    pool: &Pool<Sqlite>,
    server_id: &str,
    update: &ServerModerationUpdate,
) -> Result<(), sqlx::Error> {
    let mut builder = QueryBuilder::<Sqlite>::new("UPDATE servers SET ");
    let mut has_updates = false;
    {
        let mut separated = builder.separated(", ");
        if let Some(level) = &update.moderation_level {
            has_updates = true;
            separated.push("moderation_level = ").push_bind(level);
        }
        if let Some(explicit_content_filter) = update.explicit_content_filter {
            has_updates = true;
            separated
                .push("explicit_content_filter = ")
                .push_bind(explicit_content_filter);
        }
        if let Some(transparent_edits) = update.transparent_edits {
            has_updates = true;
            separated
                .push("transparent_edits = ")
                .push_bind(transparent_edits);
        }
        if let Some(deleted_message_display) = update.deleted_message_display.as_ref() {
            has_updates = true;
            separated
                .push("deleted_message_display = ")
                .push_bind(deleted_message_display);
        }
        if let Some(read_receipts_enabled) = update.read_receipts_enabled {
            has_updates = true;
            separated
                .push("read_receipts_enabled = ")
                .push_bind(read_receipts_enabled);
        }
    }

    if !has_updates {
        return Ok(());
    }

    builder.push(" WHERE id = ").push_bind(server_id);
    builder.build().execute(pool).await?;
    Ok(())
}

pub async fn get_all_servers(
    pool: &Pool<Sqlite>,
    current_user_id: &str,
) -> Result<Vec<Server>, sqlx::Error> {
    #[derive(FromRow)]
    struct ServerRow {
        id: String,
        name: String,
        owner_id: String,
        created_at: String,
        icon_url: Option<String>,
        description: Option<String>,
        default_channel_id: Option<String>,
        allow_invites: i64,
        moderation_level: Option<String>,
        explicit_content_filter: i64,
        transparent_edits: i64,
        deleted_message_display: String,
        read_receipts_enabled: Option<i64>,
    }

    let server_rows = sqlx::query_as!(
        ServerRow,
        r#"
        SELECT
            s.id,
            s.name,
            s.owner_id,
            s.created_at,
            s.icon_url,
            s.description,
            s.default_channel_id,
            s.allow_invites as "allow_invites!: i64",
            s.moderation_level,
            s.explicit_content_filter as "explicit_content_filter!: i64",
            s.transparent_edits as "transparent_edits!: i64",
            s.deleted_message_display,
            s.read_receipts_enabled as "read_receipts_enabled?: i64"
        FROM servers s
        JOIN server_members sm ON s.id = sm.server_id
        WHERE sm.user_id = ?
        "#,
        current_user_id
    )
    .fetch_all(pool)
    .await?;

    let server_ids: Vec<String> = server_rows.iter().map(|s| s.id.clone()).collect();

    let channels_map = get_channels_for_servers(pool, &server_ids).await?;
    let categories_map = get_channel_categories_for_servers(pool, &server_ids).await?;
    let members_map = get_members_for_servers(pool, &server_ids).await?;
    let invites_map = get_invites_for_servers(pool, &server_ids).await?;
    let roles_map = get_roles_for_servers(pool, &server_ids).await?;

    let mut servers: Vec<Server> = Vec::new();
    for server_row in server_rows {
        let created_at = parse_timestamp(&server_row.created_at)?;
        let channels = channels_map
            .get(&server_row.id)
            .cloned()
            .unwrap_or_default();
        let members = members_map.get(&server_row.id).cloned().unwrap_or_default();
        let categories = categories_map
            .get(&server_row.id)
            .cloned()
            .unwrap_or_default();
        let invites = invites_map.get(&server_row.id).cloned().unwrap_or_default();
        let roles = roles_map.get(&server_row.id).cloned().unwrap_or_default();
        servers.push(Server {
            id: server_row.id,
            name: server_row.name,
            owner_id: server_row.owner_id,
            created_at,
            icon_url: server_row.icon_url,
            description: server_row.description,
            default_channel_id: server_row.default_channel_id,
            allow_invites: Some(bool_from_i64(server_row.allow_invites)),
            moderation_level: server_row.moderation_level,
            explicit_content_filter: Some(bool_from_i64(server_row.explicit_content_filter)),
            transparent_edits: Some(bool_from_i64(server_row.transparent_edits)),
            deleted_message_display: Some(server_row.deleted_message_display.clone()),
            read_receipts_enabled: server_row.read_receipts_enabled.map(bool_from_i64),
            channels,
            categories,
            members,
            roles,
            invites,
        });
    }

    Ok(servers)
}

pub async fn delete_server(pool: &Pool<Sqlite>, server_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM servers WHERE id = ?", server_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_server_by_id(pool: &Pool<Sqlite>, server_id: &str) -> Result<Server, sqlx::Error> {
    #[derive(FromRow)]
    struct ServerRow {
        id: String,
        name: String,
        owner_id: String,
        created_at: String,
        icon_url: Option<String>,
        description: Option<String>,
        default_channel_id: Option<String>,
        allow_invites: i64,
        moderation_level: Option<String>,
        explicit_content_filter: i64,
        transparent_edits: i64,
        deleted_message_display: String,
        read_receipts_enabled: Option<i64>,
    }

    let server_row = sqlx::query_as!(
        ServerRow,
        r#"
        SELECT
            id,
            name,
            owner_id,
            created_at,
            icon_url,
            description,
            default_channel_id,
            allow_invites as "allow_invites!: i64",
            moderation_level,
            explicit_content_filter as "explicit_content_filter!: i64",
            transparent_edits as "transparent_edits!: i64",
            deleted_message_display,
            read_receipts_enabled as "read_receipts_enabled?: i64"
        FROM servers
        WHERE id = ?
        "#,
        server_id
    )
    .fetch_one(pool)
    .await?;

    let created_at = parse_timestamp(&server_row.created_at)?;

    let server_ids = vec![server_row.id.clone()];

    let channels_map = get_channels_for_servers(pool, &server_ids).await?;
    let categories_map = get_channel_categories_for_servers(pool, &server_ids).await?;
    let members_map = get_members_for_servers(pool, &server_ids).await?;
    let invites_map = get_invites_for_servers(pool, &server_ids).await?;
    let roles_map = get_roles_for_servers(pool, &server_ids).await?;

    let channels = channels_map
        .get(&server_row.id)
        .cloned()
        .unwrap_or_default();
    let members = members_map.get(&server_row.id).cloned().unwrap_or_default();
    let categories = categories_map
        .get(&server_row.id)
        .cloned()
        .unwrap_or_default();
    let invites = invites_map.get(&server_row.id).cloned().unwrap_or_default();
    let roles = roles_map.get(&server_row.id).cloned().unwrap_or_default();

    Ok(Server {
        id: server_row.id,
        name: server_row.name,
        owner_id: server_row.owner_id,
        created_at,
        icon_url: server_row.icon_url,
        description: server_row.description,
        default_channel_id: server_row.default_channel_id,
        allow_invites: Some(bool_from_i64(server_row.allow_invites)),
        moderation_level: server_row.moderation_level,
        explicit_content_filter: Some(bool_from_i64(server_row.explicit_content_filter)),
        transparent_edits: Some(bool_from_i64(server_row.transparent_edits)),
        deleted_message_display: Some(server_row.deleted_message_display.clone()),
        read_receipts_enabled: server_row.read_receipts_enabled.map(bool_from_i64),
        channels,
        categories,
        members,
        roles,
        invites,
    })
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

    if let Some(row) = row {
        let event: ServerEvent = row.try_into()?;
        Ok(Some(event))
    } else {
        Ok(None)
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

    let mut events = Vec::with_capacity(rows.len());
    for row in rows {
        let event: ServerEvent = row.try_into()?;
        events.push(event);
    }
    Ok(events)
}

pub async fn update_server_event(
    pool: &Pool<Sqlite>,
    event_id: &str,
    patch: ServerEventPatch,
) -> Result<ServerEvent, sqlx::Error> {
    let mut builder = QueryBuilder::<Sqlite>::new("UPDATE server_events SET ");
    let mut has_updates = false;

    let push_comma = |builder: &mut QueryBuilder<Sqlite>, has_updates: &mut bool| {
        if *has_updates {
            builder.push(", ");
        }
        *has_updates = true;
    };

    if let Some(title) = patch.title {
        push_comma(&mut builder, &mut has_updates);
        builder.push("title = ");
        builder.push_bind(title);
    }
    if let Some(description) = patch.description {
        push_comma(&mut builder, &mut has_updates);
        builder.push("description = ");
        builder.push_bind(description);
    }
    if let Some(channel_id) = patch.channel_id {
        push_comma(&mut builder, &mut has_updates);
        builder.push("channel_id = ");
        builder.push_bind(channel_id);
    }
    if let Some(scheduled_for) = patch.scheduled_for {
        push_comma(&mut builder, &mut has_updates);
        builder.push("scheduled_for = ");
        builder.push_bind(scheduled_for.to_rfc3339());
    }
    if let Some(status) = patch.status {
        push_comma(&mut builder, &mut has_updates);
        builder.push("status = ");
        builder.push_bind(status);
    }
    if let Some(cancelled_at) = patch.cancelled_at {
        push_comma(&mut builder, &mut has_updates);
        builder.push("cancelled_at = ");
        builder.push_bind(cancelled_at.map(|dt| dt.to_rfc3339()));
    }

    if !has_updates {
        return get_server_event_by_id(pool, event_id)
            .await?
            .ok_or_else(|| sqlx::Error::RowNotFound);
    }

    builder.push(" WHERE id = ");
    builder.push_bind(event_id);
    builder.push(
        " RETURNING id, server_id, title, description, channel_id, scheduled_for, created_by, created_at, status, cancelled_at",
    );

    let row: ServerEventRow = builder
        .build_query_as::<ServerEventRow>()
        .fetch_one(pool)
        .await?;
    row.try_into()
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

pub async fn insert_message(pool: &Pool<Sqlite>, message: &Message) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    let timestamp_str = message.timestamp.to_rfc3339();
    let edited_at_str = message.edited_at.map(|value| value.to_rfc3339());
    let expires_at_str = message.expires_at.map(|value| value.to_rfc3339());
    let reply_to_id = message.reply_to_message_id.clone();
    let reply_snapshot_author = message.reply_snapshot_author.clone();
    let reply_snapshot_snippet = message.reply_snapshot_snippet.clone();
    let reply_to_id_ref = reply_to_id.as_deref();
    let reply_snapshot_author_ref = reply_snapshot_author.as_deref();
    let reply_snapshot_snippet_ref = reply_snapshot_snippet.as_deref();
    sqlx::query!(
        "INSERT INTO messages (id, chat_id, sender_id, content, timestamp, read, pinned, reply_to_message_id, reply_snapshot_author, reply_snapshot_snippet, edited_at, edited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        message.id,
        message.chat_id,
        message.sender_id,
        message.content,
        timestamp_str,
        message.read,
        message.pinned,
        reply_to_id_ref,
        reply_snapshot_author_ref,
        reply_snapshot_snippet_ref,
        edited_at_str,
        message.edited_by,
        expires_at_str,
    )
    .execute(&mut *tx)
    .await?;

    for attachment in &message.attachments {
        if attachment.size > i64::MAX as u64 {
            return Err(sqlx::Error::Protocol("attachment size too large".into()));
        }
        let size_i64 = attachment.size as i64;

        let data = attachment.data.clone().ok_or_else(|| {
            sqlx::Error::Protocol("attachment is missing binary data for insert".into())
        })?;

        sqlx::query!(
            "INSERT INTO attachments (id, message_id, name, content_type, size, data) VALUES (?, ?, ?, ?, ?, ?)",
            attachment.id,
            attachment.message_id,
            attachment.name,
            attachment.content_type,
            size_i64,
            data,
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
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

    let mut chats: Vec<GroupChat> = Vec::with_capacity(chat_rows.len());
    let mut chat_ids: Vec<String> = Vec::with_capacity(chat_rows.len());

    for row in chat_rows {
        let created_at = DateTime::parse_from_rfc3339(&row.created_at)
            .map(|dt| dt.with_timezone(&Utc))
            .map_err(|e| sqlx::Error::Decode(format!("Failed to parse timestamp: {}", e).into()))?;
        chats.push(GroupChat {
            id: row.id.clone(),
            name: row.name,
            owner_id: row.owner_id,
            created_at,
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
    let member_rows = query_builder
        .build_query_as::<MemberRow>()
        .fetch_all(pool)
        .await?;

    let mut members_by_chat: HashMap<String, Vec<GroupChatMember>> = HashMap::new();
    for row in member_rows {
        let added_at = DateTime::parse_from_rfc3339(&row.added_at)
            .map(|dt| dt.with_timezone(&Utc))
            .map_err(|e| sqlx::Error::Decode(format!("Failed to parse timestamp: {}", e).into()))?;
        members_by_chat
            .entry(row.group_chat_id.clone())
            .or_default()
            .push(GroupChatMember {
                group_chat_id: row.group_chat_id,
                user_id: row.user_id,
                added_at,
            });
    }

    let mut records = Vec::with_capacity(chats.len());
    for chat in chats {
        let members = members_by_chat.remove(&chat.id).unwrap_or_default();
        let member_ids = members
            .iter()
            .map(|member| member.user_id.clone())
            .collect();
        records.push(GroupChatRecord { chat, member_ids });
    }

    Ok(records)
}

pub async fn is_group_chat_member(
    pool: &Pool<Sqlite>,
    group_chat_id: &str,
    user_id: &str,
) -> Result<bool, sqlx::Error> {
    let count: i64 = sqlx::query_scalar!(
        "SELECT COUNT(1) as \"count!: i64\" FROM group_chat_members WHERE group_chat_id = ? AND user_id = ?",
        group_chat_id,
        user_id
    )
    .fetch_one(pool)
    .await?;

    Ok(count > 0)
}

pub async fn update_group_chat_name(
    pool: &Pool<Sqlite>,
    group_chat_id: &str,
    name: Option<String>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE group_chats SET name = ? WHERE id = ?",
        name,
        group_chat_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_group_chat_record(
    pool: &Pool<Sqlite>,
    group_chat_id: &str,
) -> Result<Option<GroupChatRecord>, sqlx::Error> {
    #[derive(FromRow)]
    struct GroupChatRow {
        id: String,
        name: Option<String>,
        owner_id: String,
        created_at: String,
    }

    let chat_row = sqlx::query_as!(
        GroupChatRow,
        r#"
        SELECT id, name, owner_id, created_at as "created_at: String"
        FROM group_chats
        WHERE id = ?
        "#,
        group_chat_id,
    )
    .fetch_optional(pool)
    .await?;

    let Some(row) = chat_row else {
        return Ok(None);
    };

    let created_at = parse_timestamp(&row.created_at)?;

    #[derive(FromRow)]
    struct MemberRow {
        user_id: String,
    }

    let member_rows = sqlx::query_as!(
        MemberRow,
        "SELECT user_id FROM group_chat_members WHERE group_chat_id = ? ORDER BY added_at ASC",
        group_chat_id,
    )
    .fetch_all(pool)
    .await?;

    let member_ids = member_rows.into_iter().map(|row| row.user_id).collect();

    Ok(Some(GroupChatRecord {
        chat: GroupChat {
            id: row.id,
            name: row.name,
            owner_id: row.owner_id,
            created_at,
        },
        member_ids,
    }))
}

pub async fn remove_group_chat_member(
    pool: &Pool<Sqlite>,
    group_chat_id: &str,
    user_id: &str,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let delete_result = sqlx::query!(
        "DELETE FROM group_chat_members WHERE group_chat_id = ? AND user_id = ?",
        group_chat_id,
        user_id
    )
    .execute(&mut *tx)
    .await?;

    if delete_result.rows_affected() == 0 {
        tx.rollback().await?;
        return Ok(false);
    }

    let remaining: i64 = sqlx::query_scalar!(
        "SELECT COUNT(1) as \"count!: i64\" FROM group_chat_members WHERE group_chat_id = ?",
        group_chat_id
    )
    .fetch_one(&mut *tx)
    .await?;

    if remaining == 0 {
        sqlx::query!("DELETE FROM group_chats WHERE id = ?", group_chat_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(true)
}

pub async fn add_group_chat_members(
    pool: &Pool<Sqlite>,
    group_chat_id: &str,
    member_ids: &[String],
) -> Result<Vec<String>, sqlx::Error> {
    if member_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut tx = pool.begin().await?;
    let timestamp = Utc::now().to_rfc3339();
    let mut added = Vec::new();

    for member_id in member_ids {
        let result = sqlx::query!(
            "INSERT OR IGNORE INTO group_chat_members (group_chat_id, user_id, added_at) VALUES (?, ?, ?)",
            group_chat_id,
            member_id,
            timestamp
        )
        .execute(&mut *tx)
        .await?;

        if result.rows_affected() > 0 {
            added.push(member_id.clone());
        }
    }

    tx.commit().await?;
    Ok(added)
}

pub async fn delete_message(pool: &Pool<Sqlite>, message_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM messages WHERE id = ?", message_id)
        .execute(pool)
        .await?;
    Ok(())
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
            Some(value) => Some(
                DateTime::parse_from_rfc3339(&value)
                    .map(|dt| dt.with_timezone(&Utc))
                    .map_err(|e| {
                        sqlx::Error::Decode(
                            format!("Failed to parse edited_at timestamp: {}", e).into(),
                        )
                    })?,
            ),
            None => None,
        };
        let expires_at = match row.expires_at {
            Some(value) => Some(
                DateTime::parse_from_rfc3339(&value)
                    .map(|dt| dt.with_timezone(&Utc))
                    .map_err(|e| {
                        sqlx::Error::Decode(
                            format!("Failed to parse expires_at timestamp: {}", e).into(),
                        )
                    })?,
            ),
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
                    data: None,
                });
        }

        for message in &mut messages {
            if let Some(mut attachments) = attachments_map.remove(&message.id) {
                attachments.sort_by(|a, b| a.id.cmp(&b.id));
                message.attachments = attachments;
            }
        }

        #[derive(FromRow)]
        struct ReactionRow {
            message_id: String,
            user_id: String,
            emoji: String,
        }

        let mut reactions_query = QueryBuilder::<Sqlite>::new(
            "SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (",
        );
        {
            let mut separated = reactions_query.separated(", ");
            for message_id in &message_ids {
                separated.push_bind(message_id);
            }
        }
        reactions_query.push(")");
        let reaction_rows = reactions_query
            .build_query_as::<ReactionRow>()
            .fetch_all(pool)
            .await?;

        let mut reaction_map: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();
        for row in reaction_rows {
            let entry = reaction_map
                .entry(row.message_id)
                .or_insert_with(HashMap::new);
            entry
                .entry(row.emoji)
                .or_insert_with(Vec::new)
                .push(row.user_id);
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
    let mut builder = QueryBuilder::<Sqlite>::new(
        "SELECT id, chat_id, sender_id, content, timestamp, read, pinned, reply_to_message_id, reply_snapshot_author, reply_snapshot_snippet, edited_at, edited_by, expires_at FROM messages WHERE chat_id = ?");
    builder.push_bind(chat_id);

    if let Some(pinned) = pinned {
        builder.push(" AND pinned = ");
        builder.push_bind(pinned);
    }

    if let Some(ids) = sender_ids {
        let valid_sender_ids: Vec<&String> =
            ids.iter().filter(|value| !value.trim().is_empty()).collect();
        if !valid_sender_ids.is_empty() {
            builder.push(" AND sender_id IN (");
            {
                let mut separated = builder.separated(", ");
                for id in valid_sender_ids {
                    separated.push_bind(id);
                }
            }
            builder.push(")");
        }
    }

    if let Some(query) = query {
        let trimmed = query.trim();
        if !trimmed.is_empty() {
            builder.push(" AND LOWER(content) LIKE ");
            let pattern = format!("%{}%", trimmed.to_lowercase());
            builder.push_bind(pattern);
        }
    }

    if let Some(before) = before {
        builder.push(" AND timestamp < ");
        builder.push_bind(before);
    }

    if let Some(after) = after {
        builder.push(" AND timestamp > ");
        builder.push_bind(after);
    }

    builder.push(" ORDER BY timestamp DESC LIMIT ");
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

pub async fn add_server_member(
    pool: &Pool<Sqlite>,
    server_id: &str,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES (?, ?)",
        server_id,
        user_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn server_has_member(
    pool: &Pool<Sqlite>,
    server_id: &str,
    user_id: &str,
) -> Result<bool, sqlx::Error> {
    let count: i64 = sqlx::query_scalar!(
        "SELECT COUNT(1) as \"count!: i64\" FROM server_members WHERE server_id = ? AND user_id = ?",
        server_id,
        user_id
    )
    .fetch_one(pool)
    .await?;

    Ok(count > 0)
}

pub async fn remove_server_member(
    pool: &Pool<Sqlite>,
    server_id: &str,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM server_members WHERE server_id = ? AND user_id = ?",
        server_id,
        user_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_server_members(
    pool: &Pool<Sqlite>,
    server_id: &str,
) -> Result<Vec<User>, sqlx::Error> {
    let members = sqlx::query_as!(User,
        "SELECT u.id, u.username, u.avatar, u.is_online, u.public_key, u.bio, u.tag, u.status_message, u.location FROM users u JOIN server_members sm ON u.id = sm.user_id WHERE sm.server_id = ?",
        server_id
    )
    .fetch_all(pool)
    .await?;
    Ok(members)
}

pub async fn get_members_for_servers(
    pool: &Pool<Sqlite>,
    server_ids: &[String],
) -> Result<HashMap<String, Vec<User>>, sqlx::Error> {
    let mut members_map: HashMap<String, Vec<User>> = HashMap::new();

    if server_ids.is_empty() {
        return Ok(members_map);
    }

    #[derive(FromRow)]
    struct UserWithServerId {
        id: String,
        username: String,
        avatar: String,
        is_online: bool,
        public_key: Option<String>,
        bio: Option<String>,
        tag: Option<String>,
        status_message: Option<String>,
        location: Option<String>,
        server_id: String,
    }

    let query = format!("SELECT u.id, u.username, u.avatar, u.is_online, u.public_key, u.bio, u.tag, u.status_message, u.location, sm.server_id FROM users u JOIN server_members sm ON u.id = sm.user_id WHERE sm.server_id IN ({})",
        server_ids.iter().map(|_| "?").collect::<Vec<&str>>().join(", ")
    );

    let mut q = sqlx::query_as::<_, UserWithServerId>(&query);
    for id in server_ids {
        q = q.bind(id);
    }

    let members_with_server_id = q.fetch_all(pool).await?;

    for row in members_with_server_id {
        let member = User {
            id: row.id,
            username: row.username,
            avatar: row.avatar,
            is_online: row.is_online,
            public_key: row.public_key,
            bio: row.bio,
            tag: row.tag,
            status_message: row.status_message,
            location: row.location,
        };
        members_map
            .entry(row.server_id)
            .or_insert_with(Vec::new)
            .push(member);
    }

    Ok(members_map)
}

pub async fn get_server_bans(
    pool: &Pool<Sqlite>,
    server_id: &str,
) -> Result<Vec<User>, sqlx::Error> {
    let banned_users = sqlx::query_as!(
        User,
        "SELECT u.id, u.username, u.avatar, u.is_online, u.public_key, u.bio, u.tag, u.status_message, u.location \
         FROM users u \
         INNER JOIN server_bans sb ON u.id = sb.user_id \
         WHERE sb.server_id = ? \
         ORDER BY sb.created_at DESC",
        server_id
    )
    .fetch_all(pool)
    .await?;

    Ok(banned_users)
}

pub async fn remove_server_ban(
    pool: &Pool<Sqlite>,
    server_id: &str,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM server_bans WHERE server_id = ? AND user_id = ?",
        server_id,
        user_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn add_server_ban(
    pool: &Pool<Sqlite>,
    server_id: &str,
    user_id: &str,
    reason: Option<String>,
) -> Result<(), sqlx::Error> {
    let normalized_reason = reason
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let created_at = Utc::now().to_rfc3339();
    let reason_ref = normalized_reason.as_deref();

    sqlx::query!(
        "INSERT INTO server_bans (server_id, user_id, reason, created_at) VALUES (?, ?, ?, ?) \
         ON CONFLICT(server_id, user_id) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at",
        server_id,
        user_id,
        reason_ref,
        created_at
    )
    .execute(pool)
    .await?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
struct ServerRoleRow {
    id: String,
    server_id: String,
    name: String,
    color: String,
    hoist: i64,
    mentionable: i64,
    permissions: String,
}

impl ServerRoleRow {
    fn into_role(self) -> Result<(String, Role), sqlx::Error> {
        let permissions: HashMap<String, bool> = serde_json::from_str(&self.permissions)
            .map_err(|e| sqlx::Error::Decode(Box::new(e)))?;

        Ok((
            self.server_id,
            Role {
                id: self.id,
                name: self.name,
                color: self.color,
                hoist: bool_from_i64(self.hoist),
                mentionable: bool_from_i64(self.mentionable),
                permissions,
                member_ids: Vec::new(),
            },
        ))
    }
}

pub async fn get_roles_for_servers(
    pool: &Pool<Sqlite>,
    server_ids: &[String],
) -> Result<HashMap<String, Vec<Role>>, sqlx::Error> {
    let mut roles_map: HashMap<String, Vec<Role>> = HashMap::new();
    if server_ids.is_empty() {
        return Ok(roles_map);
    }

    let placeholders = server_ids
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!(
        "SELECT id, server_id, name, color, hoist, mentionable, permissions FROM server_roles WHERE server_id IN ({})",
        placeholders
    );

    let mut builder = sqlx::query_as::<_, ServerRoleRow>(&query);
    for id in server_ids {
        builder = builder.bind(id);
    }

    let rows = builder.fetch_all(pool).await?;

    if rows.is_empty() {
        return Ok(roles_map);
    }

    let role_ids: Vec<String> = rows.iter().map(|row| row.id.clone()).collect();

    #[derive(FromRow)]
    struct RoleAssignmentRow {
        role_id: String,
        user_id: String,
    }

    let assignments = if role_ids.is_empty() {
        HashMap::<String, Vec<String>>::new()
    } else {
        let placeholders = role_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let query = format!(
            "SELECT role_id, user_id FROM server_role_assignments WHERE role_id IN ({})",
            placeholders
        );
        let mut assignment_builder = sqlx::query_as::<_, RoleAssignmentRow>(&query);
        for role_id in &role_ids {
            assignment_builder = assignment_builder.bind(role_id);
        }
        let rows = assignment_builder.fetch_all(pool).await?;
        let mut map: HashMap<String, Vec<String>> = HashMap::new();
        for row in rows {
            map.entry(row.role_id)
                .or_insert_with(Vec::new)
                .push(row.user_id);
        }
        map
    };

    for row in rows {
        let (server_id, mut role) = row.into_role()?;
        if let Some(member_ids) = assignments.get(&role.id) {
            role.member_ids = member_ids.clone();
        }
        roles_map
            .entry(server_id)
            .or_insert_with(Vec::new)
            .push(role);
    }

    Ok(roles_map)
}

pub async fn replace_server_roles(
    pool: &Pool<Sqlite>,
    server_id: &str,
    roles: &[Role],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query!(
        "DELETE FROM server_role_assignments WHERE server_id = ?",
        server_id
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query!("DELETE FROM server_roles WHERE server_id = ?", server_id)
        .execute(&mut *tx)
        .await?;

    for role in roles {
        let permissions_json = serde_json::to_string(&role.permissions)
            .map_err(|e| sqlx::Error::Decode(Box::new(e)))?;

        sqlx::query!(
            "INSERT INTO server_roles (id, server_id, name, color, hoist, mentionable, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)",
            role.id,
            server_id,
            role.name,
            role.color,
            role.hoist,
            role.mentionable,
            permissions_json,
        )
        .execute(&mut *tx)
        .await?;

        for member_id in &role.member_ids {
            sqlx::query!(
                "INSERT INTO server_role_assignments (server_id, role_id, user_id) VALUES (?, ?, ?)",
                server_id,
                role.id,
                member_id
            )
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ChannelDisplayPreference {
    pub user_id: String,
    pub channel_id: String,
    pub hide_member_names: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
struct ServerInviteRow {
    id: String,
    server_id: String,
    code: String,
    created_by: String,
    created_at: String,
    expires_at: Option<String>,
    max_uses: Option<i64>,
    uses: i64,
}

impl ServerInviteRow {
    fn into_invite(self) -> Result<ServerInvite, sqlx::Error> {
        Ok(ServerInvite {
            id: self.id,
            server_id: self.server_id,
            code: self.code,
            created_by: self.created_by,
            created_at: parse_timestamp(&self.created_at)?,
            expires_at: parse_optional_timestamp(self.expires_at)?,
            max_uses: self.max_uses,
            uses: self.uses,
        })
    }
}

#[derive(Debug)]
pub enum RedeemServerInviteError {
    InviteNotFound,
    InviteExpired,
    InviteMaxedOut,
    Database(sqlx::Error),
}

impl fmt::Display for RedeemServerInviteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RedeemServerInviteError::InviteNotFound => write!(f, "Invite not found"),
            RedeemServerInviteError::InviteExpired => write!(f, "Invite has expired"),
            RedeemServerInviteError::InviteMaxedOut => {
                write!(f, "Invite has reached its maximum number of uses")
            }
            RedeemServerInviteError::Database(err) => write!(f, "{err}"),
        }
    }
}

impl std::error::Error for RedeemServerInviteError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            RedeemServerInviteError::Database(err) => Some(err),
            _ => None,
        }
    }
}

impl From<sqlx::Error> for RedeemServerInviteError {
    fn from(value: sqlx::Error) -> Self {
        RedeemServerInviteError::Database(value)
    }
}

pub struct RedeemedServerInvite {
    pub server: Server,
    pub already_member: bool,
}

pub async fn redeem_server_invite_by_code(
    pool: &Pool<Sqlite>,
    invite_code: &str,
    user_id: &str,
) -> Result<RedeemedServerInvite, RedeemServerInviteError> {
    let mut tx = pool.begin().await?;

    let invite_row = sqlx::query_as!(
        ServerInviteRow,
        "SELECT id, server_id, code, created_by, created_at, expires_at, max_uses, uses FROM server_invites WHERE code = ?",
        invite_code
    )
    .fetch_optional(&mut *tx)
    .await?;

    let invite_row = match invite_row {
        Some(row) => row,
        None => {
            tx.rollback().await.ok();
            return Err(RedeemServerInviteError::InviteNotFound);
        }
    };

    let invite = invite_row.clone().into_invite()?;

    let already_member: bool = sqlx::query_scalar!(
        "SELECT COUNT(1) as \"count!: i64\" FROM server_members WHERE server_id = ? AND user_id = ?",
        invite.server_id,
        user_id
    )
    .fetch_one(&mut *tx)
    .await?
        > 0;

    if !already_member {
        if let Some(expires_at) = invite.expires_at {
            if expires_at < Utc::now() {
                tx.rollback().await.ok();
                return Err(RedeemServerInviteError::InviteExpired);
            }
        }

        if let Some(max_uses) = invite.max_uses {
            if invite.uses >= max_uses {
                tx.rollback().await.ok();
                return Err(RedeemServerInviteError::InviteMaxedOut);
            }
        }

        sqlx::query!(
            "INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES (?, ?)",
            invite.server_id,
            user_id
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query!(
            "UPDATE server_invites SET uses = uses + 1 WHERE id = ?",
            invite.id
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let server = get_server_by_id(pool, &invite.server_id).await?;

    Ok(RedeemedServerInvite {
        server,
        already_member,
    })
}

pub async fn get_invites_for_servers(
    pool: &Pool<Sqlite>,
    server_ids: &[String],
) -> Result<HashMap<String, Vec<ServerInvite>>, sqlx::Error> {
    let mut invites_map: HashMap<String, Vec<ServerInvite>> = HashMap::new();
    if server_ids.is_empty() {
        return Ok(invites_map);
    }

    let placeholders = server_ids
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!(
        "SELECT id, server_id, code, created_by, created_at, expires_at, max_uses, uses FROM server_invites WHERE server_id IN ({})",
        placeholders
    );

    let mut builder = sqlx::query_as::<_, ServerInviteRow>(&query);
    for id in server_ids {
        builder = builder.bind(id);
    }

    let rows = builder.fetch_all(pool).await?;

    for row in rows {
        let invite = row.into_invite()?;
        invites_map
            .entry(invite.server_id.clone())
            .or_insert_with(Vec::new)
            .push(invite);
    }

    Ok(invites_map)
}

pub async fn get_server_invite_by_id(
    pool: &Pool<Sqlite>,
    invite_id: &str,
) -> Result<Option<ServerInvite>, sqlx::Error> {
    let row = sqlx::query_as!(
        ServerInviteRow,
        "SELECT id, server_id, code, created_by, created_at, expires_at, max_uses, uses FROM server_invites WHERE id = ?",
        invite_id
    )
    .fetch_optional(pool)
    .await?;

    match row {
        Some(row) => row.into_invite().map(Some),
        None => Ok(None),
    }
}

pub async fn delete_server_invite(pool: &Pool<Sqlite>, invite_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM server_invites WHERE id = ?", invite_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn create_server_invite(
    pool: &Pool<Sqlite>,
    server_id: &str,
    created_by: &str,
    code: &str,
    created_at: &DateTime<Utc>,
    expires_at: Option<DateTime<Utc>>,
    max_uses: Option<i64>,
) -> Result<ServerInvite, sqlx::Error> {
    let invite_id = Scu128::new().to_string();
    let created_at_str = created_at.to_rfc3339();
    let expires_at_str = expires_at.map(|dt| dt.to_rfc3339());

    sqlx::query!(
        "INSERT INTO server_invites (id, server_id, code, created_by, created_at, expires_at, max_uses, uses) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
        invite_id,
        server_id,
        code,
        created_by,
        created_at_str,
        expires_at_str,
        max_uses,
    )
    .execute(pool)
    .await?;

    sqlx::query_as!(
        ServerInviteRow,
        "SELECT id, server_id, code, created_by, created_at, expires_at, max_uses, uses FROM server_invites WHERE code = ?",
        code
    )
    .fetch_one(pool)
    .await?
    .into_invite()
}

pub async fn insert_review(pool: &Pool<Sqlite>, review: &NewReview) -> Result<(), sqlx::Error> {
    let subject = review.subject.as_str().to_owned();
    let created_at = review.created_at.to_rfc3339();
    sqlx::query!(
        "INSERT INTO reviews (id, subject_type, subject_id, author_id, rating, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        review.id,
        subject,
        review.subject_id,
        review.author_id,
        review.rating,
        review.content,
        created_at,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn list_reviews_by_subject(
    pool: &Pool<Sqlite>,
    subject: ReviewSubject,
    subject_id: &str,
    limit: Option<i64>,
) -> Result<Vec<Review>, sqlx::Error> {
    let limit = limit.unwrap_or(50);
    let rows = sqlx::query_as::<_, ReviewRow>(
        "SELECT r.id, r.subject_type, r.subject_id, r.author_id, r.rating, r.content, r.created_at, u.username AS author_username, u.avatar AS author_avatar \
         FROM reviews r \
         LEFT JOIN users u ON u.id = r.author_id \
         WHERE r.subject_type = ? AND r.subject_id = ? \
         ORDER BY r.created_at DESC \
         LIMIT ?",
    )
    .bind(subject.as_str())
    .bind(subject_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(Review::try_from)
        .collect::<Result<Vec<_>, _>>()
}

pub async fn get_review_by_id(
    pool: &Pool<Sqlite>,
    review_id: &str,
) -> Result<Option<Review>, sqlx::Error> {
    let row = sqlx::query_as::<_, ReviewRow>(
        "SELECT r.id, r.subject_type, r.subject_id, r.author_id, r.rating, r.content, r.created_at, u.username AS author_username, u.avatar AS author_avatar \
         FROM reviews r \
         LEFT JOIN users u ON u.id = r.author_id \
         WHERE r.id = ?",
    )
    .bind(review_id)
    .fetch_optional(pool)
    .await?;

    row.map(Review::try_from).transpose()
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
