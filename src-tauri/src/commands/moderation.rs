use crate::commands::state::AppStateContainer;
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct SubmitUserReportPayload {
    pub target_user_id: String,
    pub reason: String,
    pub description: String,
    pub source_chat_id: Option<String>,
    pub source_chat_type: Option<String>,
}

#[tauri::command]
pub async fn submit_user_report(
    payload: SubmitUserReportPayload,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let target_user_id = payload.target_user_id.trim();
    if target_user_id.is_empty() {
        return Err("Target user is required.".to_string());
    }

    let reason = payload.reason.trim();
    if reason.is_empty() {
        return Err("Reason is required.".to_string());
    }

    let description = payload.description.trim();
    if description.is_empty() {
        return Err("Description is required.".to_string());
    }

    let source_chat_id = payload
        .source_chat_id
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let normalized_chat_type = payload
        .source_chat_type
        .as_ref()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());

    if let Some(ref chat_type) = normalized_chat_type {
        match chat_type.as_str() {
            "channel" | "group" | "dm" => {}
            _ => return Err("Invalid source chat type.".to_string()),
        }
    }

    let (reporter_id, pool) = {
        let state_guard = state_container.0.lock().await;
        let state = state_guard.as_ref().ok_or_else(|| {
            "Application state not initialized. Please unlock your identity.".to_string()
        })?;
        (state.identity.peer_id().to_base58(), state.db_pool.clone())
    };

    if reporter_id == target_user_id {
        return Err("You cannot report yourself.".to_string());
    }

    let now = Utc::now().to_rfc3339();
    let report_id = Uuid::new_v4().to_string();

    let chat_context = if source_chat_id.is_some() || normalized_chat_type.is_some() {
        Some(
            json!({
                "chat_id": source_chat_id,
                "chat_type": normalized_chat_type,
            })
            .to_string(),
        )
    } else {
        None
    };

    sqlx::query(
        "INSERT INTO user_reports (id, reporter_id, target_user_id, reason, description, chat_context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(report_id)
    .bind(reporter_id)
    .bind(target_user_id.to_string())
    .bind(reason.to_string())
    .bind(description.to_string())
    .bind(chat_context)
    .bind(now.clone())
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|error| format!("Failed to save user report: {error}"))?;

    Ok(())
}
