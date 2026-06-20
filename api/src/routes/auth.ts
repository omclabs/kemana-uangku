import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import type { Bindings } from '../middleware/auth';
import { authLogin } from '../lib/validation';
import { assertRequiredBindings, isDefaultAdminPasswordHash } from '../lib/security';
import { hashToken, newSessionToken, SESSION_TTL_SECONDS } from '../lib/session';

const app = new Hono<{ Bindings: Bindings }>();

type UserAuthRow = {
  id: string;
  username: string;
  role: 'admin' | 'user' | 'reimbursement';
  password_hash: string;
  is_active: number;
};

app.post('/login', async (c) => {
  assertRequiredBindings(c.env);

  const body = authLogin.parse(await c.req.json());

  const row = await c.env.DB.prepare(
    'SELECT id, username, role, password_hash, is_active FROM users WHERE username = ?'
  )
    .bind(body.username)
    .first<UserAuthRow>();

  if (!row || row.is_active === 0) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const valid = await bcrypt.compare(body.password, row.password_hash);

  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const mustChangePassword =
    row.role === 'admin' && row.id === 'user-admin' && isDefaultAdminPasswordHash(row.password_hash);

  const token = newSessionToken();
  const tokenHash = await hashToken(token);
  const sessionId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const { results: accessRows } = await c.env.DB.prepare(
    `SELECT ua.account_id
     FROM user_account_access ua
     JOIN accounts a ON a.id = ua.account_id
     WHERE ua.user_id = ?
       AND a.type = 'credit_card'
       AND a.is_active = 1
     ORDER BY a.name COLLATE NOCASE ASC`
  )
    .bind(row.id)
    .all<{ account_id: string }>();

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(sessionId, row.id, tokenHash, expiresAt)
    .run();

  return c.json({
    token,
    must_change_password: mustChangePassword,
    user: {
      id: row.id,
      username: row.username,
      role: row.role,
      assigned_account_ids: (accessRows ?? []).map((access) => access.account_id),
    },
  }, 200);
});

export default app;
