CREATE TABLE IF NOT EXISTS user_reports (
    id TEXT PRIMARY KEY NOT NULL,
    reporter_id TEXT NOT NULL,
    target_user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    description TEXT NOT NULL,
    chat_context TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
);
