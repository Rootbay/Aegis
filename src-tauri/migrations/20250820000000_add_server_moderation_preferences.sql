ALTER TABLE servers ADD COLUMN transparent_edits BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE servers ADD COLUMN deleted_message_display TEXT NOT NULL DEFAULT 'ghost';
