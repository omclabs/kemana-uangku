import { Hono } from 'hono';
import { getCurrentUser, type Bindings } from '../middleware/auth';
import { accountCreate, accountUpdate } from '../lib/validation';

const app = new Hono<{ Bindings: Bindings }>();

type AccountRow = {
  id: string;
  name: string;
  type:
    | 'bank'
    | 'cash'
    | 'autodebet'
    | 'credit_card'
    | 'prepaid'
    | 'savings'
    | 'investment'
    | 'loan';
  balance: number;
  parent_id: string | null;
  credit_limit: number | null;
  billing_date: number | null;
  include_in_total: number;
  is_active: number;
  created_at: number;
  updated_at: number;
};

// SELECT clause that computes `computed_balance` via a correlated subquery:
// - top-level rows (parent_id IS NULL): balance + sum of active, included children's balances
// - child rows (parent_id set): computed_balance == balance
const SELECT_WITH_BALANCE = `
  SELECT
    a.*,
    CASE
      WHEN a.parent_id IS NULL THEN a.balance + COALESCE((
        SELECT SUM(c.balance) FROM accounts c
        WHERE c.parent_id = a.id AND c.is_active = 1 AND c.include_in_total = 1
      ), 0)
      ELSE a.balance
    END AS computed_balance
  FROM accounts a
`;

const CREDIT_CARD_FIELDS_ERROR =
  'credit_limit and billing_date required for credit_card and must be null otherwise';

const PARENT_TYPE_MISMATCH_ERROR = 'parent and child must have same type';

function creditCardFieldsValid(
  type: AccountRow['type'],
  creditLimit: number | null,
  billingDate: number | null
): boolean {
  if (type === 'credit_card') {
    return creditLimit !== null && billingDate !== null;
  }
  return creditLimit === null && billingDate === null;
}

app.get('/', async (c) => {
  const type = c.req.query('type');
  const parentId = c.req.query('parent_id');
  const includeInactive = c.req.query('include_inactive') === 'true';

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (!includeInactive) {
    conditions.push('a.is_active = 1');
  }
  if (type) {
    conditions.push('a.type = ?');
    values.push(type);
  }
  if (parentId) {
    conditions.push('a.parent_id = ?');
    values.push(parentId);
  }

  let query = SELECT_WITH_BALANCE;
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
  const row = await c.env.DB.prepare(`${SELECT_WITH_BALANCE} WHERE a.id = ?`).bind(id).first();

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(row, 200);
});

app.post('/', async (c) => {
  const actor = getCurrentUser(c);
  const body = accountCreate.parse(await c.req.json());

  if (body.parent_id) {
    const parent = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?')
      .bind(body.parent_id)
      .first<AccountRow>();

    if (!parent) {
      return c.json({ error: 'parent_id not found' }, 400);
    }
    if (parent.parent_id !== null) {
      return c.json({ error: 'max hierarchy depth is 1' }, 400);
    }
    if (parent.type !== body.type) {
      return c.json({ error: PARENT_TYPE_MISMATCH_ERROR }, 400);
    }
  }

  const creditLimit = body.credit_limit ?? null;
  const billingDate = body.billing_date ?? null;

  if (!creditCardFieldsValid(body.type, creditLimit, billingDate)) {
    return c.json({ error: CREDIT_CARD_FIELDS_ERROR }, 400);
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO accounts
      (id, name, type, balance, parent_id, credit_limit, billing_date, include_in_total, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.name,
      body.type,
      body.balance ?? 0,
      body.parent_id ?? null,
      creditLimit,
      billingDate,
      body.include_in_total === undefined ? 1 : body.include_in_total ? 1 : 0,
      actor?.id ?? null,
      actor?.id ?? null
    )
    .run();

  const row = await c.env.DB.prepare(`${SELECT_WITH_BALANCE} WHERE a.id = ?`).bind(id).first();

  return c.json(row, 201);
});

app.put('/:id', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?')
    .bind(id)
    .first<AccountRow>();

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  const body = accountUpdate.parse(await c.req.json());

  if (body.type !== undefined && body.type !== existing.type) {
    const childCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM accounts WHERE parent_id = ?'
    )
      .bind(id)
      .first<{ count: number }>();

    if (childCount && childCount.count > 0) {
      return c.json({ error: 'cannot change type: row has children' }, 400);
    }
  }

  let newParent: AccountRow | null = null;

  if (body.parent_id !== undefined && body.parent_id !== null) {
    if (body.parent_id === id) {
      return c.json({ error: 'cannot set parent_id to self' }, 400);
    }

    const childCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM accounts WHERE parent_id = ?'
    )
      .bind(id)
      .first<{ count: number }>();

    if (childCount && childCount.count > 0) {
      return c.json({ error: 'cannot set parent: row has children' }, 400);
    }

    newParent = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?')
      .bind(body.parent_id)
      .first<AccountRow>();

    if (!newParent) {
      return c.json({ error: 'parent_id not found' }, 400);
    }
    if (newParent.parent_id !== null) {
      return c.json({ error: 'max hierarchy depth is 1' }, 400);
    }
  }

  const resultingType = body.type ?? existing.type;
  const resultingCreditLimit =
    body.credit_limit !== undefined ? body.credit_limit : existing.credit_limit;
  const resultingBillingDate =
    body.billing_date !== undefined ? body.billing_date : existing.billing_date;

  if (!creditCardFieldsValid(resultingType, resultingCreditLimit, resultingBillingDate)) {
    return c.json({ error: CREDIT_CARD_FIELDS_ERROR }, 400);
  }

  const resultingParentId = body.parent_id !== undefined ? body.parent_id : existing.parent_id;

  if (resultingParentId !== null) {
    const parent =
      newParent ??
      (await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?')
        .bind(resultingParentId)
        .first<AccountRow>());

    if (parent && parent.type !== resultingType) {
      return c.json({ error: PARENT_TYPE_MISMATCH_ERROR }, 400);
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
  if (body.balance !== undefined) {
    fields.push('balance = ?');
    values.push(body.balance);
  }
  if (body.parent_id !== undefined) {
    fields.push('parent_id = ?');
    values.push(body.parent_id ?? null);
  }
  if (body.credit_limit !== undefined) {
    fields.push('credit_limit = ?');
    values.push(body.credit_limit);
  }
  if (body.billing_date !== undefined) {
    fields.push('billing_date = ?');
    values.push(body.billing_date);
  }
  if (body.include_in_total !== undefined) {
    fields.push('include_in_total = ?');
    values.push(body.include_in_total ? 1 : 0);
  }
  if (body.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(body.is_active ? 1 : 0);
    if (body.is_active) {
      fields.push('deleted_by = NULL');
      fields.push('deleted_at = NULL');
    } else {
      fields.push('deleted_by = ?');
      values.push(actor?.id ?? null);
      fields.push('deleted_at = unixepoch()');
    }
  }

  if (fields.length > 0) {
    await c.env.DB.prepare(
      `UPDATE accounts
       SET ${fields.join(', ')}, updated_by = ?, updated_at = unixepoch()
       WHERE id = ?`
    )
      .bind(...values, actor?.id ?? null, id)
      .run();
  } else {
    await c.env.DB.prepare(
      'UPDATE accounts SET updated_by = ?, updated_at = unixepoch() WHERE id = ?'
    )
      .bind(actor?.id ?? null, id)
      .run();
  }

  const row = await c.env.DB.prepare(`${SELECT_WITH_BALANCE} WHERE a.id = ?`).bind(id).first();

  return c.json(row, 200);
});

app.delete('/:id', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?')
    .bind(id)
    .first<AccountRow>();

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  const hard = c.req.query('hard') === 'true';

  const { results: children } = await c.env.DB.prepare(
    'SELECT * FROM accounts WHERE parent_id = ?'
  )
    .bind(id)
    .all<AccountRow>();

  if (hard) {
    if (children.length > 0) {
      return c.json({ error: 'cannot hard delete: row has children' }, 409);
    }

    await c.env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run();

    return c.json({ id, deleted: true }, 200);
  }

  const activeChildren = children.filter((child) => child.is_active === 1);
  if (activeChildren.length > 0) {
    return c.json({ error: 'cannot delete: row has active children' }, 409);
  }

  await c.env.DB.prepare(
    `UPDATE accounts
     SET is_active = 0,
         updated_by = ?,
         deleted_by = ?,
         deleted_at = unixepoch(),
         updated_at = unixepoch()
     WHERE id = ?`
  )
    .bind(actor?.id ?? null, actor?.id ?? null, id)
    .run();

  const row = await c.env.DB.prepare(`${SELECT_WITH_BALANCE} WHERE a.id = ?`).bind(id).first();

  return c.json(row, 200);
});

export default app;
