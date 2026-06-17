CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month_start INTEGER NOT NULL,
  month_key TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (category_id, month_start)
);

CREATE INDEX idx_budgets_month_start ON budgets(month_start);
CREATE INDEX idx_budgets_month_key ON budgets(month_key);
CREATE INDEX idx_budgets_category_id ON budgets(category_id);
