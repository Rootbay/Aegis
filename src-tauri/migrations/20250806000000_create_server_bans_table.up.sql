CREATE TABLE IF NOT EXISTS server_bans (
    server_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (server_id, user_id),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
