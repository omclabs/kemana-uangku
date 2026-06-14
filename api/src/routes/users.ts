import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import type { Bindings } from '../middleware/auth';
import { userCreate, userUpdate } from '../lib/validation';

const app = new Hono<{ Bindings: Bindings }>();

const SAFE_COLUMNS = 'id, username, email, is_active, created_at, updated_at';

type UserRow = {
  id: string;
  username: string;
  email: string;
  is_active: number;
  created_at: number;
  updated_at: number;
};

app.get('/', async (c) => {
  const includeInactive = c.req.query('include_inactive') === 'true';

  const query = includeInactive
    ? `SELECT ${SAFE_COLUMNS} FROM users`
    : `SELECT ${SAFE_COLUMNS} FROM users WHERE is_active = 1`;

  const { results } = await c.env.DB.prepare(query).all();

  return c.json(results, 200);
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first();

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(row, 200);
});

app.post('/', async (c) => {
  const body = userCreate.parse(await c.req.json());

  const conflict = await c.env.DB.prepare(
    'SELECT id FROM users WHERE username = ? OR email = ?'
  )
    .bind(body.username, body.email)
    .first();

  if (conflict) {
    return c.json({ error: 'username or email already in use' }, 409);
  }

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(body.password, 10);

  await c.env.DB.prepare(
    'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)'
  )
    .bind(id, body.username, body.email, passwordHash)
    .run();

  const row = await c.env.DB.prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first();

  return c.json(row, 201);
});

app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first<UserRow>();

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  const body = userUpdate.parse(await c.req.json());

  if (body.username !== undefined || body.email !== undefined) {
    const conflict = await c.env.DB.prepare(
      'SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?'
    )
      .bind(body.username ?? existing.username, body.email ?? existing.email, id)
      .first();

    if (conflict) {
      return c.json({ error: 'username or email already in use' }, 409);
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.username !== undefined) {
    fields.push('username = ?');
    values.push(body.username);
  }
  if (body.email !== undefined) {
    fields.push('email = ?');
    values.push(body.email);
  }
  if (body.password !== undefined) {
    fields.push('password_hash = ?');
    values.push(await bcrypt.hash(body.password, 10));
  }
  if (body.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(body.is_active ? 1 : 0);
  }

  if (fields.length > 0) {
    await c.env.DB.prepare(
      `UPDATE users SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`
    )
      .bind(...values, id)
      .run();
  } else {
    await c.env.DB.prepare('UPDATE users SET updated_at = unixepoch() WHERE id = ?')
      .bind(id)
      .run();
  }

  const row = await c.env.DB.prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first();

  return c.json(row, 200);
});

app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  const hard = c.req.query('hard') === 'true';

  if (hard) {
    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();

    return c.json({ id, deleted: true }, 200);
  }

  await c.env.DB.prepare('UPDATE users SET is_active = 0, updated_at = unixepoch() WHERE id = ?')
    .bind(id)
    .run();

  const row = await c.env.DB.prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first();

  return c.json(row, 200);
});

export default app;
