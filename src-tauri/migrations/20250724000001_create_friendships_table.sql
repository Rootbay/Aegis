CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY NOT NULL,
    user_a_id TEXT NOT NULL,
    user_b_id TEXT NOT NULL,
    status TEXT NOT NULL, -- 'pending', 'accepted', 'blocked_by_a', 'blocked_by_b'
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_a_id, user_b_id)
);