ALTER TABLE transactions ADD COLUMN merchant TEXT NULL;

CREATE INDEX idx_transactions_merchant ON transactions(merchant);
