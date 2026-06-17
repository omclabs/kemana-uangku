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
});
