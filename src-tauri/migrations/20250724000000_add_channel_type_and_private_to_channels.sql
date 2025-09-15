-- Add channel_type and private columns to channels table
ALTER TABLE channels ADD COLUMN channel_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE channels ADD COLUMN private BOOLEAN NOT NULL DEFAULT FALSE;