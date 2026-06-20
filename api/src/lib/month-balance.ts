type MonthlyBalanceRow = {
  month_start: number;
  month_key: string;
  income: number;
  expense: number;
  balance: number;
};

type MonthlyAggregateRow = {
  month_start: number;
  income: number;
  expense: number;
};

function monthStartUnix(unixSeconds: number): number {
  const date = new Date(unixSeconds * 1000);
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
}

function monthKeyFromUnix(monthStart: number): string {
  const date = new Date(monthStart * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function rebuildMonthlyBalancesFrom(
  db: D1Database,
  fromUnixSeconds: number,
  actorId: string | null
): Promise<void> {
  const fromMonthStart = monthStartUnix(fromUnixSeconds);

  const previousMonth = await db.prepare(
    `SELECT balance
     FROM monthly_balances
     WHERE month_start < ?
     ORDER BY month_start DESC
     LIMIT 1`
  )
    .bind(fromMonthStart)
    .first<{ balance: number }>();

  const openingBalance = previousMonth?.balance ?? 0;

  const { results } = await db.prepare(
    `SELECT
       CAST(strftime('%s', strftime('%Y-%m-01 00:00:00', date, 'unixepoch')) AS INTEGER) AS month_start,
       COALESCE(SUM(CASE WHEN type = 'income' AND transfer_to IS NULL THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' AND transfer_to IS NULL THEN amount ELSE 0 END), 0) AS expense
     FROM transactions
     WHERE is_active = 1
       AND date >= ?
     GROUP BY month_start
     ORDER BY month_start ASC`
  )
    .bind(fromMonthStart)
    .all<MonthlyAggregateRow>();

  const rows = results ?? [];
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM monthly_balances WHERE month_start >= ?').bind(fromMonthStart),
  ];

  let runningBalance = openingBalance;

  for (const row of rows) {
    runningBalance += row.income - row.expense;
    statements.push(
      db.prepare(
        `INSERT INTO monthly_balances
          (month_start, month_key, income, expense, balance, created_by, updated_by, deleted_by, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
      ).bind(
        row.month_start,
        monthKeyFromUnix(row.month_start),
        row.income,
        row.expense,
        runningBalance,
        actorId,
        actorId
      )
    );
  }

  await db.batch(statements);
}

export type { MonthlyBalanceRow };
