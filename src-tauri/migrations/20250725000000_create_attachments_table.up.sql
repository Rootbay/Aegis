CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY NOT NULL,
    message_id TEXT NOT NULL,
    name TEXT NOT NULL,
    content_type TEXT,
    size INTEGER NOT NULL,
    data BLOB NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
