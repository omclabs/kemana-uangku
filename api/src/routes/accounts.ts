import { Hono } from 'hono';
import { getCurrentUser, type Bindings } from '../middleware/auth';
import {
  listAccessibleAccountIds,
  requireAccountAccess,
  requireNonReimbursement,
} from '../lib/access';
import { adjustBalanceStatement, transactionBalanceOps } from '../lib/balance';
import { LIABILITY_ACCOUNT_TYPES } from '../lib/constants';
import { applyActiveToggleFields, inPlaceholders, softDeleteStatement } from '../lib/db';
import { rebuildMonthlyBalancesFrom } from '../lib/month-balance';
import { parseAnchorMonth, statementWindowForOffset } from '../lib/statement-window';
import { accountCreate, accountPaymentCreate, accountUpdate } from '../lib/validation';

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
const ACCOUNT_ADJUSTMENT_INCOME_CATEGORY_ID = 'cat-income-other';
const ACCOUNT_ADJUSTMENT_EXPENSE_CATEGORY_ID = 'cat-other-misc';
const ACCOUNT_ADJUSTMENT_NOTE = 'Account balance adjustment';
const CREDIT_CARD_PAYMENT_CATEGORY_ID = 'cat-transfer';

type TransactionRow = {
  id: string;
  date: number;
  account_id: string;
  category_id: string | null;
  amount: number;
  note: string | null;
  type: 'income' | 'expense' | 'transfer';
  transfer_to: string | null;
  fee: number | null;
  source: 'single' | 'bulk';
  paid_status: 'paid' | 'settle';
  recurring_group_id: string | null;
  recurring_mode: 'recurring' | 'installment' | null;
  installment_index: number | null;
  installment_total: number | null;
  parent_transaction_id: string | null;
  payment_transaction_id: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
};

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
  const user = getCurrentUser(c);
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

  const accessibleAccountIds = await listAccessibleAccountIds(c.env.DB, user);
  if (accessibleAccountIds !== null) {
    if (accessibleAccountIds.length === 0) {
      return c.json([], 200);
    }
    const placeholders = inPlaceholders(accessibleAccountIds);
    conditions.push(`a.id IN (${placeholders})`);
    values.push(...accessibleAccountIds);
  }

  let query = SELECT_WITH_BALANCE;
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }
  query += ' ORDER BY a.type ASC, a.name COLLATE NOCASE ASC';

  const { results } = await c.env.DB.prepare(query)
    .bind(...values)
    .all();

  return c.json(results, 200);
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const forbidden = await requireAccountAccess(c, id);
  if (forbidden) return forbidden;

  const row = await c.env.DB.prepare(`${SELECT_WITH_BALANCE} WHERE a.id = ?`).bind(id).first();

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(row, 200);
});

app.post('/:id/payments', async (c) => {
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

  const actor = getCurrentUser(c);
  const creditCardId = c.req.param('id');
  const body = accountPaymentCreate.parse(await c.req.json());
  const creditCard = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?')
    .bind(creditCardId)
    .first<AccountRow>();

  if (!creditCard || creditCard.is_active !== 1) {
    return c.json({ error: 'credit card account not found or inactive' }, 404);
  }
  if (creditCard.type !== 'credit_card' || creditCard.billing_date === null) {
    return c.json({ error: 'account must be an active credit card' }, 400);
  }

  const paymentAccount = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?')
    .bind(body.payment_account_id)
    .first<AccountRow>();
  if (!paymentAccount || paymentAccount.is_active !== 1) {
    return c.json({ error: 'payment account not found or inactive' }, 400);
  }
  if (paymentAccount.id === creditCardId) {
    return c.json({ error: 'payment account must differ from credit card account' }, 400);
  }
  if (LIABILITY_ACCOUNT_TYPES.includes(paymentAccount.type)) {
    return c.json({ error: 'payment account must not be a liability account' }, 400);
  }

  const uniqueIds = [...new Set(body.transaction_ids)];
  const placeholders = inPlaceholders(uniqueIds);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM transactions WHERE id IN (${placeholders})`
  )
    .bind(...uniqueIds)
    .all<TransactionRow>();
  const transactions = results ?? [];
  if (transactions.length !== uniqueIds.length) {
    return c.json({ error: 'one or more transactions were not found' }, 400);
  }

  const { year, month } = parseAnchorMonth(body.anchor_month);
  const allowedWindows = [
    statementWindowForOffset(year, month, creditCard.billing_date, -1),
    statementWindowForOffset(year, month, creditCard.billing_date, 0),
    statementWindowForOffset(year, month, creditCard.billing_date, 1),
  ];

  for (const transaction of transactions) {
    if (transaction.is_active !== 1) {
      return c.json({ error: `transaction ${transaction.id} is inactive` }, 400);
    }
    if (transaction.account_id !== creditCardId) {
      return c.json({ error: `transaction ${transaction.id} does not belong to this credit card` }, 400);
    }
    if (transaction.paid_status !== 'settle') {
      return c.json({ error: `transaction ${transaction.id} is not pending settlement` }, 409);
    }
    const inAllowedWindow = allowedWindows.some((window) => (
      transaction.date >= window.start && transaction.date < window.endExclusive
    ));
    if (!inAllowedWindow) {
      return c.json({ error: `transaction ${transaction.id} is outside the allowed statement windows` }, 400);
    }
  }

  const paymentAmount = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  if (paymentAmount === 0) {
    return c.json({ error: 'selected transactions total must not be zero' }, 400);
  }

  const paymentId = crypto.randomUUID();
  const paymentDate = Math.floor(Date.now() / 1000);
  const paymentNote = `Credit card payment to ${creditCard.name}`;
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO transactions
        (id, date, account_id, category_id, amount, note, type, transfer_to, fee, source, paid_status, recurring_group_id, recurring_mode, installment_index, installment_total, parent_transaction_id, payment_transaction_id, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 'expense', ?, NULL, 'single', 'paid', NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`
    ).bind(
      paymentId,
      paymentDate,
      paymentAccount.id,
      CREDIT_CARD_PAYMENT_CATEGORY_ID,
      paymentAmount,
      paymentNote,
      creditCardId,
      actor?.id ?? null,
      actor?.id ?? null
    ),
    c.env.DB.prepare(
      `UPDATE transactions
       SET paid_status = 'paid',
           payment_transaction_id = ?,
           updated_by = ?,
           updated_at = unixepoch()
       WHERE id IN (${placeholders})`
    ).bind(paymentId, actor?.id ?? null, ...uniqueIds),
  ];

  for (const op of transactionBalanceOps(
    { account_id: paymentAccount.id, transfer_to: creditCardId, type: 'expense', amount: paymentAmount },
    1
  )) {
    statements.push(adjustBalanceStatement(c.env.DB, op));
  }

  await c.env.DB.batch(statements);
  await rebuildMonthlyBalancesFrom(c.env.DB, paymentDate, actor?.id ?? null);

  const paymentRow = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?')
    .bind(paymentId)
    .first();

  return c.json({
    payment: paymentRow,
    settled_transaction_ids: uniqueIds,
    total_amount: paymentAmount,
  }, 201);
});

app.post('/', async (c) => {
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

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
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

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
  const targetBalance = body.balance;
  const currentBalance = existing.balance;
  const balanceDelta = targetBalance !== undefined ? targetBalance - currentBalance : 0;

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
    applyActiveToggleFields(fields, values, body.is_active, actor?.id ?? null);
  }

  await c.env.DB.prepare(
    `UPDATE accounts
     SET ${[...fields, 'updated_by = ?', 'updated_at = unixepoch()'].join(', ')}
     WHERE id = ?`
  )
    .bind(...values, actor?.id ?? null, id)
    .run();

  if (targetBalance !== undefined && balanceDelta !== 0) {
    const adjustmentType = balanceDelta > 0 ? 'income' : 'expense';
    const adjustmentAmount = Math.abs(balanceDelta);
    const adjustmentDate = Math.floor(Date.now() / 1000);
    const adjustmentCategoryId =
      adjustmentType === 'income'
        ? ACCOUNT_ADJUSTMENT_INCOME_CATEGORY_ID
        : ACCOUNT_ADJUSTMENT_EXPENSE_CATEGORY_ID;
    const paidStatus = existing.type === 'credit_card' ? 'settle' : 'paid';

    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(
        `INSERT INTO transactions
          (id, date, account_id, category_id, amount, note, type, transfer_to, fee, source, paid_status, recurring_group_id, recurring_mode, installment_index, installment_total, parent_transaction_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'single', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        adjustmentDate,
        id,
        adjustmentCategoryId,
        adjustmentAmount,
        ACCOUNT_ADJUSTMENT_NOTE,
        adjustmentType,
        paidStatus,
        actor?.id ?? null,
        actor?.id ?? null
      ),
    ];

    for (const op of transactionBalanceOps(
      { account_id: id, transfer_to: null, type: adjustmentType, amount: adjustmentAmount },
      1
    )) {
      statements.push(adjustBalanceStatement(c.env.DB, op));
    }

    await c.env.DB.batch(statements);
    await rebuildMonthlyBalancesFrom(c.env.DB, adjustmentDate, actor?.id ?? null);
  }

  const row = await c.env.DB.prepare(`${SELECT_WITH_BALANCE} WHERE a.id = ?`).bind(id).first();

  return c.json(row, 200);
});

app.delete('/:id', async (c) => {
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

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

  await softDeleteStatement(c.env.DB, 'accounts', id, actor?.id ?? null).run();

  const row = await c.env.DB.prepare(`${SELECT_WITH_BALANCE} WHERE a.id = ?`).bind(id).first();

  return c.json(row, 200);
});

export default app;
