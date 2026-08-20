import { Hono } from 'hono';
import { getCurrentUser, type Bindings } from '../middleware/auth';
import { requireNonReimbursement } from '../lib/access';
import { inPlaceholders } from '../lib/db';
import { budgetUpsert, budgetYearSeed, monthKey, yearKey } from '../lib/validation';

const app = new Hono<{ Bindings: Bindings }>();

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  budget_monthly: number;
  is_active: number;
};

type BudgetRow = {
  category_id: string;
  amount: number;
};

function monthStartFromKey(value: string): number {
  const [year, month] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, 1) / 1000);
}

function previousMonthKey(value: string): string {
  const [year, month] = value.split('-').map(Number);
  const prev = new Date(Date.UTC(year, month - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
}

function yearMonthKeys(year: string): string[] {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
}

function parseMonthKey(value: string): string {
  return monthKey.parse(value);
}

function parseYearKey(value: string): string {
  return yearKey.parse(value);
}

async function buildBudgetMonthResponse(db: D1Database, month: string) {
  const monthStart = monthStartFromKey(month);

  const { results: categories } = await db.prepare(
    `SELECT id, name, parent_id, budget_monthly, is_active
     FROM categories
     WHERE type = 'expense'
       AND is_active = 1
       AND id NOT IN ('cat-admin', 'cat-transfer')
     ORDER BY CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END, parent_id ASC, name COLLATE NOCASE ASC`
  ).all<CategoryRow>();

  const { results: savedRows } = await db.prepare(
    'SELECT category_id, amount FROM budgets WHERE month_start = ?'
  )
    .bind(monthStart)
    .all<BudgetRow>();

  const previousMonthStart = monthStartFromKey(previousMonthKey(month));
  const { results: spendRows } = await db.prepare(
    `SELECT category_id, COALESCE(SUM(amount), 0) AS spent
     FROM transactions
     WHERE is_active = 1 AND type = 'expense' AND transfer_to IS NULL
       AND category_id IS NOT NULL AND date >= ? AND date < ?
     GROUP BY category_id`
  )
    .bind(previousMonthStart, monthStart)
    .all<{ category_id: string; spent: number }>();

  const savedByCategory = new Map((savedRows ?? []).map((row) => [row.category_id, row.amount]));
  const previousSpendByCategory = new Map((spendRows ?? []).map((row) => [row.category_id, row.spent]));
  const childrenByParent = new Map<string, CategoryRow[]>();
  for (const category of categories ?? []) {
    if (!category.parent_id) continue;
    const children = childrenByParent.get(category.parent_id) ?? [];
    children.push(category);
    childrenByParent.set(category.parent_id, children);
  }

  const ownAmountById = new Map<string, number>();
  for (const category of categories ?? []) {
    ownAmountById.set(category.id, savedByCategory.get(category.id) ?? category.budget_monthly);
  }

  const items = (categories ?? []).map((category) => {
    const ownAmount = ownAmountById.get(category.id) ?? 0;
    const childTotal = (childrenByParent.get(category.id) ?? []).reduce(
      (sum, child) => sum + (ownAmountById.get(child.id) ?? 0),
      0
    );
    const isSaved = savedByCategory.has(category.id);
    const savedAmount = savedByCategory.get(category.id) ?? 0;
    const effectiveAmount = isSaved && savedAmount > 0
      ? savedAmount
      : previousSpendByCategory.get(category.id) ?? 0;

    return {
      category_id: category.id,
      name: category.name,
      parent_id: category.parent_id,
      template_amount: category.budget_monthly,
      own_amount: ownAmount,
      total_amount: ownAmount + childTotal,
      is_saved: isSaved,
      effective_amount: effectiveAmount,
    };
  });

  const total_budget = items
    .filter((item) => item.parent_id === null)
    .reduce((sum, item) => sum + item.total_amount, 0);

  return {
    month_key: month,
    month_start: monthStart,
    total_budget,
    items,
  };
}

app.get('/', async (c) => {
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

  const month = parseMonthKey(c.req.query('month') ?? '');
  return c.json(await buildBudgetMonthResponse(c.env.DB, month), 200);
});

app.put('/:month', async (c) => {
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

  const actor = getCurrentUser(c);
  const month = parseMonthKey(c.req.param('month'));
  const monthStart = monthStartFromKey(month);
  const body = budgetUpsert.parse(await c.req.json());

  const seen = new Set<string>();
  for (const item of body.items) {
    if (seen.has(item.category_id)) {
      return c.json({ error: `duplicate category_id: ${item.category_id}` }, 400);
    }
    seen.add(item.category_id);
  }

  const categoryIds = body.items.map((item) => item.category_id);
  const categoryMap = new Map<string, { id: string; type: string; is_active: number }>();

  if (categoryIds.length > 0) {
    const placeholders = inPlaceholders(categoryIds);
    const { results } = await c.env.DB.prepare(
      `SELECT id, type, is_active
       FROM categories
       WHERE id IN (${placeholders})`
    )
      .bind(...categoryIds)
      .all<{ id: string; type: string; is_active: number }>();

    for (const category of results) {
      categoryMap.set(category.id, category);
    }
  }

  for (const item of body.items) {
    const category = categoryMap.get(item.category_id);
    if (!category) {
      return c.json({ error: `category_id not found: ${item.category_id}` }, 400);
    }
    if (category.type !== 'expense') {
      return c.json({ error: `budget only allowed for expense categories: ${item.category_id}` }, 400);
    }
    if (category.is_active !== 1) {
      return c.json({ error: `category_id inactive: ${item.category_id}` }, 400);
    }
  }

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare('DELETE FROM budgets WHERE month_start = ?').bind(monthStart),
  ];

  for (const item of body.items) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO budgets
          (id, category_id, month_start, month_key, amount, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          crypto.randomUUID(),
          item.category_id,
          monthStart,
          month,
          item.amount,
          actor?.id ?? null,
          actor?.id ?? null
        )
    );
  }

  await c.env.DB.batch(statements);

  return c.json(await buildBudgetMonthResponse(c.env.DB, month), 200);
});

async function loadBudgetCategory(db: D1Database, categoryId: string) {
  const category = await db.prepare(
    `SELECT id, budget_monthly, type, is_active
     FROM categories WHERE id = ?`
  )
    .bind(categoryId)
    .first<{ id: string; budget_monthly: number; type: string; is_active: number }>();
  return category ?? null;
}

app.get('/category/:categoryId/year/:year', async (c) => {
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

  const categoryId = c.req.param('categoryId');
  const year = parseYearKey(c.req.param('year'));
  const category = await loadBudgetCategory(c.env.DB, categoryId);
  if (!category) return c.json({ error: `category_id not found: ${categoryId}` }, 400);

  const monthKeys = yearMonthKeys(year);
  const monthStarts = monthKeys.map(monthStartFromKey);
  const placeholders = inPlaceholders(monthStarts);
  const { results: savedRows } = await c.env.DB.prepare(
    `SELECT month_start, amount FROM budgets WHERE category_id = ? AND month_start IN (${placeholders})`
  )
    .bind(categoryId, ...monthStarts)
    .all<{ month_start: number; amount: number }>();

  const savedByMonthStart = new Map((savedRows ?? []).map((row) => [row.month_start, row.amount]));

  const months = monthKeys.map((mKey, index) => {
    const monthStart = monthStarts[index];
    const saved = savedByMonthStart.get(monthStart);
    return {
      month_key: mKey,
      amount: saved ?? category.budget_monthly,
      is_saved: saved !== undefined,
    };
  });

  return c.json({ category_id: categoryId, year, months }, 200);
});

app.put('/category/:categoryId/year/:year', async (c) => {
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

  const actor = getCurrentUser(c);
  const categoryId = c.req.param('categoryId');
  const year = parseYearKey(c.req.param('year'));
  const body = budgetYearSeed.parse(await c.req.json());

  const category = await loadBudgetCategory(c.env.DB, categoryId);
  if (!category) return c.json({ error: `category_id not found: ${categoryId}` }, 400);
  if (category.type !== 'expense') {
    return c.json({ error: `budget only allowed for expense categories: ${categoryId}` }, 400);
  }
  if (category.is_active !== 1) {
    return c.json({ error: `category_id inactive: ${categoryId}` }, 400);
  }

  const monthKeys = yearMonthKeys(year);
  const monthStarts = monthKeys.map(monthStartFromKey);
  const placeholders = inPlaceholders(monthStarts);

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`DELETE FROM budgets WHERE category_id = ? AND month_start IN (${placeholders})`)
      .bind(categoryId, ...monthStarts),
  ];

  monthKeys.forEach((mKey, index) => {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO budgets
          (id, category_id, month_start, month_key, amount, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          crypto.randomUUID(),
          categoryId,
          monthStarts[index],
          mKey,
          body.amount,
          actor?.id ?? null,
          actor?.id ?? null
        )
    );
  });

  await c.env.DB.batch(statements);

  const months = monthKeys.map((mKey) => ({ month_key: mKey, amount: body.amount, is_saved: true }));
  return c.json({ category_id: categoryId, year, months }, 200);
});

export default app;
