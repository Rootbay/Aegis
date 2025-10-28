CREATE TABLE IF NOT EXISTS server_events (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    channel_id TEXT,
    scheduled_for TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    cancelled_at TEXT,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_server_events_server_id
    ON server_events(server_id);

CREATE INDEX IF NOT EXISTS idx_server_events_status
    ON server_events(server_id, status);
