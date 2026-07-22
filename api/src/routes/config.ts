import { Hono } from 'hono';
import { getCurrentUser, type Bindings } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../lib/access';
import { configClearData, configUpdate } from '../lib/validation';

const app = new Hono<{ Bindings: Bindings }>();

function apiBuildInfo(env: Bindings) {
  return {
    version: env.APP_VERSION ?? 'dev',
    commit_sha: env.COMMIT_SHA ?? 'dev',
    deployed_at: env.DEPLOYED_AT ?? null,
  };
}

app.get('/', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM config WHERE id = 1').first();
  return c.json({ ...row, api_build: apiBuildInfo(c.env) }, 200);
});

app.put('/', async (c) => {
  const forbidden = requireAdmin(c);
  if (forbidden) return forbidden;

  const body = configUpdate.parse(await c.req.json());
  const actor = getCurrentUser(c);

  const fields = Object.keys(body) as (keyof typeof body)[];
  const setClauses = [...fields.map((field) => `${field} = ?`), 'updated_by = ?', 'last_updated = unixepoch()'];
  const values = fields.map((field) => body[field]);

  await c.env.DB.prepare(
    `UPDATE config
     SET ${setClauses.join(', ')}
     WHERE id = 1`
  )
    .bind(...values, actor?.id ?? null)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM config WHERE id = 1').first();
  return c.json({ ...row, api_build: apiBuildInfo(c.env) }, 200);
});

app.post('/clear-data', async (c) => {
  const forbidden = requireAdmin(c);
  if (forbidden) return forbidden;

  const actor = getCurrentUser(c);
  const body = configClearData.parse(await c.req.json());

  const existing = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
    .bind(actor?.id ?? null)
    .first<{ password_hash: string }>();

  if (!existing) {
    return c.json({ error: 'Admin account not found' }, 404);
  }

  const valid = await bcrypt.compare(body.current_password, existing.password_hash);
  if (!valid) {
    return c.json({ error: 'Current password is incorrect' }, 401);
  }

  const [transactions, budgets, monthlyBalances, accounts, trackedItems] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM transactions').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM budgets').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM monthly_balances').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM accounts').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM tracked_items').first<{ count: number }>(),
  ]);

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM budgets'),
    c.env.DB.prepare('DELETE FROM monthly_balances'),
    c.env.DB.prepare('DELETE FROM tracked_item_refills'),
    c.env.DB.prepare('DELETE FROM tracked_items'),
    c.env.DB.prepare('DELETE FROM transactions'),
    c.env.DB.prepare(
      `UPDATE accounts
       SET deleted_by = ?,
           deleted_at = unixepoch(),
           updated_by = ?,
           updated_at = unixepoch()`
    ).bind(actor?.id ?? null, actor?.id ?? null),
    c.env.DB.prepare('DELETE FROM accounts WHERE parent_id IS NOT NULL'),
    c.env.DB.prepare('DELETE FROM accounts WHERE parent_id IS NULL'),
  ]);

  return c.json(
    {
      ok: true,
      cleared: {
        transactions: transactions?.count ?? 0,
        budgets: budgets?.count ?? 0,
        monthly_balances: monthlyBalances?.count ?? 0,
        accounts: accounts?.count ?? 0,
        tracked_items: trackedItems?.count ?? 0,
      },
    },
    200
  );
});

app.post('/', (c) => c.json({ error: 'Method Not Allowed' }, 405));
app.delete('/', (c) => c.json({ error: 'Method Not Allowed' }, 405));

export default app;
