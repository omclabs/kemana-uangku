-- transactions: income/expense/transfer ledger entries
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  date INTEGER NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  amount REAL NOT NULL CHECK (amount > 0),
  note TEXT,
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
  transfer_to TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
  fee REAL CHECK (fee IS NULL OR fee >= 0),
  source TEXT NOT NULL DEFAULT 'single' CHECK (source IN ('single','bulk')),
  paid_status TEXT NOT NULL DEFAULT 'paid' CHECK (paid_status IN ('paid','settle')),
  recurring_group_id TEXT,
  recurring_mode TEXT CHECK (recurring_mode IS NULL OR recurring_mode IN ('recurring','installment')),
  installment_index INTEGER CHECK (installment_index IS NULL OR installment_index >= 1),
  installment_total INTEGER CHECK (installment_total IS NULL OR installment_total >= 2),
  parent_transaction_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_transfer_to ON transactions(transfer_to);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_recurring_group_id ON transactions(recurring_group_id);
CREATE INDEX idx_transactions_parent_transaction_id ON transactions(parent_transaction_id);
