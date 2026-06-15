import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const AUTH = { Authorization: 'Bearer test-token' };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

describe('/categories', () => {
  it('POST /categories with invalid type returns 400', async () => {
    const res = await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Bad', type: 'invalid' }),
    });
    expect(res.status).toBe(400);
  });

  it('full category hierarchy and delete lifecycle', async () => {
    // Create a top-level expense category
    const parentRes = await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Food', type: 'expense' }),
    });
    expect(parentRes.status).toBe(201);
    const parent = (await parentRes.json()) as { id: string; type: string; parent_id: string | null };
    expect(parent.parent_id).toBeNull();
    const parentId = parent.id;

    // Create a child of the parent with the same type
    const childRes = await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Groceries', type: 'expense', parent_id: parentId }),
    });
    expect(childRes.status).toBe(201);
    const child = (await childRes.json()) as { id: string };
    const childId = child.id;

    // Reject parent_id pointing at a row that itself has a parent_id (depth > 1)
    const depthRes = await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Too Deep', type: 'expense', parent_id: childId }),
    });
    expect(depthRes.status).toBe(400);

    // Reject type differing from parent's type
    const typeMismatchRes = await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Salary', type: 'income', parent_id: parentId }),
    });
    expect(typeMismatchRes.status).toBe(400);

    // Reject type change on parent while it has a child
    const typeChangeRes = await SELF.fetch(`https://example.com/categories/${parentId}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ type: 'income' }),
    });
    expect(typeChangeRes.status).toBe(400);

    // Reject delete of parent while child is active
    const deleteWithActiveChildRes = await SELF.fetch(`https://example.com/categories/${parentId}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(deleteWithActiveChildRes.status).toBe(409);

    // Soft-delete the child
    const softDeleteChildRes = await SELF.fetch(`https://example.com/categories/${childId}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(softDeleteChildRes.status).toBe(200);

    // Verify the child shows is_active = 0 via include_inactive
    const childAfterRes = await SELF.fetch(
      `https://example.com/categories/${childId}?include_inactive=true`,
      { headers: AUTH }
    );
    expect(childAfterRes.status).toBe(200);
    const childAfter = (await childAfterRes.json()) as { is_active: number };
    expect(childAfter.is_active).toBe(0);

    // Now soft-delete the parent (no active children left)
    const softDeleteParentRes = await SELF.fetch(`https://example.com/categories/${parentId}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(softDeleteParentRes.status).toBe(200);
    const softDeletedParent = (await softDeleteParentRes.json()) as { is_active: number };
    expect(softDeletedParent.is_active).toBe(0);

    // Hard delete the leaf child (zero children) -> 200, then GET -> 404
    const hardDeleteChildRes = await SELF.fetch(
      `https://example.com/categories/${childId}?hard=true`,
      { method: 'DELETE', headers: AUTH }
    );
    expect(hardDeleteChildRes.status).toBe(200);

    const getAfterHardDeleteRes = await SELF.fetch(`https://example.com/categories/${childId}`, {
      headers: AUTH,
    });
    expect(getAfterHardDeleteRes.status).toBe(404);

    // Hard delete the parent: it had children (now hard-deleted), but to test
    // the 409-with-children case we need a parent that currently still has a child.
  });

  it('DELETE /categories/:id?hard=true with children returns 409', async () => {
    const parentRes = await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Transport', type: 'expense' }),
    });
    const parent = (await parentRes.json()) as { id: string };

    await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Fuel', type: 'expense', parent_id: parent.id }),
    });

    const hardDeleteRes = await SELF.fetch(
      `https://example.com/categories/${parent.id}?hard=true`,
      { method: 'DELETE', headers: AUTH }
    );
    expect(hardDeleteRes.status).toBe(409);
  });

  it('PUT /categories/:id with parent_id set to itself returns 400', async () => {
    const res = await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Utilities', type: 'expense' }),
    });
    const row = (await res.json()) as { id: string };

    const selfParentRes = await SELF.fetch(`https://example.com/categories/${row.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ parent_id: row.id }),
    });
    expect(selfParentRes.status).toBe(400);
  });

  it('POST /categories with a seeded non-UUID parent_id returns 201', async () => {
    const res = await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Snacks', type: 'expense', parent_id: 'cat-food' }),
    });
    expect(res.status).toBe(201);
    const row = (await res.json()) as { parent_id: string | null };
    expect(row.parent_id).toBe('cat-food');
  });

  it('PUT /categories/:id with parent_id: null un-parents a category', async () => {
    const parentRes = await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Bills', type: 'expense' }),
    });
    const parent = (await parentRes.json()) as { id: string };

    const childRes = await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Electricity', type: 'expense', parent_id: parent.id }),
    });
    const child = (await childRes.json()) as { id: string };

    const unparentRes = await SELF.fetch(`https://example.com/categories/${child.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ parent_id: null }),
    });
    expect(unparentRes.status).toBe(200);
    const updated = (await unparentRes.json()) as { parent_id: string | null };
    expect(updated.parent_id).toBeNull();
  });

  it('PUT /categories/:id re-parenting a row that has children returns 400', async () => {
    const parentRes = await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Entertainment', type: 'expense' }),
    });
    const parent = (await parentRes.json()) as { id: string };

    await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Movies', type: 'expense', parent_id: parent.id }),
    });

    const otherParentRes = await SELF.fetch('https://example.com/categories', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Shopping', type: 'expense' }),
    });
    const otherParent = (await otherParentRes.json()) as { id: string };

    const reparentRes = await SELF.fetch(`https://example.com/categories/${parent.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ parent_id: otherParent.id }),
    });
    expect(reparentRes.status).toBe(400);
  });
});
