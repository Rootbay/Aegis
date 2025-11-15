use super::{broadcast_join_event, get_initialized_state};
use crate::commands::state::AppStateContainer;
use aegis_protocol::{self, AepMessage};
use aep::database::{self, RedeemServerInviteError, RedeemedServerInvite, ServerInvite};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendServerInviteResult {
    pub server_id: String,
    pub user_id: String,
    pub already_member: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInviteResponse {
    pub id: String,
    pub server_id: String,
    pub code: String,
    pub created_by: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_uses: Option<i64>,
    pub uses: i64,
}

impl From<ServerInvite> for ServerInviteResponse {
    fn from(value: ServerInvite) -> Self {
        ServerInviteResponse {
            id: value.id,
            server_id: value.server_id,
            code: value.code,
            created_by: value.created_by,
            created_at: value.created_at.to_rfc3339(),
            expires_at: value.expires_at.map(|dt| dt.to_rfc3339()),
            max_uses: value.max_uses,
            uses: value.uses,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedeemServerInviteResponse {
    pub server: database::Server,
    pub already_member: bool,
}

#[tauri::command]
pub async fn send_server_invite(
    server_id: String,
    user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<SendServerInviteResult, String> {
    let state = get_initialized_state(&state_container).await?;
    let my_id = state.identity.peer_id().to_base58();
    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    if server.owner_id != my_id {
        return Err("Only server owners can send invites".into());
    }

    let already_member = database::server_has_member(&state.db_pool, &server_id, &user_id)
        .await
        .map_err(|e| e.to_string())?;

    if !already_member {
        database::add_server_member(&state.db_pool, &server_id, &user_id)
            .await
            .map_err(|e| e.to_string())?;
    }

    let send_server_invite_data = aegis_protocol::SendServerInviteData {
        server_id: server_id.clone(),
        user_id: user_id.clone(),
    };
    let send_server_invite_bytes =
        bincode::serialize(&send_server_invite_data).map_err(|e| e.to_string())?;
    let signature = state
        .identity
        .keypair()
        .sign(&send_server_invite_bytes)
        .map_err(|e| e.to_string())?;

    let aep_message = AepMessage::SendServerInvite {
        server_id: server_id.clone(),
        user_id: user_id.clone(),
        signature: Some(signature),
    };
    let serialized_message = bincode::serialize(&aep_message).map_err(|e| e.to_string())?;
    state
        .network_tx
        .send(serialized_message)
        .await
        .map_err(|e| e.to_string())?;

    Ok(SendServerInviteResult {
        server_id,
        user_id,
        already_member,
    })
}

#[tauri::command]
pub async fn generate_server_invite(
    server_id: String,
    expires_after_seconds: Option<i64>,
    max_uses: Option<i64>,
    state_container: State<'_, AppStateContainer>,
) -> Result<ServerInviteResponse, String> {
    let state = get_initialized_state(&state_container).await?;

    let requester_id = state.identity.peer_id().to_base58();
    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    if server.owner_id != requester_id {
        return Err("Only server owners can generate invites.".into());
    }

    let code = Uuid::new_v4().simple().to_string();
    let created_at = Utc::now();
    let expires_at = expires_after_seconds
        .filter(|seconds| *seconds > 0)
        .map(|seconds| Utc::now() + Duration::seconds(seconds));

    let invite = database::create_server_invite(
        &state.db_pool,
        &server_id,
        &requester_id,
        &code,
        &created_at,
        expires_at,
        max_uses,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ServerInviteResponse::from(invite))
}

#[tauri::command]
pub async fn list_server_invites(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<ServerInviteResponse>, String> {
    let state = get_initialized_state(&state_container).await?;

    let requester_id = state.identity.peer_id().to_base58();
    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    if server.owner_id != requester_id {
        return Err("Only server owners can manage invites.".into());
    }

    let invite_map = database::get_invites_for_servers(&state.db_pool, &[server_id.clone()])
        .await
        .map_err(|e| e.to_string())?;

    let invites = invite_map
        .get(&server_id)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(ServerInviteResponse::from)
        .collect();

    Ok(invites)
}

#[tauri::command]
pub async fn revoke_server_invite(
    server_id: String,
    invite_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let state = get_initialized_state(&state_container).await?;

    let requester_id = state.identity.peer_id().to_base58();
    let server = database::get_server_by_id(&state.db_pool, &server_id)
        .await
        .map_err(|e| e.to_string())?;
    if server.owner_id != requester_id {
        return Err("Only server owners can revoke invites.".into());
    }

    let invite = database::get_server_invite_by_id(&state.db_pool, &invite_id)
        .await
        .map_err(|e| e.to_string())?;

    let invite = invite.ok_or_else(|| "Invite not found.".to_string())?;

    if invite.server_id != server_id {
        return Err("Invite does not belong to the specified server.".into());
    }

    database::delete_server_invite(&state.db_pool, &invite_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn redeem_server_invite(
    code: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<RedeemServerInviteResponse, String> {
    let state = get_initialized_state(&state_container).await?;
    let my_id = state.identity.peer_id().to_base58();
    let redemption = database::redeem_server_invite_by_code(&state.db_pool, &code, &my_id)
        .await
        .map_err(|err| match err {
            RedeemServerInviteError::InviteNotFound => {
                "Invite not found or no longer valid.".to_string()
            }
            RedeemServerInviteError::InviteExpired => "This invite has expired.".to_string(),
            RedeemServerInviteError::InviteMaxedOut => {
                "This invite has reached its maximum number of uses.".to_string()
            }
            RedeemServerInviteError::Database(e) => e.to_string(),
        })?;

    let RedeemedServerInvite {
        server,
        already_member,
    } = redemption;

    if !already_member {
        broadcast_join_event(&state, &server.id, &my_id).await?;
    }

    Ok(RedeemServerInviteResponse {
        server,
        already_member,
    })
}
