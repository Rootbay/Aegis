use super::utils::parse_timestamp;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, Sqlite};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ReviewSubject {
    User,
    Server,
}

impl ReviewSubject {
    pub fn as_str(&self) -> &'static str {
        match self {
            ReviewSubject::User => "user",
            ReviewSubject::Server => "server",
        }
    }
}

impl TryFrom<&str> for ReviewSubject {
    type Error = sqlx::Error;
    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "user" => Ok(ReviewSubject::User),
            "server" => Ok(ReviewSubject::Server),
            other => Err(sqlx::Error::Decode(format!("Invalid review subject: {other}").into())),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Review {
    pub id: String,
    pub subject_type: ReviewSubject,
    pub subject_id: String,
    pub author_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_avatar: Option<String>,
    pub rating: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewReview {
    pub id: String,
    pub subject: ReviewSubject,
    pub subject_id: String,
    pub author_id: String,
    pub rating: i64,
    pub content: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
struct ReviewRow {
    id: String,
    subject_type: String,
    subject_id: String,
    author_id: String,
    rating: i64,
    content: Option<String>,
    created_at: String,
    author_username: Option<String>,
    author_avatar: Option<String>,
}

impl TryFrom<ReviewRow> for Review {
    type Error = sqlx::Error;
    fn try_from(value: ReviewRow) -> Result<Self, Self::Error> {
        Ok(Review {
            id: value.id,
            subject_type: ReviewSubject::try_from(value.subject_type.as_str())?,
            subject_id: value.subject_id,
            author_id: value.author_id,
            author_username: value.author_username,
            author_avatar: value.author_avatar,
            rating: value.rating,
            content: value.content,
            created_at: parse_timestamp(&value.created_at)?,
        })
    }
}

pub async fn insert_review(pool: &Pool<Sqlite>, review: &NewReview) -> Result<(), sqlx::Error> {
    let subject = review.subject.as_str();
    let created_at = review.created_at.to_rfc3339();
    sqlx::query!(
        "INSERT INTO reviews (id, subject_type, subject_id, author_id, rating, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        review.id,
        subject,
        review.subject_id,
        review.author_id,
        review.rating,
        review.content,
        created_at,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_reviews_by_subject(
    pool: &Pool<Sqlite>,
    subject: ReviewSubject,
    subject_id: &str,
    limit: Option<i64>,
) -> Result<Vec<Review>, sqlx::Error> {
    let limit = limit.unwrap_or(50);
    let rows = sqlx::query_as::<_, ReviewRow>(
        "SELECT r.id, r.subject_type, r.subject_id, r.author_id, r.rating, r.content, r.created_at, u.username AS author_username, u.avatar AS author_avatar \
         FROM reviews r \
         LEFT JOIN users u ON u.id = r.author_id \
         WHERE r.subject_type = ? AND r.subject_id = ? \
         ORDER BY r.created_at DESC \
         LIMIT ?",
    )
    .bind(subject.as_str())
    .bind(subject_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(Review::try_from).collect()
}

pub async fn get_review_by_id(
    pool: &Pool<Sqlite>,
    review_id: &str,
) -> Result<Option<Review>, sqlx::Error> {
    let row = sqlx::query_as::<_, ReviewRow>(
        "SELECT r.id, r.subject_type, r.subject_id, r.author_id, r.rating, r.content, r.created_at, u.username AS author_username, u.avatar AS author_avatar \
         FROM reviews r \
         LEFT JOIN users u ON u.id = r.author_id \
         WHERE r.id = ?",
    )
    .bind(review_id)
    .fetch_optional(pool)
    .await?;

    row.map(Review::try_from).transpose()
}
