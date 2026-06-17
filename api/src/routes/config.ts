import { Hono } from 'hono';
import { getCurrentUser, type Bindings } from '../middleware/auth';
import { configUpdate } from '../lib/validation';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM config WHERE id = 1').first();
  return c.json(row, 200);
});

app.put('/', async (c) => {
  const body = configUpdate.parse(await c.req.json());
  const actor = getCurrentUser(c);

  const fields = Object.keys(body) as (keyof typeof body)[];
  if (fields.length > 0) {
    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => body[field]);

    await c.env.DB.prepare(
      `UPDATE config
       SET ${setClause}, updated_by = ?, last_updated = unixepoch()
       WHERE id = 1`
    )
      .bind(...values, actor?.id ?? null)
      .run();
  } else {
    await c.env.DB.prepare(
      'UPDATE config SET updated_by = ?, last_updated = unixepoch() WHERE id = 1'
    )
      .bind(actor?.id ?? null)
      .run();
  }

  const row = await c.env.DB.prepare('SELECT * FROM config WHERE id = 1').first();
  return c.json(row, 200);
});

app.post('/', (c) => c.json({ error: 'Method Not Allowed' }, 405));
app.delete('/', (c) => c.json({ error: 'Method Not Allowed' }, 405));

export default app;
