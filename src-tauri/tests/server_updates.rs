use aep::database;
use aep::database::{Channel, Role, ServerMetadataUpdate, ServerModerationUpdate};
use chrono::Utc;
use std::collections::HashMap;
use tempfile::tempdir;
use uuid::Uuid;

async fn seed_user(pool: &sqlx::Pool<sqlx::Sqlite>, user_id: &str) {
    sqlx::query!(
        "INSERT INTO users (id, username, avatar, is_online, public_key, bio, tag) VALUES (?, ?, ?, ?, ?, ?, ?)",
        user_id,
        "owner",
        "avatar.png",
        false,
        Option::<String>::None,
        Option::<String>::None,
        Option::<String>::None,
    )
    .execute(pool)
    .await
    .expect("insert user");
}

fn build_server(owner_id: &str) -> database::Server {
    database::Server {
        id: Uuid::new_v4().to_string(),
        name: "Test Server".to_string(),
        owner_id: owner_id.to_string(),
        created_at: Utc::now(),
        icon_url: None,
        description: None,
        default_channel_id: None,
        allow_invites: Some(true),
        moderation_level: None,
        explicit_content_filter: Some(false),
        channels: vec![],
        members: vec![],
        roles: vec![],
        invites: vec![],
    }
}

#[tokio::test]
async fn server_metadata_update_persists_columns() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("metadata.db");
    let pool = database::initialize_db(db_path).await.expect("init db");

    let owner_id = Uuid::new_v4().to_string();
    seed_user(&pool, &owner_id).await;

    let mut server = build_server(&owner_id);
    database::insert_server(&pool, &server)
        .await
        .expect("insert server");

    let channel = Channel {
        id: Uuid::new_v4().to_string(),
        server_id: server.id.clone(),
        name: "general".to_string(),
        channel_type: "text".to_string(),
        private: false,
    };
    database::insert_channel(&pool, &channel)
        .await
        .expect("insert channel");

    let update = ServerMetadataUpdate {
        name: Some("Renamed".to_string()),
        icon_url: Some(Some("https://example/icon.png".to_string())),
        description: Some(Some("Updated description".to_string())),
        default_channel_id: Some(Some(channel.id.clone())),
        allow_invites: Some(false),
    };

    database::update_server_metadata(&pool, &server.id, &update)
        .await
        .expect("update metadata");

    let updated = database::get_server_by_id(&pool, &server.id)
        .await
        .expect("fetch server");

    assert_eq!(updated.name, "Renamed");
    assert_eq!(
        updated.icon_url.as_deref(),
        Some("https://example/icon.png")
    );
    assert_eq!(updated.description.as_deref(), Some("Updated description"));
    assert_eq!(updated.default_channel_id.as_deref(), Some(&channel.id));
    assert_eq!(updated.allow_invites, Some(false));
}

#[tokio::test]
async fn server_roles_replace_round_trip() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("roles.db");
    let pool = database::initialize_db(db_path).await.expect("init db");

    let owner_id = Uuid::new_v4().to_string();
    seed_user(&pool, &owner_id).await;

    let server = build_server(&owner_id);
    database::insert_server(&pool, &server)
        .await
        .expect("insert server");

    let mut admin_permissions = HashMap::new();
    admin_permissions.insert("manage_channels".to_string(), true);
    admin_permissions.insert("ban_members".to_string(), true);

    let mut mod_permissions = HashMap::new();
    mod_permissions.insert("kick_members".to_string(), true);

    let roles = vec![
        Role {
            id: Uuid::new_v4().to_string(),
            name: "Admin".to_string(),
            color: "#ffffff".to_string(),
            hoist: true,
            mentionable: true,
            permissions: admin_permissions,
        },
        Role {
            id: Uuid::new_v4().to_string(),
            name: "Moderator".to_string(),
            color: "#888888".to_string(),
            hoist: false,
            mentionable: true,
            permissions: mod_permissions,
        },
    ];

    database::replace_server_roles(&pool, &server.id, &roles)
        .await
        .expect("replace roles");

    let role_map = database::get_roles_for_servers(&pool, &[server.id.clone()])
        .await
        .expect("fetch roles");
    let stored = role_map.get(&server.id).expect("roles present");

    assert_eq!(stored.len(), 2);
    let admin = stored.iter().find(|role| role.name == "Admin").unwrap();
    assert_eq!(admin.permissions.get("manage_channels"), Some(&true));
    assert_eq!(admin.permissions.get("ban_members"), Some(&true));
}

#[tokio::test]
async fn server_channels_replace_round_trip() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("channels.db");
    let pool = database::initialize_db(db_path).await.expect("init db");

    let owner_id = Uuid::new_v4().to_string();
    seed_user(&pool, &owner_id).await;

    let server = build_server(&owner_id);
    database::insert_server(&pool, &server)
        .await
        .expect("insert server");

    let channels = vec![
        Channel {
            id: Uuid::new_v4().to_string(),
            server_id: server.id.clone(),
            name: "general".to_string(),
            channel_type: "text".to_string(),
            private: false,
        },
        Channel {
            id: Uuid::new_v4().to_string(),
            server_id: server.id.clone(),
            name: "voice".to_string(),
            channel_type: "voice".to_string(),
            private: true,
        },
    ];

    database::replace_server_channels(&pool, &server.id, &channels)
        .await
        .expect("replace channels");

    let stored = database::get_channels_for_server(&pool, &server.id)
        .await
        .expect("fetch channels");

    assert_eq!(stored.len(), 2);
    assert!(stored.iter().any(|channel| channel.name == "general"));
    assert!(stored.iter().any(|channel| channel.name == "voice"));
}

#[tokio::test]
async fn server_moderation_update_persists_flags() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("moderation.db");
    let pool = database::initialize_db(db_path).await.expect("init db");

    let owner_id = Uuid::new_v4().to_string();
    seed_user(&pool, &owner_id).await;

    let server = build_server(&owner_id);
    database::insert_server(&pool, &server)
        .await
        .expect("insert server");

    let moderation = ServerModerationUpdate {
        moderation_level: Some(Some("High".to_string())),
        explicit_content_filter: Some(true),
    };

    database::update_server_moderation(&pool, &server.id, &moderation)
        .await
        .expect("update moderation");

    let updated = database::get_server_by_id(&pool, &server.id)
        .await
        .expect("fetch server");

    assert_eq!(updated.moderation_level.as_deref(), Some("High"));
    assert_eq!(updated.explicit_content_filter, Some(true));
}
