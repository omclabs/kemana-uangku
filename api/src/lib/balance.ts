// Balance delta helpers for the transactions ledger.
//
// Uniform sign for every account type, including credit_card/loan: an
// `expense` always subtracts `amount`, an `income` always adds it. A
// transfer is an `expense` on `account_id` ("from") plus an `income` on
// `transfer_to` ("to") -- this holds even for rows that were reclassified
// to `type: 'expense'` for credit_card/loan destinations, since the
// reclassification only changes the stored `type` label, not the
// from/to balance movement.

type TransactionEffect = 'income' | 'expense';

export type TransactionBalanceRow = {
  account_id: string;
  transfer_to: string | null;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
};

export type BalanceOp = {
  accountId: string;
  delta: number;
};

function deltaForAccount(effect: TransactionEffect, amount: number): number {
  return effect === 'income' ? amount : -amount;
}

// sign = +1 to apply (create/restore), -1 to reverse (delete/soft-delete)
export function transactionBalanceOps(row: TransactionBalanceRow, sign: 1 | -1): BalanceOp[] {
  if (row.transfer_to) {
    return [
      { accountId: row.account_id, delta: sign * deltaForAccount('expense', row.amount) },
      { accountId: row.transfer_to, delta: sign * deltaForAccount('income', row.amount) },
    ];
  }

  return [
    {
      accountId: row.account_id,
      delta: sign * deltaForAccount(row.type as TransactionEffect, row.amount),
    },
  ];
}

// Merges multiple op lists (e.g. reverse-old + apply-new for a PUT) into
// net per-account deltas, dropping any account whose net delta is zero.
export function mergeBalanceOps(...opLists: BalanceOp[][]): BalanceOp[] {
  const totals = new Map<string, number>();

  for (const ops of opLists) {
    for (const op of ops) {
      totals.set(op.accountId, (totals.get(op.accountId) ?? 0) + op.delta);
    }
  }

  return [...totals.entries()]
    .filter(([, delta]) => delta !== 0)
    .map(([accountId, delta]) => ({ accountId, delta }));
}

export function adjustBalanceStatement(db: D1Database, op: BalanceOp): D1PreparedStatement {
  return db
    .prepare('UPDATE accounts SET balance = balance + ?, updated_at = unixepoch() WHERE id = ?')
    .bind(op.delta, op.accountId);
}
