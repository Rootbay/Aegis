CREATE TABLE IF NOT EXISTS server_webhooks (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    channel_id TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_server_webhooks_server_id
    ON server_webhooks(server_id);
