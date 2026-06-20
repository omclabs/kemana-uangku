CREATE TABLE users_v2 (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user','reimbursement')),
  created_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  deleted_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  deleted_at INTEGER NULL
);

INSERT INTO users_v2 (
  id,
  username,
  email,
  password_hash,
  is_active,
  created_at,
  updated_at,
  role,
  created_by,
  updated_by,
  deleted_by,
  deleted_at
)
SELECT
  id,
  username,
  email,
  password_hash,
  is_active,
  created_at,
  updated_at,
  role,
  created_by,
  updated_by,
  deleted_by,
  deleted_at
FROM users;

DROP TABLE sessions;
DROP TABLE users;
ALTER TABLE users_v2 RENAME TO users;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE user_account_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, account_id)
);

CREATE INDEX idx_user_account_access_account_id
ON user_account_access(account_id);
