ALTER TABLE messages ADD COLUMN reply_to_message_id TEXT;
ALTER TABLE messages ADD COLUMN reply_snapshot_author TEXT;
ALTER TABLE messages ADD COLUMN reply_snapshot_snippet TEXT;
