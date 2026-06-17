-- config: singleton row, id is always 1
CREATE TABLE config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version TEXT NOT NULL,
  default_timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  currency TEXT NOT NULL DEFAULT 'IDR',
  last_updated INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO config (id, version, default_timezone, currency, last_updated)
VALUES (1, '0.1.0', 'Asia/Jakarta', 'IDR', unixepoch());

-- categories: parent/child, depth <= 1 (enforced in API)
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  parent_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  budget_monthly REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_categories_parent_id ON categories(parent_id);
CREATE INDEX idx_categories_type ON categories(type);

-- accounts: parent/child, depth <= 1 (enforced in API)
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bank','cash','autodebet','credit_card','prepaid','savings','investment','loan')),
  balance REAL NOT NULL DEFAULT 0,
  parent_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
  credit_limit REAL,
  billing_date INTEGER CHECK (billing_date IS NULL OR (billing_date BETWEEN 1 AND 28)),
  include_in_total INTEGER NOT NULL DEFAULT 1 CHECK (include_in_total IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_accounts_parent_id ON accounts(parent_id);
CREATE INDEX idx_accounts_type ON accounts(type);
