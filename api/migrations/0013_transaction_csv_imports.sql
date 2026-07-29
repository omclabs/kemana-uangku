CREATE TABLE transaction_csv_imports (
  id TEXT PRIMARY KEY,
  file_hash TEXT NOT NULL UNIQUE,
  file_name TEXT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  date INTEGER NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_transaction_csv_imports_account_id ON transaction_csv_imports(account_id);
