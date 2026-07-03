CREATE TABLE tracked_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  unit TEXT NOT NULL,
  warning_days INTEGER NOT NULL DEFAULT 3 CHECK (warning_days >= 1),
  avg_daily_usage REAL,
  latest_quantity_added REAL,
  estimated_run_out_at INTEGER,
  next_reminder_at INTEGER,
  forecast_ready INTEGER NOT NULL DEFAULT 0 CHECK (forecast_ready IN (0,1)),
  last_forecasted_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  deleted_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  deleted_at INTEGER NULL
);

CREATE INDEX idx_tracked_items_category_id ON tracked_items(category_id);
CREATE INDEX idx_tracked_items_is_active ON tracked_items(is_active);
CREATE INDEX idx_tracked_items_next_reminder_at ON tracked_items(next_reminder_at);

CREATE TABLE tracked_item_refills (
  id TEXT PRIMARY KEY,
  tracked_item_id TEXT NOT NULL REFERENCES tracked_items(id) ON DELETE CASCADE,
  transaction_id TEXT UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  date INTEGER NOT NULL,
  quantity_added REAL NOT NULL CHECK (quantity_added > 0),
  remaining_qty_before_refill REAL CHECK (remaining_qty_before_refill IS NULL OR remaining_qty_before_refill >= 0),
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_tracked_item_refills_item_date
ON tracked_item_refills(tracked_item_id, date);
