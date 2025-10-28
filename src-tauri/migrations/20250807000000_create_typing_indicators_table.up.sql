CREATE TABLE IF NOT EXISTS typing_indicators (
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    is_typing INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (chat_id, user_id)
);
