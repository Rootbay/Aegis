CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, id UNINDEXED);

CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(id, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE id = old.id;
END;

CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  UPDATE messages_fts SET content = new.content WHERE id = new.id;
END;

INSERT INTO messages_fts(id, content) SELECT id, content FROM messages;