use super::utils::{bool_from_i64, parse_timestamp, parse_optional_timestamp};
use super::channels::{get_channels_for_servers, get_channel_categories_for_servers}; // Import form sibling
use aegis_shared_types::{Role, Server, ServerInvite, User};
use chrono::{DateTime, Utc};
use scu128::Scu128;
use serde::{Deserialize, Serialize};
use serde_json;
use sqlx::{FromRow, Pool, QueryBuilder, Sqlite};
use std::collections::HashMap;
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ServerBan {
    pub server_id: String,
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub created_at: DateTime<Utc>,
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
