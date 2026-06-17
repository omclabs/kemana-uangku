import { createMiddleware } from 'hono/factory';
import { hashToken } from '../lib/session';

export type Bindings = {
  DB: D1Database;
  API_TOKEN: string;
  AI?: {
    run(model: string, input: unknown): Promise<unknown>;
  };
  RECEIPT_OCR_MODEL?: string;
};

export type Role = 'admin' | 'user';

export type AuthUser = {
  id: string;
  username: string;
  role: Role;
};

export function getCurrentUser(c: { get(name: 'currentUser'): unknown }): AuthUser | null {
  return (c.get('currentUser') as AuthUser | null) ?? null;
}

type SessionUserRow = AuthUser & {
  is_active: number;
};

export const authMiddleware = createMiddleware<{
  Bindings: Bindings;
  Variables: { currentUser: AuthUser | null };
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (token !== c.env.API_TOKEN) {
    const sessionUser = await c.env.DB.prepare(
      `SELECT u.id, u.username, u.role, u.is_active
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.is_active = 1 AND s.expires_at > unixepoch()`
    )
      .bind(await hashToken(token))
      .first<SessionUserRow>();

    if (!sessionUser || sessionUser.is_active !== 1) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    c.set('currentUser', {
      id: sessionUser.id,
      username: sessionUser.username,
      role: sessionUser.role,
    });

    await next();
    return;
  }

  const adminUser = await c.env.DB.prepare(
    `SELECT id, username, role
     FROM users
     WHERE role = 'admin' AND is_active = 1
     ORDER BY CASE WHEN id = 'user-admin' THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`
  ).first<AuthUser>();

  c.set('currentUser', adminUser ?? null);

  await next();
});
