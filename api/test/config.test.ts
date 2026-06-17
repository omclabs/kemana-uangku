import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const AUTH = { Authorization: 'Bearer test-token' };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

describe('/config', () => {
  it('GET /config without Authorization header returns 401', async () => {
    const res = await SELF.fetch('https://example.com/config');
    expect(res.status).toBe(401);
  });

  it('GET /config with auth returns the seeded row', async () => {
    const res = await SELF.fetch('https://example.com/config', { headers: AUTH });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(1);
    expect(body.version).toBe('0.1.0');
    expect(body.default_timezone).toBe('Asia/Jakarta');
    expect(body.currency).toBe('IDR');
  });

  it('PUT /config updates currency and bumps last_updated', async () => {
    const before = await SELF.fetch('https://example.com/config', { headers: AUTH });
    const beforeBody = (await before.json()) as { last_updated: number };

    const res = await SELF.fetch('https://example.com/config', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ currency: 'USD' }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { currency: string; last_updated: number };
    expect(body.currency).toBe('USD');
    expect(body.last_updated).toBeGreaterThanOrEqual(beforeBody.last_updated);

    const audit = await env.DB.prepare('SELECT updated_by FROM config WHERE id = 1').first<{ updated_by: string | null }>();
    expect(audit?.updated_by).toBe('user-admin');
  });

  it('POST /config/clear-data clears finance data and deletes accounts', async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO transactions
          (id, date, account_id, category_id, amount, type, note, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        'tx-clear-data',
        Math.floor(new Date('2026-06-01T00:00:00Z').getTime() / 1000),
        'acc-bank-bca',
        'cat-food-breakfast',
        125000,
        'expense',
        'Reset me',
        'user-admin',
        'user-admin'
      ),
      env.DB.prepare(
        `INSERT INTO budgets
          (id, category_id, month_start, month_key, amount, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        'budget-clear-data',
        'cat-food',
        Math.floor(new Date('2026-06-01T00:00:00Z').getTime() / 1000),
        '2026-06',
        500000,
        'user-admin',
        'user-admin'
      ),
      env.DB.prepare(
        `INSERT INTO monthly_balances
          (month_start, month_key, income, expense, balance, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        Math.floor(new Date('2026-06-01T00:00:00Z').getTime() / 1000),
        '2026-06',
        0,
        125000,
        -125000,
        'user-admin',
        'user-admin'
      ),
      env.DB.prepare(
        `INSERT INTO accounts
          (id, name, type, balance, parent_id, include_in_total, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        'acc-clear-data-child',
        'Clear Data Child',
        'bank',
        12345,
        'acc-bank-bca',
        1,
        'user-admin',
        'user-admin'
      ),
    ]);

    const res = await SELF.fetch('https://example.com/config/clear-data', {
      method: 'POST',
      headers: AUTH,
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      ok: boolean;
      cleared: { transactions: number; budgets: number; monthly_balances: number; accounts: number };
    };
    expect(body.ok).toBe(true);
    expect(body.cleared.transactions).toBeGreaterThanOrEqual(1);
    expect(body.cleared.budgets).toBeGreaterThanOrEqual(1);
    expect(body.cleared.monthly_balances).toBeGreaterThanOrEqual(1);
    expect(body.cleared.accounts).toBeGreaterThanOrEqual(1);

    const counts = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS count FROM transactions').first<{ count: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM budgets').first<{ count: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM monthly_balances').first<{ count: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM accounts').first<{ count: number }>(),
    ]);

    expect(counts[0]?.count).toBe(0);
    expect(counts[1]?.count).toBe(0);
    expect(counts[2]?.count).toBe(0);
    expect(counts[3]?.count).toBe(0);
  });

  it('POST /config returns 405', async () => {
    const res = await SELF.fetch('https://example.com/config', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(405);
  });

  it('DELETE /config returns 405', async () => {
    const res = await SELF.fetch('https://example.com/config', {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(res.status).toBe(405);
  });

  it('POST /config/clear-data rejects non-admin users', async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users
          (id, username, email, password_hash, role, is_active, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        'user-config-regular',
        'config-regular',
        'config-regular@example.com',
        '$2b$10$QjBGehZoncz48XTspt34PuX1UPkRIutS5akOV5fprLDafPCWhDNoW',
        'user',
        1,
        'user-admin',
        'user-admin'
      ),
      env.DB.prepare(
        `INSERT INTO sessions
          (id, user_id, token_hash, expires_at, is_active)
         VALUES (?, ?, ?, unixepoch() + 3600, 1)`
      ).bind(
        'session-config-regular',
        'user-config-regular',
        '7a16f44e82f892c5db994ff1fe2c468656ad31af77ebe04b1d02be3bf8d4cc8e'
      ),
    ]);

    const res = await SELF.fetch('https://example.com/config/clear-data', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-session-token' },
    });

    expect(res.status).toBe(403);
  });
});
