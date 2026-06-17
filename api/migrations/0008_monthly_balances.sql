CREATE TABLE monthly_balances (
  month_start INTEGER PRIMARY KEY,
  month_key TEXT NOT NULL UNIQUE,
  income REAL NOT NULL DEFAULT 0,
  expense REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_monthly_balances_month_key ON monthly_balances(month_key);

WITH monthly AS (
  SELECT
    CAST(strftime('%s', strftime('%Y-%m-01 00:00:00', date, 'unixepoch')) AS INTEGER) AS month_start,
    COALESCE(SUM(CASE WHEN type = 'income' AND transfer_to IS NULL THEN amount ELSE 0 END), 0) AS income,
    COALESCE(SUM(CASE WHEN type = 'expense' AND transfer_to IS NULL THEN amount ELSE 0 END), 0) AS expense
  FROM transactions
  WHERE is_active = 1
  GROUP BY month_start
),
running AS (
  SELECT
    month_start,
    strftime('%Y-%m', month_start, 'unixepoch') AS month_key,
    income,
    expense,
    SUM(income - expense) OVER (ORDER BY month_start ASC) AS balance
  FROM monthly
)
INSERT INTO monthly_balances (month_start, month_key, income, expense, balance)
SELECT month_start, month_key, income, expense, balance
FROM running;
