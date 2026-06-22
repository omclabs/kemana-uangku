import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const AUTH = { Authorization: 'Bearer test-token' };
const JSON_HEADERS = { 'Content-Type': 'application/json' };

describe('/auth/login', () => {
  it('correct admin/admin credentials returns 200 with a session token and role', async () => {
    const res = await SELF.fetch('https://example.com/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      must_change_password: boolean;
      user: { id: string; username: string; role: string };
    };
    expect(body.token).not.toBe(env.API_TOKEN);
    expect(body.token.length).toBeGreaterThan(20);
    expect(body.must_change_password).toBe(true);
    expect(body.user.username).toBe('admin');
    expect(body.user.role).toBe('admin');
  });

  it('wrong password returns 401', async () => {
    const res = await SELF.fetch('https://example.com/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' }),
    });
    expect(res.status).toBe(401);
  });

  it('unknown username returns 401', async () => {
    const res = await SELF.fetch('https://example.com/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'does-not-exist', password: 'whatever' }),
    });
    expect(res.status).toBe(401);
  });

  it('inactive user returns 401', async () => {
    const createRes = await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({ username: 'deactivated', email: 'deactivated@example.com', password: 'password1' }),
    });
    const created = (await createRes.json()) as { id: string };

    await SELF.fetch(`https://example.com/users/${created.id}`, {
      method: 'DELETE',
      headers: AUTH,
    });

    const loginRes = await SELF.fetch('https://example.com/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'deactivated', password: 'password1' }),
    });
    expect(loginRes.status).toBe(401);
  });

  it('does not require an Authorization header', async () => {
    const res = await SELF.fetch('https://example.com/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    expect(res.status).not.toBe(401);
  });

  it('reimbursement login includes assigned credit card ids', async () => {
    const accountRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({
        name: 'Reimbursement Card',
        type: 'credit_card',
        balance: 0,
        credit_limit: 5000000,
        billing_date: 19,
      }),
    });
    const account = (await accountRes.json()) as { id: string };

    await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({
        username: 'reimburse-auth',
        email: 'reimburse-auth@example.com',
        password: 'password1',
        role: 'reimbursement',
        assigned_account_ids: [account.id],
      }),
    });

    const res = await SELF.fetch('https://example.com/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'reimburse-auth', password: 'password1' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { role: string; assigned_account_ids: string[] };
    };
    expect(body.user.role).toBe('reimbursement');
    expect(body.user.assigned_account_ids).toEqual([account.id]);
  });

  it('admin login does not include assigned account ids even after role promotion', async () => {
    const accountRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({
        name: 'Promoted Admin Card',
        type: 'credit_card',
        balance: 0,
        credit_limit: 5000000,
        billing_date: 19,
      }),
    });
    const account = (await accountRes.json()) as { id: string };

    const createRes = await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({
        username: 'promoted-admin',
        email: 'promoted-admin@example.com',
        password: 'password1',
        role: 'reimbursement',
        assigned_account_ids: [account.id],
      }),
    });
    const created = (await createRes.json()) as { id: string };

    const updateRes = await SELF.fetch(`https://example.com/users/${created.id}`, {
      method: 'PUT',
      headers: { ...AUTH, ...JSON_HEADERS },
      body: JSON.stringify({
        role: 'admin',
      }),
    });
    expect(updateRes.status).toBe(200);

    const res = await SELF.fetch('https://example.com/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'promoted-admin', password: 'password1' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { role: string; assigned_account_ids: string[] };
    };
    expect(body.user.role).toBe('admin');
    expect(body.user.assigned_account_ids).toEqual([]);
  });

  it('rejects disallowed browser origins', async () => {
    const res = await SELF.fetch('https://example.com/auth/login', {
      method: 'POST',
      headers: {
        ...JSON_HEADERS,
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('protected routes still require auth after restructure', () => {
  it.each(['/config', '/categories', '/accounts', '/balances', '/budgets', '/users'])('%s returns 401 without Authorization', async (path) => {
    const res = await SELF.fetch(`https://example.com${path}`);
    expect(res.status).toBe(401);
  });
});
