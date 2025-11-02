use aegis_shared_types::User;
use aegis_types::AegisError;
use sqlx::{Pool, QueryBuilder, Sqlite};

pub async fn insert_user(pool: &Pool<Sqlite>, user: &User) -> Result<(), AegisError> {
    sqlx::query!(
        "INSERT INTO users (id, username, avatar, is_online, public_key, bio, tag, status_message, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            username = excluded.username,
            avatar = excluded.avatar,
            is_online = excluded.is_online,
            public_key = excluded.public_key,
            bio = excluded.bio,
            tag = excluded.tag,
            status_message = excluded.status_message,
            location = excluded.location;",
        user.id,
        user.username,
        user.avatar,
        user.is_online,
        user.public_key,
        user.bio,
        user.tag,
        user.status_message,
        user.location,
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

pub async fn update_user_presence(
    pool: &Pool<Sqlite>,
    id: &str,
    is_online: bool,
    status_message: Option<Option<String>>,
    location: Option<Option<String>>,
) -> Result<(), AegisError> {
    let mut builder = QueryBuilder::new("UPDATE users SET is_online = ");
    builder.push_bind(is_online);

    if let Some(status_message) = status_message {
        builder.push(", status_message = ");
        builder.push_bind(status_message);
    }

    if let Some(location) = location {
        builder.push(", location = ");
        builder.push_bind(location);
    }

    builder.push(" WHERE id = ");
    builder.push_bind(id);

    builder.build().execute(pool).await?;
    Ok(())
}
