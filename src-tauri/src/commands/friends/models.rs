use aep::database::FriendshipWithProfile;
use serde::{Deserialize, Serialize};

pub type CommandResult<T> = Result<T, String>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockUserResult {
    pub friendship: FriendshipWithProfile,
    pub newly_created: bool,
    pub spam_score: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnblockUserResult {
    pub removed_friendship_id: String,
    pub target_user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MuteUserResult {
    pub target_user_id: String,
    pub muted: bool,
    pub spam_score: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgnoreUserResult {
    pub target_user_id: String,
    pub ignored: bool,
}
