import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const AUTH = { Authorization: 'Bearer test-token' };
const JSON_HEADERS = { 'Content-Type': 'application/json' };

describe('/auth/login', () => {
  it('correct admin/admin credentials returns 200 with token === API_TOKEN', async () => {
    const res = await SELF.fetch('https://example.com/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: { id: string; username: string } };
    expect(body.token).toBe(env.API_TOKEN);
    expect(body.user.username).toBe('admin');
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
});

describe('protected routes still require auth after restructure', () => {
  it.each(['/config', '/categories', '/accounts', '/users'])('%s returns 401 without Authorization', async (path) => {
    const res = await SELF.fetch(`https://example.com${path}`);
    expect(res.status).toBe(401);
  });
});
