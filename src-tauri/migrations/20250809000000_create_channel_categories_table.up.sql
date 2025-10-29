CREATE TABLE IF NOT EXISTS channel_categories (
    id TEXT PRIMARY KEY NOT NULL,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_channel_categories_server_id
    ON channel_categories(server_id);

ALTER TABLE channels
    ADD COLUMN category_id TEXT REFERENCES channel_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_channels_category_id ON channels(category_id);
