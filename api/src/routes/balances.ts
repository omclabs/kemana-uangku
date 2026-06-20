import { Hono } from 'hono';
import { getCurrentUser, type Bindings } from '../middleware/auth';
import { listAccessibleAccountIds } from '../lib/access';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const from = c.req.query('from');
  const to = c.req.query('to');
  const limit = Number(c.req.query('limit') ?? 24);
  const accessibleAccountIds = await listAccessibleAccountIds(c.env.DB, user);

  if (accessibleAccountIds !== null) {
    if (accessibleAccountIds.length === 0) {
      return c.json([], 200);
    }

    const conditions: string[] = ['is_active = 1'];
    const values: unknown[] = [];
    const placeholders = accessibleAccountIds.map(() => '?').join(',');
    conditions.push(`account_id IN (${placeholders})`);
    values.push(...accessibleAccountIds);

    if (from) {
      conditions.push('date >= ?');
      values.push(Number(from));
    }
    if (to) {
      conditions.push('date <= ?');
      values.push(Number(to));
    }

    let query = `
      SELECT
        CAST(strftime('%s', strftime('%Y-%m-01 00:00:00', date, 'unixepoch')) AS INTEGER) AS month_start,
        strftime('%Y-%m', date, 'unixepoch') AS month_key,
        COALESCE(SUM(CASE WHEN type = 'income' AND transfer_to IS NULL THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND transfer_to IS NULL THEN amount ELSE 0 END), 0) AS expense
      FROM transactions
      WHERE ${conditions.join(' AND ')}
      GROUP BY month_start, month_key
      ORDER BY month_start DESC
    `;

    if (Number.isFinite(limit) && limit > 0) {
      query += ' LIMIT ?';
      values.push(Math.floor(limit));
    }

    const { results } = await c.env.DB.prepare(query).bind(...values).all<{
      month_start: number;
      month_key: string;
      income: number;
      expense: number;
    }>();

    const rows = (results ?? []).reverse();
    let runningBalance = 0;
    const payload = rows.map((row) => {
      runningBalance += row.income - row.expense;
      return {
        ...row,
        balance: runningBalance,
      };
    }).reverse();

    return c.json(payload, 200);
  }

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (from) {
    conditions.push('month_start >= ?');
    values.push(Number(from));
  }
  if (to) {
    conditions.push('month_start <= ?');
    values.push(Number(to));
  }

  let query = 'SELECT * FROM monthly_balances';
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }
  query += ' ORDER BY month_start DESC';

  if (Number.isFinite(limit) && limit > 0) {
    query += ' LIMIT ?';
    values.push(Math.floor(limit));
  }

  const { results } = await c.env.DB.prepare(query).bind(...values).all();
  return c.json(results, 200);
});

export default app;
