//--- FILE: src/aep/src/database.rs ---
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite, FromRow};
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use aegis_types::AegisError;

pub use aegis_shared_types::{User, Server, Channel};

// Define migrations for the database schema
// The path is relative to the crate root (src/aep), pointing up two levels to src-tauri/migrations.
static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../migrations");

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
            _ => Err(AegisError::InvalidInput(format!("Unknown friendship status: {}", s))),
        }
    }
}



#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub chat_id: String, // friend_id or channel_id
    pub sender_id: String,
    pub content: String,
    pub timestamp: DateTime<Utc>, // ISO 8601 string
    pub read: bool,
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

pub async fn insert_friendship(pool: &Pool<Sqlite>, friendship: &Friendship) -> Result<(), sqlx::Error> {
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

pub async fn update_friendship_status(pool: &Pool<Sqlite>, friendship_id: &str, status: FriendshipStatus) -> Result<(), sqlx::Error> {
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

pub async fn get_friendship(pool: &Pool<Sqlite>, user_a_id: &str, user_b_id: &str) -> Result<Option<Friendship>, sqlx::Error> {
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

pub async fn get_all_friendships_for_user(pool: &Pool<Sqlite>, user_id: &str) -> Result<Vec<Friendship>, sqlx::Error> {
    let friendships = sqlx::query_as!(Friendship,
        "SELECT id, user_a_id, user_b_id, status, created_at as \"created_at!: DateTime<Utc>\", updated_at as \"updated_at!: DateTime<Utc>\" FROM friendships WHERE user_a_id = ? OR user_b_id = ?",
        user_id,
        user_id,
    )
    .fetch_all(pool)
    .await?;
    Ok(friendships)
}

pub async fn delete_friendship(pool: &Pool<Sqlite>, friendship_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM friendships WHERE id = ?", friendship_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_friendship_by_id(pool: &Pool<Sqlite>, friendship_id: &str) -> Result<Option<Friendship>, sqlx::Error> {
    let friendship = sqlx::query_as!(Friendship,
        "SELECT id, user_a_id, user_b_id, status, created_at as \"created_at!: DateTime<Utc>\", updated_at as \"updated_at!: DateTime<Utc>\" FROM friendships WHERE id = ?",
        friendship_id,
    )
    .fetch_optional(pool)
    .await?;
    Ok(friendship)
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
    Ok(())
}

pub async fn get_all_servers(pool: &Pool<Sqlite>, current_user_id: &str) -> Result<Vec<Server>, sqlx::Error> {
    #[derive(FromRow)]
    struct ServerRow {
        id: String,
        name: String,
        owner_id: String,
        created_at: String,
    }

    let server_rows = sqlx::query_as!(
        ServerRow,
        "SELECT s.id, s.name, s.owner_id, s.created_at FROM servers s JOIN server_members sm ON s.id = sm.server_id WHERE sm.user_id = ?",
        current_user_id
    )
    .fetch_all(pool)
    .await?;

    let server_ids: Vec<String> = server_rows.iter().map(|s| s.id.clone()).collect();

    let channels_map = get_channels_for_servers(pool, &server_ids).await?;
    let members_map = get_members_for_servers(pool, &server_ids).await?;

    let mut servers: Vec<Server> = Vec::new();
    for server_row in server_rows {
        let created_at = DateTime::parse_from_rfc3339(&server_row.created_at)
            .map(|dt| dt.with_timezone(&Utc))
            .map_err(|e| sqlx::Error::Decode(format!("Failed to parse timestamp: {}", e).into()))?;
        let channels = channels_map.get(&server_row.id).cloned().unwrap_or_default();
        let members = members_map.get(&server_row.id).cloned().unwrap_or_default();
        servers.push(Server {
            id: server_row.id,
            name: server_row.name,
            owner_id: server_row.owner_id,
            created_at,
            channels,
            members,
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
    }

    let server_row = sqlx::query_as!(
        ServerRow,
        "SELECT id, name, owner_id, created_at FROM servers WHERE id = ?",
        server_id
    )
    .fetch_one(pool)
    .await?;

    let created_at = DateTime::parse_from_rfc3339(&server_row.created_at)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| sqlx::Error::Decode(format!("Failed to parse timestamp: {}", e).into()))?;

    let server_ids = vec![server_row.id.clone()];

    let channels_map = get_channels_for_servers(pool, &server_ids).await?;
    let members_map = get_members_for_servers(pool, &server_ids).await?;

    let channels = channels_map.get(&server_row.id).cloned().unwrap_or_default();
    let members = members_map.get(&server_row.id).cloned().unwrap_or_default();

    Ok(Server {
        id: server_row.id,
        name: server_row.name,
        owner_id: server_row.owner_id,
        created_at,
        channels,
        members,
    })
}

pub async fn insert_channel(pool: &Pool<Sqlite>, channel: &Channel) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO channels (id, server_id, name, channel_type, private) VALUES (?, ?, ?, ?, ?)",
        channel.id,
        channel.server_id,
        channel.name,
        channel.channel_type,
        channel.private,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_channel_by_id(pool: &Pool<Sqlite>, channel_id: &str) -> Result<Channel, sqlx::Error> {
    sqlx::query_as!(
        Channel,
        "SELECT id, server_id, name, channel_type, private FROM channels WHERE id = ?",
        channel_id
    )
    .fetch_one(pool)
    .await
}

pub async fn get_channels_for_server(pool: &Pool<Sqlite>, server_id: &str) -> Result<Vec<Channel>, sqlx::Error> {
    let channels = sqlx::query_as!(Channel, "SELECT id, server_id, name, channel_type, private FROM channels WHERE server_id = ?", server_id)
        .fetch_all(pool)
        .await?;
    Ok(channels)
}

pub async fn get_channels_for_servers(pool: &Pool<Sqlite>, server_ids: &[String]) -> Result<HashMap<String, Vec<Channel>>, sqlx::Error> {
    let mut channels_map: HashMap<String, Vec<Channel>> = HashMap::new();

    if server_ids.is_empty() {
        return Ok(channels_map);
    }

    let query = format!("SELECT id, server_id, name, channel_type, private FROM channels WHERE server_id IN ({})",
        server_ids.iter().map(|_| "?").collect::<Vec<&str>>().join(", ")
    );

    let mut q = sqlx::query_as::<_, Channel>(&query);
    for id in server_ids {
        q = q.bind(id);
    }

    let channels = q.fetch_all(pool).await?;

    for channel in channels {
        channels_map.entry(channel.server_id.clone()).or_insert_with(Vec::new).push(channel);
    }

    Ok(channels_map)
}

pub async fn delete_channel(pool: &Pool<Sqlite>, channel_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM channels WHERE id = ?", channel_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn insert_message(pool: &Pool<Sqlite>, message: &Message) -> Result<(), sqlx::Error> {
    let timestamp_str = message.timestamp.to_rfc3339();
    sqlx::query!(
        "INSERT INTO messages (id, chat_id, sender_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)",
        message.id,
        message.chat_id,
        message.sender_id,
        message.content,
        timestamp_str,
        message.read,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_message(pool: &Pool<Sqlite>, message_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM messages WHERE id = ?", message_id)
        .execute(pool)
        .await?;
    Ok(())
}


pub async fn get_messages_for_chat(pool: &Pool<Sqlite>, chat_id: &str, limit: i64, offset: i64) -> Result<Vec<Message>, sqlx::Error> {
    #[derive(FromRow)]
    struct MessageRaw {
        id: String,
        chat_id: String,
        sender_id: String,
        content: String,
        timestamp: String,
        read: bool,
    }

    let messages_raw = sqlx::query_as!(MessageRaw, "SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?", chat_id, limit, offset)
        .fetch_all(pool)
        .await?;

    let mut messages = Vec::new();
        for m_raw in messages_raw {
            let timestamp = DateTime::parse_from_rfc3339(&m_raw.timestamp)
                .map(|dt| dt.with_timezone(&Utc))
                .map_err(|e| sqlx::Error::Decode(format!("Failed to parse timestamp: {}", e).into()))?;
            messages.push(Message {
                id: m_raw.id,
                chat_id: m_raw.chat_id,
                sender_id: m_raw.sender_id,
                content: m_raw.content,
                timestamp,
                read: m_raw.read,
            });
        }

    Ok(messages)
}

pub async fn add_server_member(pool: &Pool<Sqlite>, server_id: &str, user_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES (?, ?)", server_id, user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn remove_server_member(pool: &Pool<Sqlite>, server_id: &str, user_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM server_members WHERE server_id = ? AND user_id = ?", server_id, user_id)
        .execute(pool)
        .await?;
    Ok(())
}


pub async fn get_server_members(pool: &Pool<Sqlite>, server_id: &str) -> Result<Vec<User>, sqlx::Error> {
    let members = sqlx::query_as!(User,
        "SELECT u.id, u.username, u.avatar, u.is_online, u.public_key, u.bio, u.tag FROM users u JOIN server_members sm ON u.id = sm.user_id WHERE sm.server_id = ?",
        server_id
    )
    .fetch_all(pool)
    .await?;
    Ok(members)
}

pub async fn get_members_for_servers(pool: &Pool<Sqlite>, server_ids: &[String]) -> Result<HashMap<String, Vec<User>>, sqlx::Error> {
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
        server_id: String,
    }

    let query = format!("SELECT u.id, u.username, u.avatar, u.is_online, u.public_key, u.bio, u.tag, sm.server_id FROM users u JOIN server_members sm ON u.id = sm.user_id WHERE sm.server_id IN ({})",
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
        };
        members_map.entry(row.server_id).or_insert_with(Vec::new).push(member);
    }

    Ok(members_map)
}
