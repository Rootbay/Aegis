use chrono::{DateTime, Utc};
use sqlx::Error;

pub fn parse_timestamp(value: &str) -> Result<DateTime<Utc>, Error> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| Error::Decode(format!("Failed to parse timestamp: {}", e).into()))
}

pub fn parse_optional_timestamp(value: Option<String>) -> Result<Option<DateTime<Utc>>, Error> {
    match value {
        Some(ts) => parse_timestamp(&ts).map(Some),
        None => Ok(None),
    }
}

pub fn bool_from_i64(value: i64) -> bool {
    value != 0
}
