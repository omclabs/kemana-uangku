import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { getCurrentUser, type Bindings } from '../middleware/auth';
import { requireAdmin } from '../lib/access';
import { applyActiveToggleFields, inPlaceholders, softDeleteStatement } from '../lib/db';
import { changePassword, userCreate, userUpdate } from '../lib/validation';

const app = new Hono<{ Bindings: Bindings }>();

const SAFE_COLUMNS =
  'id, username, email, role, is_active, created_at, updated_at, created_by, updated_by, deleted_by, deleted_at';

type UserRow = {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user' | 'reimbursement';
  is_active: number;
  created_at: number;
  updated_at: number;
};

type UserResponse = UserRow & {
  created_by: string | null;
  updated_by: string | null;
  deleted_by: string | null;
  deleted_at: number | null;
  assigned_account_ids: string[];
};

async function validateAssignedCreditCardAccounts(
  db: D1Database,
  accountIds: string[]
): Promise<string | null> {
  if (accountIds.length === 0) {
    return null;
  }

  const uniqueIds = [...new Set(accountIds)];
  const placeholders = inPlaceholders(uniqueIds);
  const { results } = await db.prepare(
    `SELECT id, type, is_active
     FROM accounts
     WHERE id IN (${placeholders})`
  )
    .bind(...uniqueIds)
    .all<{ id: string; type: string; is_active: number }>();

  if ((results ?? []).length !== uniqueIds.length) {
    return 'one or more assigned accounts were not found';
  }

  for (const row of results ?? []) {
    if (row.type !== 'credit_card') {
      return 'assigned accounts must be credit card accounts';
    }
    if (row.is_active !== 1) {
      return 'assigned accounts must be active';
    }
  }

  return null;
}

async function replaceAssignedAccounts(
  db: D1Database,
  userId: string,
  accountIds: string[],
  actorId: string | null
): Promise<void> {
  const uniqueIds = [...new Set(accountIds)];
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM user_account_access WHERE user_id = ?').bind(userId),
  ];

  for (const accountId of uniqueIds) {
    statements.push(
      db.prepare(
        `INSERT INTO user_account_access
          (user_id, account_id, created_by, updated_by)
         VALUES (?, ?, ?, ?)`
      ).bind(userId, accountId, actorId, actorId)
    );
  }

  await db.batch(statements);
}

async function loadAssignedAccountIds(
  db: D1Database,
  userIds: string[]
): Promise<Map<string, string[]>> {
  const grants = new Map<string, string[]>();
  if (userIds.length === 0) {
    return grants;
  }

  const placeholders = inPlaceholders(userIds);
  const { results } = await db.prepare(
    `SELECT ua.user_id, ua.account_id
     FROM user_account_access ua
     JOIN accounts a ON a.id = ua.account_id
     WHERE ua.user_id IN (${placeholders})
       AND a.type = 'credit_card'
     ORDER BY a.name COLLATE NOCASE ASC`
  )
    .bind(...userIds)
    .all<{ user_id: string; account_id: string }>();

  for (const row of results ?? []) {
    const existing = grants.get(row.user_id) ?? [];
    existing.push(row.account_id);
    grants.set(row.user_id, existing);
  }

  return grants;
}

async function withAssignedAccounts(
  db: D1Database,
  rows: UserResponse[]
): Promise<UserResponse[]> {
  const accountIdsByUser = await loadAssignedAccountIds(db, rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    assigned_account_ids: accountIdsByUser.get(row.id) ?? [],
  }));
}

app.get('/', async (c) => {
  const forbidden = requireAdmin(c);
  if (forbidden) return forbidden;

  const includeInactive = c.req.query('include_inactive') === 'true';

  const query = includeInactive
    ? `SELECT ${SAFE_COLUMNS} FROM users`
    : `SELECT ${SAFE_COLUMNS} FROM users WHERE is_active = 1`;

  const { results } = await c.env.DB.prepare(query).all();

  return c.json(await withAssignedAccounts(c.env.DB, (results ?? []) as UserResponse[]), 200);
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

  return c.json((await withAssignedAccounts(c.env.DB, [row as UserResponse]))[0], 200);
});

app.post('/', async (c) => {
  const forbidden = requireAdmin(c);
  if (forbidden) return forbidden;

  const actor = getCurrentUser(c);
  const body = userCreate.parse(await c.req.json());
  const assignedAccountIds = body.role === 'reimbursement'
    ? [...new Set(body.assigned_account_ids ?? [])]
    : [];

  const accountError = await validateAssignedCreditCardAccounts(c.env.DB, assignedAccountIds);
  if (accountError) {
    return c.json({ error: accountError }, 400);
  }

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

  await replaceAssignedAccounts(c.env.DB, id, assignedAccountIds, actor?.id ?? null);

  const row = await c.env.DB.prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first();

  return c.json((await withAssignedAccounts(c.env.DB, [row as UserResponse]))[0], 201);
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
  const resultingRole = body.role ?? existing.role;
  const existingAssignedAccountIds = (await loadAssignedAccountIds(c.env.DB, [id])).get(id) ?? [];
  const assignedAccountIds = resultingRole === 'reimbursement'
    ? [...new Set(body.assigned_account_ids ?? existingAssignedAccountIds)]
    : [];

  const accountError = await validateAssignedCreditCardAccounts(c.env.DB, assignedAccountIds);
  if (accountError) {
    return c.json({ error: accountError }, 400);
  }

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
    applyActiveToggleFields(fields, values, body.is_active, actor?.id ?? null);
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

  await replaceAssignedAccounts(c.env.DB, id, assignedAccountIds, actor?.id ?? null);

  return c.json((await withAssignedAccounts(c.env.DB, [row as UserResponse]))[0], 200);
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

  return c.json((await withAssignedAccounts(c.env.DB, [row as UserResponse]))[0], 200);
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

  await softDeleteStatement(c.env.DB, 'users', id, actor?.id ?? null).run();

  await replaceAssignedAccounts(c.env.DB, id, [], actor?.id ?? null);

  const row = await c.env.DB.prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first();

  return c.json((await withAssignedAccounts(c.env.DB, [row as UserResponse]))[0], 200);
});

export default app;
