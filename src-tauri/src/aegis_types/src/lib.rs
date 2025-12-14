use thiserror::Error;

#[derive(Error, Debug)]
pub enum AegisError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] bincode::Error),
    #[error("Rkyv serialization error: {0}")]
    RkyvSerialization(String),
    #[error("Network error: {0}")]
    Network(String),
    #[error("User not found")]
    UserNotFound,
    #[error("Friendship not found")]
    FriendshipNotFound,
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("Internal server error: {0}")]
    Internal(String),
}

impl From<String> for AegisError {
    fn from(error: String) -> Self {
        AegisError::Internal(error)
    }
}

impl From<AegisError> for String {
    fn from(error: AegisError) -> Self {
        error.to_string()
    }
}
