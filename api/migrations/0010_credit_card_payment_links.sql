ALTER TABLE transactions
ADD COLUMN payment_transaction_id TEXT NULL REFERENCES transactions(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_payment_transaction_id
ON transactions(payment_transaction_id);
