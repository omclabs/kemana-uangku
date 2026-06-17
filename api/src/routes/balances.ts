import { Hono } from 'hono';
import type { Bindings } from '../middleware/auth';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', async (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  const limit = Number(c.req.query('limit') ?? 24);

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
