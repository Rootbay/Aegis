-- Track which members belong to which roles per server
CREATE TABLE IF NOT EXISTS server_role_assignments (
    server_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (server_id, role_id, user_id),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES server_roles(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_server_role_assignments_role
    ON server_role_assignments(role_id);

CREATE INDEX IF NOT EXISTS idx_server_role_assignments_user
    ON server_role_assignments(user_id);
