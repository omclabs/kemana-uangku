import { Hono } from 'hono';
import { getCurrentUser, type Bindings } from '../middleware/auth';
import { requireNonReimbursement } from '../lib/access';
import { applyActiveToggleFields } from '../lib/db';
import { rebuildTrackedItemForecast, computeDaysRemaining } from '../lib/tracked-items';
import { trackedItemCreate, trackedItemUpdate } from '../lib/validation';

const app = new Hono<{ Bindings: Bindings }>();

type TrackedItemRow = {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  unit: string;
  warning_days: number;
  avg_daily_usage: number | null;
  latest_quantity_added: number | null;
  estimated_run_out_at: number | null;
  next_reminder_at: number | null;
  forecast_ready: number;
  last_forecasted_at: number | null;
  is_active: number;
  created_at: number;
  updated_at: number;
};

type TrackedItemRefillRow = {
  id: string;
  tracked_item_id: string;
  transaction_id: string | null;
  date: number;
  quantity_added: number;
  remaining_qty_before_refill: number | null;
  note: string | null;
  created_at: number;
  updated_at: number;
  transaction_amount: number | null;
  transaction_note: string | null;
};

async function validateExpenseLeafCategory(db: D1Database, categoryId: string): Promise<string | null> {
  const category = await db.prepare(
    'SELECT id, type, is_active FROM categories WHERE id = ?'
  )
    .bind(categoryId)
    .first<{ id: string; type: 'income' | 'expense'; is_active: number }>();

  if (!category || category.is_active !== 1) {
    return 'category_id not found';
  }
  if (category.type !== 'expense') {
    return 'category_id must be an expense category';
  }

  const childCount = await db.prepare(
    'SELECT COUNT(*) as count FROM categories WHERE parent_id = ? AND is_active = 1'
  )
    .bind(categoryId)
    .first<{ count: number }>();

  if ((childCount?.count ?? 0) > 0) {
    return 'category has active sub-categories; pick a sub-category';
  }

  return null;
}

function decorateItem(row: TrackedItemRow, nowUnix: number) {
  const daysRemaining = computeDaysRemaining(row.estimated_run_out_at, nowUnix);
  return {
    ...row,
    days_remaining: daysRemaining,
    alert_active: row.forecast_ready === 1 && row.next_reminder_at !== null && row.next_reminder_at <= nowUnix,
  };
}

app.get('/', async (c) => {
  const includeInactive = c.req.query('include_inactive') === 'true';
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (!includeInactive) {
    conditions.push('ti.is_active = 1');
  }

  let query = `SELECT ti.*, c.name AS category_name
               FROM tracked_items ti
               JOIN categories c ON c.id = ti.category_id`;
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }
  query += ' ORDER BY ti.name COLLATE NOCASE ASC';

  const { results } = await c.env.DB.prepare(query).bind(...values).all<TrackedItemRow>();
  const nowUnix = Math.floor(Date.now() / 1000);
  return c.json((results ?? []).map((row) => decorateItem(row, nowUnix)), 200);
});

app.get('/alerts', async (c) => {
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

  const nowUnix = Math.floor(Date.now() / 1000);
  const { results } = await c.env.DB.prepare(
    `SELECT ti.*, c.name AS category_name
     FROM tracked_items ti
     JOIN categories c ON c.id = ti.category_id
     WHERE ti.is_active = 1
       AND ti.forecast_ready = 1
       AND ti.next_reminder_at IS NOT NULL
       AND ti.next_reminder_at <= ?
     ORDER BY ti.next_reminder_at ASC, ti.name COLLATE NOCASE ASC`
  )
    .bind(nowUnix)
    .all<TrackedItemRow>();

  return c.json((results ?? []).map((row) => decorateItem(row, nowUnix)), 200);
});

app.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT ti.*, c.name AS category_name
     FROM tracked_items ti
     JOIN categories c ON c.id = ti.category_id
     WHERE ti.id = ?`
  )
    .bind(c.req.param('id'))
    .first<TrackedItemRow>();

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(decorateItem(row, Math.floor(Date.now() / 1000)), 200);
});

app.get('/:id/refills', async (c) => {
  const row = await c.env.DB.prepare('SELECT id FROM tracked_items WHERE id = ?')
    .bind(c.req.param('id'))
    .first<{ id: string }>();
  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT r.*,
            t.amount AS transaction_amount,
            t.note AS transaction_note
     FROM tracked_item_refills r
     LEFT JOIN transactions t ON t.id = r.transaction_id
     WHERE r.tracked_item_id = ?
     ORDER BY r.date DESC, r.created_at DESC`
  )
    .bind(c.req.param('id'))
    .all<TrackedItemRefillRow>();

  return c.json(results ?? [], 200);
});

app.post('/', async (c) => {
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

  const actor = getCurrentUser(c);
  const body = trackedItemCreate.parse(await c.req.json());
  const categoryError = await validateExpenseLeafCategory(c.env.DB, body.category_id);
  if (categoryError) {
    return c.json({ error: categoryError }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO tracked_items
      (id, name, category_id, unit, warning_days, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, body.name, body.category_id, body.unit, body.warning_days, actor?.id ?? null, actor?.id ?? null)
    .run();

  const row = await c.env.DB.prepare(
    `SELECT ti.*, c.name AS category_name
     FROM tracked_items ti
     JOIN categories c ON c.id = ti.category_id
     WHERE ti.id = ?`
  )
    .bind(id)
    .first<TrackedItemRow>();

  return c.json(decorateItem(row as TrackedItemRow, Math.floor(Date.now() / 1000)), 201);
});

app.put('/:id', async (c) => {
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM tracked_items WHERE id = ?')
    .bind(id)
    .first<{ id: string; warning_days: number }>();
  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  const body = trackedItemUpdate.parse(await c.req.json());
  const nextCategoryId = body.category_id;
  if (nextCategoryId !== undefined) {
    const categoryError = await validateExpenseLeafCategory(c.env.DB, nextCategoryId);
    if (categoryError) {
      return c.json({ error: categoryError }, 400);
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.name !== undefined) {
    fields.push('name = ?');
    values.push(body.name);
  }
  if (body.category_id !== undefined) {
    fields.push('category_id = ?');
    values.push(body.category_id);
  }
  if (body.unit !== undefined) {
    fields.push('unit = ?');
    values.push(body.unit);
  }
  if (body.warning_days !== undefined) {
    fields.push('warning_days = ?');
    values.push(body.warning_days);
  }
  if (body.is_active !== undefined) {
    applyActiveToggleFields(fields, values, body.is_active, actor?.id ?? null);
  }

  if (fields.length > 0) {
    await c.env.DB.prepare(
      `UPDATE tracked_items
       SET ${fields.join(', ')}, updated_by = ?, updated_at = unixepoch()
       WHERE id = ?`
    )
      .bind(...values, actor?.id ?? null, id)
      .run();
  }

  if (body.warning_days !== undefined) {
    await rebuildTrackedItemForecast(c.env.DB, id);
  }

  const row = await c.env.DB.prepare(
    `SELECT ti.*, c.name AS category_name
     FROM tracked_items ti
     JOIN categories c ON c.id = ti.category_id
     WHERE ti.id = ?`
  )
    .bind(id)
    .first<TrackedItemRow>();

  return c.json(decorateItem(row as TrackedItemRow, Math.floor(Date.now() / 1000)), 200);
});

export default app;
