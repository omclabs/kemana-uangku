import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import type { Bindings } from '../middleware/auth';
import { authLogin } from '../lib/validation';
import { hashToken, newSessionToken, SESSION_TTL_SECONDS } from '../lib/session';

const app = new Hono<{ Bindings: Bindings }>();

type UserAuthRow = {
  id: string;
  username: string;
  role: 'admin' | 'user';
  password_hash: string;
  is_active: number;
};

app.post('/login', async (c) => {
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

  const token = newSessionToken();
  const tokenHash = await hashToken(token);
  const sessionId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(sessionId, row.id, tokenHash, expiresAt)
    .run();

  return c.json({ token, user: { id: row.id, username: row.username, role: row.role } }, 200);
});

export default app;
