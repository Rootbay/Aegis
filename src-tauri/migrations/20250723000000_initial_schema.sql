-- Add UUID extension for id generation
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL,
    online BOOLEAN NOT NULL DEFAULT FALSE,
    public_key TEXT,
    bio TEXT,
    tag TEXT
);

CREATE TABLE IF NOT EXISTS friends (
    id TEXT PRIMARY KEY NOT NULL, -- This is the friend's user_id
    user_id TEXT NOT NULL, -- The ID of the current user who has this friend
    name TEXT NOT NULL,
    avatar TEXT NOT NULL,
    online BOOLEAN NOT NULL DEFAULT FALSE,
    last_message_content TEXT,
    last_message_timestamp TEXT, -- Stored as ISO 8601 string
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY NOT NULL,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    chat_id TEXT NOT NULL, -- Can be friend_id or channel_id
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL, -- Stored as ISO 8601 string
    read BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);