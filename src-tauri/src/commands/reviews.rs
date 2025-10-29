use crate::commands::state::AppStateContainer;
use aep::database::{self, NewReview, Review, ReviewSubject};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ReviewResponse {
    pub id: String,
    pub subject_type: String,
    pub subject_id: String,
    pub author_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_avatar: Option<String>,
    pub rating: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    pub created_at: String,
}

impl From<Review> for ReviewResponse {
    fn from(review: Review) -> Self {
        ReviewResponse {
            id: review.id,
            subject_type: review.subject_type.as_str().to_string(),
            subject_id: review.subject_id,
            author_id: review.author_id,
            author_username: review.author_username,
            author_avatar: review.author_avatar,
            rating: review.rating,
            content: review.content,
            created_at: review.created_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SubmitReviewRequest {
    pub subject_type: String,
    pub subject_id: String,
    pub rating: i64,
    #[serde(default)]
    pub content: Option<String>,
}

const MAX_REVIEW_LENGTH: usize = 1000;

fn normalize_subject_type(raw: &str) -> Result<(ReviewSubject, String), String> {
    let normalized = raw.trim().to_lowercase();
    let subject = ReviewSubject::try_from(normalized.as_str())
        .map_err(|_| "Unsupported review subject type.".to_string())?;
    Ok((subject, normalized))
}

fn sanitize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

#[tauri::command]
pub async fn list_user_reviews(
    user_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<ReviewResponse>, String> {
    let trimmed_id = user_id.trim();
    if trimmed_id.is_empty() {
        return Err("User ID is required.".to_string());
    }

    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();

    let reviews = database::list_reviews_by_subject(
        &state.db_pool,
        ReviewSubject::User,
        trimmed_id,
        Some(100),
    )
    .await
    .map_err(|error| error.to_string())?;

    Ok(reviews.into_iter().map(ReviewResponse::from).collect())
}

#[tauri::command]
pub async fn list_server_reviews(
    server_id: String,
    state_container: State<'_, AppStateContainer>,
) -> Result<Vec<ReviewResponse>, String> {
    let trimmed_id = server_id.trim();
    if trimmed_id.is_empty() {
        return Err("Server ID is required.".to_string());
    }

    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();

    let reviews = database::list_reviews_by_subject(
        &state.db_pool,
        ReviewSubject::Server,
        trimmed_id,
        Some(100),
    )
    .await
    .map_err(|error| error.to_string())?;

    Ok(reviews.into_iter().map(ReviewResponse::from).collect())
}

#[tauri::command]
pub async fn submit_review(
    request: SubmitReviewRequest,
    state_container: State<'_, AppStateContainer>,
) -> Result<ReviewResponse, String> {
    let trimmed_subject_id = request.subject_id.trim();
    if trimmed_subject_id.is_empty() {
        return Err("Subject ID is required.".to_string());
    }

    if !(1..=5).contains(&request.rating) {
        return Err("Rating must be between 1 and 5.".to_string());
    }

    let (subject_type, subject_type_string) = normalize_subject_type(&request.subject_type)?;

    let content = sanitize_optional_text(request.content);
    if let Some(ref text) = content {
        if text.len() > MAX_REVIEW_LENGTH {
            return Err(format!(
                "Review content must be {MAX_REVIEW_LENGTH} characters or fewer."
            ));
        }
    }

    let state_guard = state_container.0.lock().await;
    let state = state_guard
        .as_ref()
        .ok_or_else(|| "State not initialized".to_string())?
        .clone();

    let author_id = state.identity.peer_id().to_base58();

    if matches!(subject_type, ReviewSubject::User) && author_id == trimmed_subject_id {
        return Err("You cannot review your own profile.".to_string());
    }

    let review_id = Uuid::new_v4().to_string();
    let new_review = NewReview {
        id: review_id.clone(),
        subject: subject_type,
        subject_id: trimmed_subject_id.to_string(),
        author_id: author_id.clone(),
        rating: request.rating,
        content: content.clone(),
        created_at: Utc::now(),
    };

    database::insert_review(&state.db_pool, &new_review)
        .await
        .map_err(|error| error.to_string())?;

    let review = database::get_review_by_id(&state.db_pool, &review_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Review was not found after creation.".to_string())?;

    // Ensure the subject type string casing matches the normalized value used during insertion.
    let mut response = ReviewResponse::from(review);
    response.subject_type = subject_type_string;
    Ok(response)
}
