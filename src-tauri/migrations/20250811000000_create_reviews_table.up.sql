CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'server')),
    subject_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    content TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_subject ON reviews(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_reviews_author ON reviews(author_id);
