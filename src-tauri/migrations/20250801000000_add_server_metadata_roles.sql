-- Add additional metadata columns to servers and create server_roles table
ALTER TABLE servers ADD COLUMN icon_url TEXT;
ALTER TABLE servers ADD COLUMN description TEXT;
ALTER TABLE servers ADD COLUMN default_channel_id TEXT;
ALTER TABLE servers ADD COLUMN allow_invites BOOLEAN NOT NULL DEFAULT 1;
ALTER TABLE servers ADD COLUMN moderation_level TEXT;
ALTER TABLE servers ADD COLUMN explicit_content_filter BOOLEAN NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS server_roles (
    id TEXT PRIMARY KEY NOT NULL,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    hoist BOOLEAN NOT NULL DEFAULT 0,
    mentionable BOOLEAN NOT NULL DEFAULT 0,
    permissions TEXT NOT NULL,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);
