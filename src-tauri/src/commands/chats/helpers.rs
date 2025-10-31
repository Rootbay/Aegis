use aep::database::{GroupChat, GroupChatRecord};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct GroupChatPayload {
    pub id: String,
    pub name: Option<String>,
    pub owner_id: String,
    pub created_at: String,
    pub member_ids: Vec<String>,
}

impl GroupChatPayload {
    pub fn from_chat(chat: &GroupChat, member_ids: Vec<String>) -> Self {
        Self {
            id: chat.id.clone(),
            name: chat.name.clone(),
            owner_id: chat.owner_id.clone(),
            created_at: chat.created_at.to_rfc3339(),
            member_ids,
        }
    }

    pub fn from_record(record: GroupChatRecord) -> Self {
        Self::from_chat(&record.chat, record.member_ids)
    }
}

pub(super) fn normalize_group_name(name: Option<String>, group_id: &str) -> Option<String> {
    name.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
    .or_else(|| {
        Some(format!(
            "Group {}",
            &group_id.chars().take(8).collect::<String>()
        ))
    })
}
