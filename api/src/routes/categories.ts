import { Hono } from 'hono';
import type { Bindings } from '../middleware/auth';
import { categoryCreate, categoryUpdate } from '../lib/validation';

const app = new Hono<{ Bindings: Bindings }>();

type CategoryRow = {
  id: string;
  name: string;
  type: 'income' | 'expense';
  parent_id: string | null;
  budget_monthly: number;
  is_active: number;
  created_at: number;
  updated_at: number;
};

app.get('/', async (c) => {
  const type = c.req.query('type');
  const parentId = c.req.query('parent_id');
  const includeInactive = c.req.query('include_inactive') === 'true';

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (!includeInactive) {
    conditions.push('is_active = 1');
  }
  if (type) {
    conditions.push('type = ?');
    values.push(type);
  }
  if (parentId) {
    conditions.push('parent_id = ?');
    values.push(parentId);
  }

  let query = 'SELECT * FROM categories';
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  const { results } = await c.env.DB.prepare(query)
    .bind(...values)
    .all();

  return c.json(results, 200);
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(row, 200);
});

app.post('/', async (c) => {
  const body = categoryCreate.parse(await c.req.json());

  if (body.parent_id) {
    const parent = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?')
      .bind(body.parent_id)
      .first<CategoryRow>();

    if (!parent) {
      return c.json({ error: 'parent_id not found' }, 400);
    }
    if (parent.parent_id !== null) {
      return c.json({ error: 'max hierarchy depth is 1' }, 400);
    }
    if (parent.type !== body.type) {
      return c.json({ error: 'type must match parent type' }, 400);
    }
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    'INSERT INTO categories (id, name, type, parent_id, budget_monthly) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, body.name, body.type, body.parent_id ?? null, body.budget_monthly ?? 0)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();

  return c.json(row, 201);
});

app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?')
    .bind(id)
    .first<CategoryRow>();

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  const body = categoryUpdate.parse(await c.req.json());

  if (body.type !== undefined && body.type !== existing.type) {
    const childCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM categories WHERE parent_id = ?'
    )
      .bind(id)
      .first<{ count: number }>();

    if (childCount && childCount.count > 0) {
      return c.json({ error: 'cannot change type: row has children' }, 400);
    }
  }

  if (body.parent_id !== undefined) {
    const resultingType = body.type ?? existing.type;

    if (body.parent_id) {
      if (body.parent_id === id) {
        return c.json({ error: 'cannot set parent_id to self' }, 400);
      }

      const childCount = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM categories WHERE parent_id = ?'
      )
        .bind(id)
        .first<{ count: number }>();

      if (childCount && childCount.count > 0) {
        return c.json({ error: 'cannot set parent: row has children' }, 400);
      }

      const parent = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?')
        .bind(body.parent_id)
        .first<CategoryRow>();

      if (!parent) {
        return c.json({ error: 'parent_id not found' }, 400);
      }
      if (parent.parent_id !== null) {
        return c.json({ error: 'max hierarchy depth is 1' }, 400);
      }
      if (parent.type !== resultingType) {
        return c.json({ error: 'type must match parent type' }, 400);
      }
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    fields.push('name = ?');
    values.push(body.name);
  }
  if (body.type !== undefined) {
    fields.push('type = ?');
    values.push(body.type);
  }
  if (body.parent_id !== undefined) {
    fields.push('parent_id = ?');
    values.push(body.parent_id ?? null);
  }
  if (body.budget_monthly !== undefined) {
    fields.push('budget_monthly = ?');
    values.push(body.budget_monthly);
  }
  if (body.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(body.is_active ? 1 : 0);
  }

  if (fields.length > 0) {
    await c.env.DB.prepare(
      `UPDATE categories SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`
    )
      .bind(...values, id)
      .run();
  } else {
    await c.env.DB.prepare('UPDATE categories SET updated_at = unixepoch() WHERE id = ?')
      .bind(id)
      .run();
  }

  const row = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();

  return c.json(row, 200);
});

app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?')
    .bind(id)
    .first<CategoryRow>();

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  const hard = c.req.query('hard') === 'true';

  const { results: children } = await c.env.DB.prepare(
    'SELECT * FROM categories WHERE parent_id = ?'
  )
    .bind(id)
    .all<CategoryRow>();

  if (hard) {
    if (children.length > 0) {
      return c.json({ error: 'cannot hard delete: row has children' }, 409);
    }

    await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();

    return c.json({ id, deleted: true }, 200);
  }

  const activeChildren = children.filter((child) => child.is_active === 1);
  if (activeChildren.length > 0) {
    return c.json({ error: 'cannot delete: row has active children' }, 409);
  }

  await c.env.DB.prepare('UPDATE categories SET is_active = 0, updated_at = unixepoch() WHERE id = ?')
    .bind(id)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();

  return c.json(row, 200);
});

export default app;
