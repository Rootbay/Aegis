use crate::commands::state::{with_state_async, AppStateContainer};
use aegis_shared_types::User;
use aep::database::{self, FriendshipStatus};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use std::collections::HashSet;
use tauri::State;

use super::models::CommandResult;
use super::utils::send_friend_request_response;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingFriendInvite {
    pub id: String,
    pub from_user: Option<User>,
    pub message: Option<String>,
    pub mutual_friends: Option<i64>,
    pub received_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendPeer {
    pub id: String,
    pub user: User,
    pub last_interaction_at: String,
    pub context: Option<String>,
    pub interaction_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendSearchResult {
    pub id: String,
    pub username: Option<String>,
    pub avatar: Option<String>,
    pub is_online: Option<bool>,
    pub public_key: Option<String>,
    pub bio: Option<String>,
    pub tag: Option<String>,
    pub status_message: Option<String>,
    pub location: Option<String>,
    pub relationship: Option<String>,
    pub mutual_friends: Option<i64>,
    pub last_interaction_at: Option<String>,
    pub note: Option<String>,
}

#[tauri::command]
pub async fn list_pending_friend_invites(
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<Vec<PendingFriendInvite>> {
    with_state_async(state_container, move |state| async move {
        let my_id = state.identity.peer_id().to_base58();
        let pending_status = FriendshipStatus::Pending.to_string();
        let pending_rows = sqlx::query!(
            r#"
            SELECT
                f.id as friendship_id,
                f.user_a_id,
                f.user_b_id,
                f.created_at as "created_at!: chrono::DateTime<chrono::Utc>",
                u.id as "from_user_id!",
                u.username as "from_username!",
                u.avatar as "from_avatar!",
                u.is_online as "from_is_online?: bool",
                u.public_key as "from_public_key?",
                u.bio as "from_bio?",
                u.tag as "from_tag?",
                u.status_message as "from_status_message?",
                u.location as "from_location?"
            FROM friendships f
            JOIN users u ON u.id = f.user_a_id
            WHERE f.user_b_id = ? AND f.status = ?
            ORDER BY f.created_at DESC
            "#,
            my_id,
            pending_status,
        )
        .fetch_all(&state.db_pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut invites = Vec::with_capacity(pending_rows.len());
        for row in pending_rows {
            let mutual_friends = mutual_friend_count(&state.db_pool, &my_id, &row.user_a_id)
                .await
                .map_err(|e| e.to_string())?;
            invites.push(PendingFriendInvite {
                id: row.friendship_id,
                from_user: Some(User {
                    id: row.from_user_id,
                    username: row.from_username,
                    avatar: row.from_avatar,
                    is_online: row.from_is_online.unwrap_or(false),
                    public_key: row.from_public_key,
                    bio: row.from_bio,
                    tag: row.from_tag,
                    status_message: row.from_status_message,
                    location: row.from_location,
                }),
                message: None,
                mutual_friends: Some(mutual_friends),
                received_at: row.created_at.to_rfc3339(),
            });
        }

        Ok(invites)
    })
    .await
}

#[tauri::command]
pub async fn list_recent_friend_peers(
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<Vec<FriendPeer>> {
    with_state_async(state_container, move |state| async move {
        let my_id = state.identity.peer_id().to_base58();
        let accepted_status = FriendshipStatus::Accepted.to_string();
        let recent_rows = sqlx::query!(
            r#"
            SELECT
                f.id as friendship_id,
                f.updated_at as "updated_at!: chrono::DateTime<chrono::Utc>",
                u.id as "counterpart_id!",
                u.username as "counterpart_username!",
                u.avatar as "counterpart_avatar!",
                u.is_online as "counterpart_is_online?: bool",
                u.public_key as "counterpart_public_key?",
                u.bio as "counterpart_bio?",
                u.tag as "counterpart_tag?",
                u.status_message as "counterpart_status_message?",
                u.location as "counterpart_location?"
            FROM friendships f
            JOIN users u ON u.id = CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
            WHERE (f.user_a_id = ? OR f.user_b_id = ?) AND f.status = ?
            ORDER BY f.updated_at DESC
            LIMIT 20
            "#,
            my_id,
            my_id,
            my_id,
            accepted_status,
        )
        .fetch_all(&state.db_pool)
        .await
        .map_err(|e| e.to_string())?;

        let peers = recent_rows
            .into_iter()
            .map(|row| FriendPeer {
                id: row.friendship_id,
                user: User {
                    id: row.counterpart_id,
                    username: row.counterpart_username,
                    avatar: row.counterpart_avatar,
                    is_online: row.counterpart_is_online.unwrap_or(false),
                    public_key: row.counterpart_public_key,
                    bio: row.counterpart_bio,
                    tag: row.counterpart_tag,
                    status_message: row.counterpart_status_message,
                    location: row.counterpart_location,
                },
                last_interaction_at: row.updated_at.to_rfc3339(),
                context: Some("Recent connection".to_string()),
                interaction_count: None,
            })
            .collect();

        Ok(peers)
    })
    .await
}

#[tauri::command]
pub async fn search_users(
    query: String,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<Vec<FriendSearchResult>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    with_state_async(state_container, move |state| async move {
        let my_id = state.identity.peer_id().to_base58();
        let pattern = format!("%{}%", query.trim().to_lowercase());
        let rows = sqlx::query!(
            r#"
            SELECT
                u.id,
                u.username as "username?",
                u.avatar,
                u.is_online as "is_online?: bool",
                u.public_key as "public_key?",
                u.bio as "bio?",
                u.tag as "tag?",
                u.status_message as "status_message?",
                u.location as "location?",
                f.status as "relationship_status?",
                f.user_a_id as "friendship_sender_id?",
                f.user_b_id as "friendship_target_id?",
                f.updated_at as "last_interaction_at?: chrono::DateTime<chrono::Utc>"
            FROM users u
            LEFT JOIN friendships f ON (
                (f.user_a_id = ? AND f.user_b_id = u.id) OR (f.user_b_id = ? AND f.user_a_id = u.id)
            )
            WHERE u.id != ? AND (
                lower(u.username) LIKE ?
                OR lower(u.tag) LIKE ?
                OR lower(u.id) LIKE ?
            )
            ORDER BY u.username
            LIMIT 25
            "#,
            my_id,
            my_id,
            my_id,
            pattern,
            pattern,
            pattern,
        )
        .fetch_all(&state.db_pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut results = Vec::with_capacity(rows.len());
        for row in rows {
            let relationship = match row.relationship_status.as_deref() {
                Some(status) if status.eq_ignore_ascii_case("accepted") => "friend",
                Some(status) if status.eq_ignore_ascii_case("pending") => {
                    if row.friendship_sender_id.as_ref() == Some(&my_id) {
                        "outgoing"
                    } else {
                        "incoming"
                    }
                }
                Some(status) if status.eq_ignore_ascii_case("recent") => "recent",
                _ => "none",
            };

            let mutual_friends = mutual_friend_count(&state.db_pool, &my_id, &row.id)
                .await
                .map_err(|e| e.to_string())?;

            let note = match relationship {
                "incoming" => Some("Sent you an invite.".to_string()),
                "outgoing" => Some("Invite pending".to_string()),
                "friend" => Some("Already connected".to_string()),
                _ => None,
            };

            let last_interaction_at = row.last_interaction_at.map(|dt| dt.to_rfc3339());

            results.push(FriendSearchResult {
                id: row.id,
                username: row.username,
                avatar: Some(row.avatar),
                is_online: row.is_online,
                public_key: row.public_key,
                bio: row.bio,
                tag: row.tag,
                status_message: row.status_message,
                location: row.location,
                relationship: Some(relationship.to_string()),
                mutual_friends: Some(mutual_friends),
                last_interaction_at,
                note,
            });
        }

        Ok(results)
    })
    .await
}

#[tauri::command]
pub async fn accept_friend_invite(
    invite_id: String,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<Option<database::FriendshipWithProfile>> {
    with_state_async(state_container, move |state| async move {
        let my_id = state.identity.peer_id().to_base58();
        let friendship = database::get_friendship_by_id(&state.db_pool, &invite_id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Friendship not found.".to_string())?;

        if friendship.status != FriendshipStatus::Pending.to_string() {
            return Err("Friendship is not pending.".to_string());
        }

        database::update_friendship_status(
            &state.db_pool,
            &friendship.id,
            FriendshipStatus::Accepted,
        )
        .await
        .map_err(|e| e.to_string())?;

        send_friend_request_response(&state, &friendship, true).await?;

        database::get_friendship_with_profile_for_user(&state.db_pool, &friendship.id, &my_id)
            .await
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn decline_friend_invite(
    invite_id: String,
    state_container: State<'_, AppStateContainer>,
) -> CommandResult<()> {
    with_state_async(state_container, move |state| async move {
        let friendship = database::get_friendship_by_id(&state.db_pool, &invite_id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Friendship not found.".to_string())?;

        if friendship.status != FriendshipStatus::Pending.to_string() {
            return Err("Friendship is not pending.".to_string());
        }

        send_friend_request_response(&state, &friendship, false).await?;

        database::delete_friendship(&state.db_pool, &friendship.id)
            .await
            .map_err(|e| e.to_string())
    })
    .await
}

async fn mutual_friend_count(
    pool: &Pool<Sqlite>,
    user_id: &str,
    other_id: &str,
) -> Result<i64, sqlx::Error> {
    let status = FriendshipStatus::Accepted.to_string();
    let user_status = status.clone();
    let other_status = status;

    let user_rows = sqlx::query!(
        r#"
        SELECT CASE WHEN user_a_id = ? THEN user_b_id ELSE user_a_id END as friend_id
        FROM friendships
        WHERE (user_a_id = ? OR user_b_id = ?) AND status = ?
        "#,
        user_id,
        user_id,
        user_id,
        user_status,
    )
    .fetch_all(pool)
    .await?;

    let other_rows = sqlx::query!(
        r#"
        SELECT CASE WHEN user_a_id = ? THEN user_b_id ELSE user_a_id END as friend_id
        FROM friendships
        WHERE (user_a_id = ? OR user_b_id = ?) AND status = ?
        "#,
        other_id,
        other_id,
        other_id,
        other_status,
    )
    .fetch_all(pool)
    .await?;

    let user_friend_ids: HashSet<String> = user_rows.into_iter().map(|row| row.friend_id).collect();
    let other_friend_ids: HashSet<String> =
        other_rows.into_iter().map(|row| row.friend_id).collect();

    let common = user_friend_ids.intersection(&other_friend_ids).count() as i64;

    Ok(common)
}
