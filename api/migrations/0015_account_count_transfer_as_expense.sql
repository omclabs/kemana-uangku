ALTER TABLE accounts ADD COLUMN count_transfer_as_expense INTEGER NOT NULL DEFAULT 0 CHECK (count_transfer_as_expense IN (0,1));
