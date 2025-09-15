use sqlx::{Pool, Sqlite};
use aegis_shared_types::User;
use aegis_types::AegisError;

pub async fn insert_user(pool: &Pool<Sqlite>, user: &User) -> Result<(), AegisError> {
    sqlx::query!(
        "INSERT INTO users (id, username, avatar, is_online, public_key, bio, tag) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            username = excluded.username,
            avatar = excluded.avatar,
            is_online = excluded.is_online,
            public_key = excluded.public_key,
            bio = excluded.bio,
            tag = excluded.tag;",
        user.id,
        user.username,
        user.avatar,
        user.is_online,
        user.public_key,
        user.bio,
        user.tag,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_user(pool: &Pool<Sqlite>, id: &str) -> Result<Option<User>, AegisError> {
    let user = sqlx::query_as!(User, "SELECT * FROM users WHERE id = ?", id)
        .fetch_optional(pool)
        .await?;
    Ok(user)
}

pub async fn update_user_online_status(pool: &Pool<Sqlite>, id: &str, is_online: bool) -> Result<(), AegisError> {
    sqlx::query!("UPDATE users SET is_online = ? WHERE id = ?", is_online, id)
        .execute(pool)
        .await?;
    Ok(())
}

