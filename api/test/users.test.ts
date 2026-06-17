import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';

const AUTH = { Authorization: 'Bearer test-token' };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

async function login(username: string, password: string): Promise<string> {
  const res = await SELF.fetch('https://example.com/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = (await res.json()) as { token: string };
  return body.token;
}

describe('/users', () => {
  it('POST /users without Authorization returns 401', async () => {
    const res = await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'noauth', email: 'noauth@example.com', password: 'password1' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /users with invalid email returns 400', async () => {
    const res = await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'bademail', email: 'not-an-email', password: 'password1' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /users with password shorter than 8 chars returns 400', async () => {
    const res = await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'shortpw', email: 'shortpw@example.com', password: 'short' }),
    });
    expect(res.status).toBe(400);
  });

  it('full user create/list/get/update/delete lifecycle', async () => {
    // Create
    const createRes = await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'alice', email: 'alice@example.com', password: 'hunter22' }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as Record<string, unknown>;
    expect(created).not.toHaveProperty('password_hash');
    expect(created.username).toBe('alice');
    expect(created.email).toBe('alice@example.com');
    expect(created.role).toBe('user');
    expect(created.is_active).toBe(1);
    expect(created.created_by).toBe('user-admin');
    expect(created.updated_by).toBe('user-admin');
    const id = created.id as string;

    // Duplicate username -> 409
    const dupUsernameRes = await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'alice', email: 'other@example.com', password: 'password1' }),
    });
    expect(dupUsernameRes.status).toBe(409);

    // Duplicate email -> 409
    const dupEmailRes = await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'other', email: 'alice@example.com', password: 'password1' }),
    });
    expect(dupEmailRes.status).toBe(409);

    // List includes the new user, no password_hash anywhere
    const listRes = await SELF.fetch('https://example.com/users', { headers: AUTH });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Record<string, unknown>[];
    expect(list.some((u) => u.id === id)).toBe(true);
    for (const u of list) {
      expect(u).not.toHaveProperty('password_hash');
    }

    // GET by id
    const getRes = await SELF.fetch(`https://example.com/users/${id}`, { headers: AUTH });
    expect(getRes.status).toBe(200);
    const got = (await getRes.json()) as Record<string, unknown>;
    expect(got).not.toHaveProperty('password_hash');
    expect(got.id).toBe(id);

    // GET nonexistent -> 404
    const getMissingRes = await SELF.fetch('https://example.com/users/does-not-exist', { headers: AUTH });
    expect(getMissingRes.status).toBe(404);

    // Capture original password hash directly from DB
    const before = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(id)
      .first<{ password_hash: string }>();

    // Update email + password
    const updateRes = await SELF.fetch(`https://example.com/users/${id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: 'alice2@example.com', password: 'newpassword1' }),
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as Record<string, unknown>;
    expect(updated).not.toHaveProperty('password_hash');
    expect(updated.email).toBe('alice2@example.com');
    expect(updated.updated_by).toBe('user-admin');
    expect(updated.updated_at as number).toBeGreaterThanOrEqual(updated.created_at as number);

    // Password hash actually changed and verifies against the new password
    const after = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(id)
      .first<{ password_hash: string }>();
    expect(after?.password_hash).not.toBe(before?.password_hash);
    expect(await bcrypt.compare('newpassword1', after!.password_hash)).toBe(true);

    // Soft delete
    const softDeleteRes = await SELF.fetch(`https://example.com/users/${id}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(softDeleteRes.status).toBe(200);
    const softDeleted = (await softDeleteRes.json()) as Record<string, unknown>;
    expect(softDeleted.is_active).toBe(0);
    expect(softDeleted.deleted_by).toBe('user-admin');
    expect(softDeleted.deleted_at).not.toBeNull();

    // Still GET-able by id after soft delete
    const getAfterSoftRes = await SELF.fetch(`https://example.com/users/${id}`, { headers: AUTH });
    expect(getAfterSoftRes.status).toBe(200);
  });

  it('POST /users/:id/change-password lifecycle', async () => {
    const createRes = await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'dave', email: 'dave@example.com', password: 'password1' }),
    });
    const { id } = (await createRes.json()) as { id: string };

    // Wrong current password -> 401
    const wrongRes = await SELF.fetch(`https://example.com/users/${id}/change-password`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ current_password: 'nope', new_password: 'newpassword1' }),
    });
    expect(wrongRes.status).toBe(401);

    // New password shorter than 8 chars -> 400
    const shortRes = await SELF.fetch(`https://example.com/users/${id}/change-password`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ current_password: 'password1', new_password: 'short' }),
    });
    expect(shortRes.status).toBe(400);

    const selfToken = await login('dave', 'password1');
    const selfHeaders = {
      Authorization: `Bearer ${selfToken}`,
      'Content-Type': 'application/json',
    };

    // Correct current password with self session -> 200, hash changes
    const before = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(id)
      .first<{ password_hash: string }>();

    const okRes = await SELF.fetch(`https://example.com/users/${id}/change-password`, {
      method: 'POST',
      headers: selfHeaders,
      body: JSON.stringify({ current_password: 'password1', new_password: 'newpassword1' }),
    });
    expect(okRes.status).toBe(200);
    const updated = (await okRes.json()) as Record<string, unknown>;
    expect(updated).not.toHaveProperty('password_hash');
    expect(updated.id).toBe(id);

    const after = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(id)
      .first<{ password_hash: string }>();
    expect(after?.password_hash).not.toBe(before?.password_hash);
    expect(await bcrypt.compare('newpassword1', after!.password_hash)).toBe(true);

    // Old password no longer works
    const staleRes = await SELF.fetch(`https://example.com/users/${id}/change-password`, {
      method: 'POST',
      headers: selfHeaders,
      body: JSON.stringify({ current_password: 'password1', new_password: 'anotherpassword' }),
    });
    expect(staleRes.status).toBe(401);
  });

  it('POST /users/:id/change-password for nonexistent user returns 404', async () => {
    const res = await SELF.fetch('https://example.com/users/does-not-exist/change-password', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ current_password: 'whatever', new_password: 'newpassword1' }),
    });
    expect(res.status).toBe(404);
  });

  it('PUT /users/:id with username taken by another user returns 409', async () => {
    const aRes = await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'bob', email: 'bob@example.com', password: 'password1' }),
    });
    const a = (await aRes.json()) as { id: string };

    await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'carol', email: 'carol@example.com', password: 'password1' }),
    });

    const conflictRes = await SELF.fetch(`https://example.com/users/${a.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'carol' }),
    });
    expect(conflictRes.status).toBe(409);
  });

  it('non-admin session cannot list users', async () => {
    await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username: 'erin', email: 'erin@example.com', password: 'password1' }),
    });

    const token = await login('erin', 'password1');
    const res = await SELF.fetch('https://example.com/users', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(403);
  });
});
