import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { getCurrentUser, type Bindings } from '../middleware/auth';
import { changePassword, userCreate, userUpdate } from '../lib/validation';

const app = new Hono<{ Bindings: Bindings }>();

const SAFE_COLUMNS =
  'id, username, email, role, is_active, created_at, updated_at, created_by, updated_by, deleted_by, deleted_at';

type UserRow = {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  is_active: number;
  created_at: number;
  updated_at: number;
};

function requireAdmin(c: {
  get(name: 'currentUser'): unknown;
  json: (body: unknown, status?: number) => Response;
}): Response | null {
  const user = getCurrentUser(c);
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return null;
}

app.get('/', async (c) => {
  const forbidden = requireAdmin(c);
  if (forbidden) return forbidden;

  const includeInactive = c.req.query('include_inactive') === 'true';

  const query = includeInactive
    ? `SELECT ${SAFE_COLUMNS} FROM users`
    : `SELECT ${SAFE_COLUMNS} FROM users WHERE is_active = 1`;

  const { results } = await c.env.DB.prepare(query).all();

  return c.json(results, 200);
});

app.get('/:id', async (c) => {
  const forbidden = requireAdmin(c);
  if (forbidden) return forbidden;

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
  const forbidden = requireAdmin(c);
  if (forbidden) return forbidden;

  const actor = getCurrentUser(c);
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
    `INSERT INTO users
      (id, username, email, password_hash, role, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, body.username, body.email, passwordHash, body.role ?? 'user', actor?.id ?? null, actor?.id ?? null)
    .run();

  const row = await c.env.DB.prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first();

  return c.json(row, 201);
});

app.put('/:id', async (c) => {
  const forbidden = requireAdmin(c);
  if (forbidden) return forbidden;

  const actor = getCurrentUser(c);
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
  if (body.role !== undefined) {
    fields.push('role = ?');
    values.push(body.role);
  }
  if (body.password !== undefined) {
    fields.push('password_hash = ?');
    values.push(await bcrypt.hash(body.password, 10));
  }
  if (body.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(body.is_active ? 1 : 0);
    if (body.is_active) {
      fields.push('deleted_by = NULL');
      fields.push('deleted_at = NULL');
    } else {
      fields.push('deleted_by = ?');
      values.push(actor?.id ?? null);
      fields.push('deleted_at = unixepoch()');
    }
  }

  if (fields.length > 0) {
    fields.push('updated_by = ?');
    values.push(actor?.id ?? null);

    await c.env.DB.prepare(
      `UPDATE users SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`
    )
      .bind(...values, id)
      .run();
  } else {
    await c.env.DB.prepare('UPDATE users SET updated_by = ?, updated_at = unixepoch() WHERE id = ?')
      .bind(actor?.id ?? null, id)
      .run();
  }

  const row = await c.env.DB.prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first();

  return c.json(row, 200);
});

app.post('/:id/change-password', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');

  if (!actor || (actor.role !== 'admin' && actor.id !== id)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const existing = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
    .bind(id)
    .first<{ password_hash: string }>();

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  const body = changePassword.parse(await c.req.json());

  const valid = await bcrypt.compare(body.current_password, existing.password_hash);

  if (!valid) {
    return c.json({ error: 'Current password is incorrect' }, 401);
  }

  const passwordHash = await bcrypt.hash(body.new_password, 10);

  await c.env.DB.prepare(
    'UPDATE users SET password_hash = ?, updated_by = ?, updated_at = unixepoch() WHERE id = ?'
  )
    .bind(passwordHash, actor.id, id)
    .run();

  await c.env.DB.prepare(
    `UPDATE sessions
     SET is_active = 0
     WHERE user_id = ?`
  )
    .bind(id)
    .run();

  const row = await c.env.DB.prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first();

  return c.json(row, 200);
});

app.delete('/:id', async (c) => {
  const forbidden = requireAdmin(c);
  if (forbidden) return forbidden;

  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  await c.env.DB.prepare(
    `UPDATE users
     SET is_active = 0,
         updated_by = ?,
         deleted_by = ?,
         deleted_at = unixepoch(),
         updated_at = unixepoch()
     WHERE id = ?`
  )
    .bind(actor?.id ?? null, actor?.id ?? null, id)
    .run();

  const row = await c.env.DB.prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first();

  return c.json(row, 200);
});

export default app;
