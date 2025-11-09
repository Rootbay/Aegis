use crate::commands::state::AppStateContainer;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
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

#[derive(Debug, Deserialize)]
pub struct ReportMessagePayload {
    pub message_id: String,
    pub reason: String,
    pub description: String,
    pub chat_id: Option<String>,
    pub chat_type: Option<String>,
    pub chat_name: Option<String>,
    pub message_author_id: Option<String>,
    pub message_author_name: Option<String>,
    pub message_excerpt: Option<String>,
    pub message_timestamp: Option<String>,
    pub surrounding_message_ids: Option<Vec<String>>,
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

#[tauri::command]
pub async fn report_message(
    payload: ReportMessagePayload,
    state_container: State<'_, AppStateContainer>,
) -> Result<(), String> {
    let message_id = payload.message_id.trim();
    if message_id.is_empty() {
        return Err("Message ID is required.".to_string());
    }

    let reason = payload.reason.trim();
    if reason.is_empty() {
        return Err("Reason is required.".to_string());
    }

    let description = payload.description.trim();
    if description.is_empty() {
        return Err("Description is required.".to_string());
    }

    let chat_id = payload
        .chat_id
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let normalized_chat_type = payload
        .chat_type
        .as_ref()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());

    if let Some(ref chat_type) = normalized_chat_type {
        match chat_type.as_str() {
            "channel" | "group" | "dm" => {}
            _ => return Err("Invalid chat type.".to_string()),
        }
    }

    let chat_name = payload
        .chat_name
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let message_author_id = payload
        .message_author_id
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let message_author_name = payload
        .message_author_name
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let message_excerpt = payload
        .message_excerpt
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let message_timestamp = payload
        .message_timestamp
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let surrounding_message_ids: Option<Vec<String>> = payload
        .surrounding_message_ids
        .map(|ids| {
            ids.into_iter()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .collect::<Vec<String>>()
        })
        .filter(|ids| !ids.is_empty());

    let (reporter_id, pool) = {
        let state_guard = state_container.0.lock().await;
        let state = state_guard.as_ref().ok_or_else(|| {
            "Application state not initialized. Please unlock your identity.".to_string()
        })?;
        (state.identity.peer_id().to_base58(), state.db_pool.clone())
    };

    let now = Utc::now().to_rfc3339();
    let report_id = Uuid::new_v4().to_string();

    let mut context_map = serde_json::Map::<String, Value>::new();
    if let Some(ref ids) = surrounding_message_ids {
        context_map.insert("surrounding_message_ids".to_string(), json!(ids));
    }

    let context_json = if context_map.is_empty() {
        None
    } else {
        Some(Value::Object(context_map).to_string())
    };

    sqlx::query(
        "INSERT INTO message_reports (id, reporter_id, message_id, reason, description, chat_id, chat_type, chat_name, message_author_id, message_author_name, message_excerpt, message_timestamp, context_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(report_id)
    .bind(reporter_id)
    .bind(message_id.to_string())
    .bind(reason.to_string())
    .bind(description.to_string())
    .bind(chat_id)
    .bind(normalized_chat_type)
    .bind(chat_name)
    .bind(message_author_id)
    .bind(message_author_name)
    .bind(message_excerpt)
    .bind(message_timestamp)
    .bind(context_json)
    .bind(now.clone())
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|error| format!("Failed to save message report: {error}"))?;

    Ok(())
}
