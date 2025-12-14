use aegis_types::AegisError;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, Sqlite};

pub use aegis_shared_types::User;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Friendship {
    pub id: String,
    pub user_a_id: String,
    pub user_b_id: String,
    pub status: String,
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
