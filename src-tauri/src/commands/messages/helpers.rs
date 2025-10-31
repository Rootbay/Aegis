use chrono::{DateTime, Utc};

use super::types::AttachmentDescriptor;

pub(super) fn is_voice_memo_attachment(descriptor: &AttachmentDescriptor) -> bool {
    descriptor
        .content_type
        .as_deref()
        .map(|value| value.starts_with("audio/"))
        .unwrap_or(false)
        && descriptor.name.starts_with("voice-message-")
}

pub fn parse_optional_datetime(input: Option<String>) -> Result<Option<DateTime<Utc>>, String> {
    match input {
        Some(value) => {
            let parsed = DateTime::parse_from_rfc3339(&value)
                .map_err(|e| format!("Invalid expires_at timestamp: {e}"))?;
            Ok(Some(parsed.with_timezone(&Utc)))
        }
        None => Ok(None),
    }
}
