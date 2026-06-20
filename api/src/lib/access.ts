import { getCurrentUser } from '../middleware/auth';

type Role = 'admin' | 'user' | 'reimbursement';

type CurrentUserContext = {
  get(name: 'currentUser'): unknown;
  json: (body: unknown, status?: number) => Response;
};

type CurrentUser = {
  id: string;
  role: Role;
};

export function isReimbursement(user: CurrentUser | null | undefined): boolean {
  return user?.role === 'reimbursement';
}

export function requireAdmin(c: CurrentUserContext): Response | null {
  const user = getCurrentUser(c);
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return null;
}

export function requireNonReimbursement(c: CurrentUserContext): Response | null {
  const user = getCurrentUser(c);
  if (user?.role === 'reimbursement') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return null;
}

export async function listAccessibleAccountIds(
  db: D1Database,
  user: CurrentUser | null | undefined
): Promise<string[] | null> {
  if (!user || user.role !== 'reimbursement') {
    return null;
  }

  const { results } = await db.prepare(
    `SELECT ua.account_id
     FROM user_account_access ua
     JOIN accounts a ON a.id = ua.account_id
     WHERE ua.user_id = ?
       AND a.type = 'credit_card'
       AND a.is_active = 1
     ORDER BY a.name COLLATE NOCASE ASC`
  )
    .bind(user.id)
    .all<{ account_id: string }>();

  return (results ?? []).map((row) => row.account_id);
}

export async function requireAccountAccess(
  c: CurrentUserContext & { env: { DB: D1Database } },
  accountId: string
): Promise<Response | null> {
  const user = getCurrentUser(c);
  const allowedAccountIds = await listAccessibleAccountIds(c.env.DB, user);

  if (allowedAccountIds === null) {
    return null;
  }

  if (!allowedAccountIds.includes(accountId)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  return null;
}
