import { Hono } from 'hono';
import { getCurrentUser, type Bindings } from '../middleware/auth';
import { receiptImportCommitInput, transactionCreate, transactionUpdate } from '../lib/validation';
import {
  adjustBalanceStatement,
  mergeBalanceOps,
  transactionBalanceOps,
  type BalanceOp,
  type TransactionBalanceRow,
} from '../lib/balance';
import { rebuildMonthlyBalancesFrom } from '../lib/month-balance';
import { buildReceiptDraft } from '../lib/receipt-import';

const app = new Hono<{ Bindings: Bindings }>();

const FEE_CATEGORY_ID = 'cat-admin';
const TRANSFER_CATEGORY_ID = 'cat-transfer';
const LIABILITY_ACCOUNT_TYPES = ['credit_card', 'loan'];
const SYSTEM_CATEGORY_IDS = [FEE_CATEGORY_ID, TRANSFER_CATEGORY_ID];

type TransactionType = 'income' | 'expense' | 'transfer';
type RecurringMode = 'recurring' | 'installment';

type TransactionRow = {
  id: string;
  date: number;
  account_id: string;
  category_id: string | null;
  amount: number;
  note: string | null;
  type: TransactionType;
  transfer_to: string | null;
  fee: number | null;
  source: 'single' | 'bulk';
  paid_status: 'paid' | 'settle';
  recurring_group_id: string | null;
  recurring_mode: RecurringMode | null;
  installment_index: number | null;
  installment_total: number | null;
  parent_transaction_id: string | null;
  payment_transaction_id: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
};

type AccountRow = {
  id: string;
  type: string;
  is_active: number;
};

type CategoryRow = {
  id: string;
  type: 'income' | 'expense';
  parent_id: string | null;
  is_active: number;
};

// Adds `months` calendar months to a unix-seconds timestamp (UTC).
function addMonths(unixSeconds: number, months: number): number {
  const d = new Date(unixSeconds * 1000);
  d.setUTCMonth(d.getUTCMonth() + months);
  return Math.floor(d.getTime() / 1000);
}

// Recurring: every occurrence is the full amount.
// Installment: amount split evenly (floor), remainder absorbed by the last row.
function computeRowAmounts(amount: number, occurrences: number, mode?: RecurringMode): number[] {
  if (occurrences === 1 || mode !== 'installment') {
    return Array.from({ length: occurrences }, () => amount);
  }

  const base = Math.floor(amount / occurrences);
  const rows = Array.from({ length: occurrences }, () => base);
  rows[occurrences - 1] = amount - base * (occurrences - 1);
  return rows;
}

async function loadActiveAccount(db: D1Database, id: string): Promise<AccountRow | null> {
  const row = await db.prepare('SELECT id, type, is_active FROM accounts WHERE id = ?')
    .bind(id)
    .first<AccountRow>();
  if (!row || row.is_active !== 1) return null;
  return row;
}

// Validates a user-supplied category_id for a non-transfer transaction:
// must exist, be active, match the transaction type, and have no active
// children (leaf categories only). System categories (cat-admin,
// cat-transfer) are assigned internally and skip these checks.
async function validateCategoryForType(
  db: D1Database,
  categoryId: string,
  transactionType?: 'income' | 'expense'
): Promise<string | null> {
  if (SYSTEM_CATEGORY_IDS.includes(categoryId)) {
    return null;
  }

  const category = await db.prepare('SELECT id, type, parent_id, is_active FROM categories WHERE id = ?')
    .bind(categoryId)
    .first<CategoryRow>();

  if (!category || category.is_active !== 1) {
    return 'category_id not found';
  }
  if (transactionType && category.type !== transactionType) {
    return 'category type must match transaction type';
  }

  const childCount = await db.prepare(
    'SELECT COUNT(*) as count FROM categories WHERE parent_id = ? AND is_active = 1'
  )
    .bind(categoryId)
    .first<{ count: number }>();

  if (childCount && childCount.count > 0) {
    return 'category has active sub-categories; pick a sub-category';
  }

  return null;
}

function toBalanceRow(
  row: Pick<TransactionRow, 'account_id' | 'transfer_to' | 'type'>,
  amount: number
): TransactionBalanceRow {
  return {
    account_id: row.account_id,
    transfer_to: row.transfer_to,
    type: row.type,
    amount,
  };
}

async function createImportedExpenseRows(
  db: D1Database,
  actorId: string | null,
  accountId: string,
  rows: Array<{ date: number; category_id: string; amount: number; note: string; paid_status: 'paid' | 'settle' }>
): Promise<TransactionRow[]> {
  const insertedIds: string[] = [];
  const statements: D1PreparedStatement[] = [];
  const balanceOps: BalanceOp[] = [];

  for (const row of rows) {
    const id = crypto.randomUUID();
    insertedIds.push(id);
    statements.push(
      db.prepare(
        `INSERT INTO transactions
          (id, date, account_id, category_id, amount, note, type, transfer_to, fee, source, paid_status, recurring_group_id, recurring_mode, installment_index, installment_total, parent_transaction_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, 'expense', NULL, NULL, 'bulk', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`
      ).bind(id, row.date, accountId, row.category_id, row.amount, row.note, row.paid_status, actorId, actorId)
    );

    balanceOps.push(
      ...transactionBalanceOps(
        toBalanceRow({ account_id: accountId, transfer_to: null, type: 'expense' }, row.amount),
        1
      )
    );
  }

  for (const op of mergeBalanceOps(balanceOps)) {
    statements.push(adjustBalanceStatement(db, op));
  }

  await db.batch(statements);

  const minDate = Math.min(...rows.map((row) => row.date));
  await rebuildMonthlyBalancesFrom(db, minDate, actorId);

  const placeholders = insertedIds.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT * FROM transactions WHERE id IN (${placeholders}) ORDER BY date ASC, created_at ASC`
  )
    .bind(...insertedIds)
    .all<TransactionRow>();

  return results;
}

app.get('/', async (c) => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (c.req.query('include_inactive') !== 'true') {
    conditions.push('is_active = 1');
  }

  const accountId = c.req.query('account_id');
  if (accountId) {
    conditions.push('account_id = ?');
    values.push(accountId);
  }

  const categoryId = c.req.query('category_id');
  if (categoryId) {
    conditions.push('category_id = ?');
    values.push(categoryId);
  }

  const type = c.req.query('type');
  if (type) {
    conditions.push('type = ?');
    values.push(type);
  }

  const paidStatus = c.req.query('paid_status');
  if (paidStatus) {
    conditions.push('paid_status = ?');
    values.push(paidStatus);
  }

  const recurringGroupId = c.req.query('recurring_group_id');
  if (recurringGroupId) {
    conditions.push('recurring_group_id = ?');
    values.push(recurringGroupId);
  }

  const from = c.req.query('from');
  if (from) {
    conditions.push('date >= ?');
    values.push(Number(from));
  }

  const to = c.req.query('to');
  if (to) {
    conditions.push('date <= ?');
    values.push(Number(to));
  }

  let query = 'SELECT * FROM transactions';
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }
  query += ' ORDER BY date DESC';

  const { results } = await c.env.DB.prepare(query)
    .bind(...values)
    .all();

  return c.json(results, 200);
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first();

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(row, 200);
});

app.post('/import-receipt/parse', async (c) => {
  const form = await c.req.formData();
  const accountId = form.get('account_id');
  const file = form.get('file');

  if (typeof accountId !== 'string' || !accountId) {
    return c.json({ error: 'account_id required' }, 400);
  }
  const hasFile =
    file
    && typeof file === 'object'
    && 'arrayBuffer' in file
    && 'name' in file;
  if (!hasFile) {
    return c.json({ error: 'csv file required' }, 400);
  }

  const account = await loadActiveAccount(c.env.DB, accountId);
  if (!account) {
    return c.json({ error: 'account_id not found or inactive' }, 400);
  }

  const csvText = await (file as File).text();
  const draft = buildReceiptDraft(accountId, csvText);
  return c.json(draft, 200);
});

app.post('/import-receipt/commit', async (c) => {
  const actor = getCurrentUser(c);
  const body = receiptImportCommitInput.parse(await c.req.json());
  const account = await loadActiveAccount(c.env.DB, body.account_id);
  if (!account) {
    return c.json({ error: 'account_id not found or inactive' }, 400);
  }
  if (body.type === 'transfer' && account.type === 'credit_card') {
    return c.json({ error: 'credit card account cannot be a transfer source' }, 400);
  }

  const includedRows = body.draft_items.filter((row) => row.included);
  if (includedRows.length === 0) {
    return c.json({ error: 'at least one included row is required' }, 400);
  }

  for (const row of includedRows) {
    if (!row.note.trim()) {
      return c.json({ error: `note required for row ${row.id}` }, 400);
    }
    if (!row.category_id) {
      return c.json({ error: `category_id required for row ${row.id}` }, 400);
    }
    const categoryError = await validateCategoryForType(
      c.env.DB,
      row.category_id,
      row.kind === 'voucher' || row.amount < 0 ? undefined : 'expense'
    );
    if (categoryError) {
      return c.json({ error: `row ${row.id}: ${categoryError}` }, 400);
    }
  }

  const paidStatus: 'paid' | 'settle' = account.type === 'credit_card' ? 'settle' : 'paid';
  const created = await createImportedExpenseRows(
    c.env.DB,
    actor?.id ?? null,
    body.account_id,
    includedRows.map((row) => ({
      date: row.date,
      category_id: row.category_id as string,
      amount: row.amount,
      note: row.note.trim(),
      paid_status: paidStatus,
    }))
  );

  return c.json(created, 201);
});

app.post('/', async (c) => {
  const actor = getCurrentUser(c);
  const body = transactionCreate.parse(await c.req.json());

  if (body.type === 'transfer') {
    if (!body.transfer_to) {
      return c.json({ error: 'transfer_to required for transfer' }, 400);
    }
    if (body.transfer_to === body.account_id) {
      return c.json({ error: 'transfer_to must differ from account_id' }, 400);
    }
  } else {
    if (body.transfer_to) {
      return c.json({ error: 'transfer_to only allowed for transfer' }, 400);
    }
    if (body.fee !== undefined && body.fee !== null) {
      return c.json({ error: 'fee only allowed for transfer' }, 400);
    }
    if (!body.category_id) {
      return c.json({ error: 'category_id required' }, 400);
    }
  }

  const account = await loadActiveAccount(c.env.DB, body.account_id);
  if (!account) {
    return c.json({ error: 'account_id not found or inactive' }, 400);
  }
  if (body.type === 'transfer' && account.type === 'credit_card') {
    return c.json({ error: 'credit card account cannot be a transfer source' }, 400);
  }

  let transferToAccount: AccountRow | null = null;
  if (body.type === 'transfer' && body.transfer_to) {
    transferToAccount = await loadActiveAccount(c.env.DB, body.transfer_to);
    if (!transferToAccount) {
      return c.json({ error: 'transfer_to not found or inactive' }, 400);
    }
  }

  let categoryId: string | null = null;
  if (body.type !== 'transfer') {
    categoryId = body.category_id ?? null;
    const categoryError = await validateCategoryForType(c.env.DB, categoryId as string, body.type);
    if (categoryError) {
      return c.json({ error: categoryError }, 400);
    }
  }

  const paidStatus: 'paid' | 'settle' = account.type === 'credit_card' ? 'settle' : 'paid';

  const effectiveType: TransactionType =
    body.type === 'transfer' && transferToAccount && LIABILITY_ACCOUNT_TYPES.includes(transferToAccount.type)
      ? 'expense'
      : body.type;

  if (body.type === 'transfer' && effectiveType === 'expense') {
    categoryId = TRANSFER_CATEGORY_ID;
  }

  const occurrences = body.recurring?.total ?? 1;
  const rowAmounts = computeRowAmounts(body.amount, occurrences, body.recurring?.mode);
  const recurringMode = body.recurring?.mode ?? null;

  const statements: D1PreparedStatement[] = [];
  const balanceOps: BalanceOp[] = [];
  const insertedIds: string[] = [];
  let recurringGroupId: string | null = null;

  for (let i = 0; i < occurrences; i++) {
    const occurrenceDate = i === 0 ? body.date : addMonths(body.date, i);
    const rowId = crypto.randomUUID();
    insertedIds.push(rowId);

    if (i === 0) {
      recurringGroupId = occurrences > 1 ? rowId : null;
    }

    const installmentIndex = occurrences > 1 ? i + 1 : null;
    const installmentTotal = occurrences > 1 ? occurrences : null;

    statements.push(
      c.env.DB.prepare(
        `INSERT INTO transactions
          (id, date, account_id, category_id, amount, note, type, transfer_to, fee, source, paid_status, recurring_group_id, recurring_mode, installment_index, installment_total, parent_transaction_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'single', ?, ?, ?, ?, ?, NULL, ?, ?)`
      ).bind(
        rowId,
        occurrenceDate,
        body.account_id,
        categoryId,
        rowAmounts[i],
        body.note ?? null,
        effectiveType,
        body.transfer_to ?? null,
        body.type === 'transfer' ? body.fee ?? null : null,
        paidStatus,
        recurringGroupId,
        recurringMode,
        installmentIndex,
        installmentTotal,
        actor?.id ?? null,
        actor?.id ?? null
      )
    );

    balanceOps.push(
      ...transactionBalanceOps(
        toBalanceRow(
          {
            account_id: body.account_id,
            transfer_to: body.transfer_to ?? null,
            type: effectiveType,
          },
          rowAmounts[i]
        ),
        1
      )
    );

    if (body.type === 'transfer' && body.fee && body.fee > 0) {
      const feeRowId = crypto.randomUUID();
      insertedIds.push(feeRowId);

      statements.push(
        c.env.DB.prepare(
          `INSERT INTO transactions
            (id, date, account_id, category_id, amount, note, type, transfer_to, fee, source, paid_status, recurring_group_id, recurring_mode, installment_index, installment_total, parent_transaction_id, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, 'expense', NULL, NULL, 'single', ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          feeRowId,
          occurrenceDate,
          body.account_id,
          FEE_CATEGORY_ID,
          body.fee,
          body.note ?? null,
          paidStatus,
          recurringGroupId,
          recurringMode,
          installmentIndex,
          installmentTotal,
          rowId,
          actor?.id ?? null,
          actor?.id ?? null
        )
      );

      balanceOps.push(
        ...transactionBalanceOps(
          toBalanceRow(
            { account_id: body.account_id, transfer_to: null, type: 'expense' },
            body.fee
          ),
          1
        )
      );
    }
  }

  for (const op of mergeBalanceOps(balanceOps)) {
    statements.push(adjustBalanceStatement(c.env.DB, op));
  }

  await c.env.DB.batch(statements);
  await rebuildMonthlyBalancesFrom(
    c.env.DB,
    body.date,
    actor?.id ?? null
  );

  const placeholders = insertedIds.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM transactions WHERE id IN (${placeholders}) ORDER BY date ASC, installment_index ASC`
  )
    .bind(...insertedIds)
    .all();

  return c.json(results, 201);
});

app.put('/:id', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?')
    .bind(id)
    .first<TransactionRow>();

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  const body = transactionUpdate.parse(await c.req.json());

  if (body.category_id !== undefined) {
    if (existing.transfer_to !== null || existing.parent_transaction_id !== null) {
      return c.json({ error: 'cannot change category on a transfer or fee row' }, 400);
    }
    if (body.category_id === null) {
      return c.json({ error: 'category_id required' }, 400);
    }

    const categoryError = await validateCategoryForType(
      c.env.DB,
      body.category_id,
      existing.type as 'income' | 'expense'
    );
    if (categoryError) {
      return c.json({ error: categoryError }, 400);
    }
  }

  const newAmount = body.amount ?? existing.amount;
  const newIsActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;

  const balanceOps: BalanceOp[] = [];
  if (existing.is_active === 1) {
    balanceOps.push(...transactionBalanceOps(toBalanceRow(existing, existing.amount), -1));
  }
  if (newIsActive === 1) {
    balanceOps.push(...transactionBalanceOps(toBalanceRow(existing, newAmount), 1));
  }

  // Cascade is_active flips to fee-row children, mirroring soft-delete's cascade,
  // so a restored/disabled transfer doesn't leave its fee row's balance stale.
  let feeChildren: TransactionRow[] = [];
  if (newIsActive !== existing.is_active) {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM transactions WHERE parent_transaction_id = ? AND is_active = ?'
    )
      .bind(id, existing.is_active)
      .all<TransactionRow>();
    feeChildren = results;

    for (const child of feeChildren) {
      balanceOps.push(
        ...transactionBalanceOps(toBalanceRow(child, child.amount), existing.is_active === 1 ? -1 : 1)
      );
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.date !== undefined) {
    fields.push('date = ?');
    values.push(body.date);
  }
  if (body.category_id !== undefined) {
    fields.push('category_id = ?');
    values.push(body.category_id);
  }
  if (body.amount !== undefined) {
    fields.push('amount = ?');
    values.push(body.amount);
  }
  if (body.note !== undefined) {
    fields.push('note = ?');
    values.push(body.note);
  }
  if (body.paid_status !== undefined) {
    fields.push('paid_status = ?');
    values.push(body.paid_status);
  }
  if (body.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(newIsActive);
    if (body.is_active) {
      fields.push('deleted_by = NULL');
      fields.push('deleted_at = NULL');
    } else {
      fields.push('deleted_by = ?');
      values.push(actor?.id ?? null);
      fields.push('deleted_at = unixepoch()');
    }
  }

  const statements: D1PreparedStatement[] = [];

  if (fields.length > 0) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE transactions
         SET ${fields.join(', ')}, updated_by = ?, updated_at = unixepoch()
         WHERE id = ?`
      )
        .bind(...values, actor?.id ?? null, id)
    );
  } else {
    statements.push(
      c.env.DB.prepare(
        'UPDATE transactions SET updated_by = ?, updated_at = unixepoch() WHERE id = ?'
      ).bind(actor?.id ?? null, id)
    );
  }

  if (feeChildren.length > 0) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE transactions
         SET is_active = ?,
             updated_by = ?,
             deleted_by = CASE WHEN ? = 1 THEN NULL ELSE ? END,
             deleted_at = CASE WHEN ? = 1 THEN NULL ELSE unixepoch() END,
             updated_at = unixepoch()
         WHERE parent_transaction_id = ? AND is_active = ?`
      ).bind(newIsActive, actor?.id ?? null, newIsActive, actor?.id ?? null, newIsActive, id, existing.is_active)
    );
  }

  for (const op of mergeBalanceOps(balanceOps)) {
    statements.push(adjustBalanceStatement(c.env.DB, op));
  }

  await c.env.DB.batch(statements);
  await rebuildMonthlyBalancesFrom(
    c.env.DB,
    Math.min(existing.date, body.date ?? existing.date),
    actor?.id ?? null
  );

  const row = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first();

  return c.json(row, 200);
});

app.delete('/:id', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?')
    .bind(id)
    .first<TransactionRow>();

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  const hard = c.req.query('hard') === 'true';

  const { results: children } = await c.env.DB.prepare(
    'SELECT * FROM transactions WHERE parent_transaction_id = ?'
  )
    .bind(id)
    .all<TransactionRow>();

  const rowsToReverse = [existing, ...children].filter((row) => row.is_active === 1);
  const balanceOps: BalanceOp[] = rowsToReverse.flatMap((row) =>
    transactionBalanceOps(toBalanceRow(row, row.amount), -1)
  );

  const statements: D1PreparedStatement[] = [];
  for (const op of mergeBalanceOps(balanceOps)) {
    statements.push(adjustBalanceStatement(c.env.DB, op));
  }

  if (hard) {
    statements.push(c.env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id));
    await c.env.DB.batch(statements);
    await rebuildMonthlyBalancesFrom(c.env.DB, existing.date, actor?.id ?? null);
    return c.json({ id, deleted: true }, 200);
  }

  statements.push(
    c.env.DB.prepare(
      `UPDATE transactions
       SET is_active = 0,
           updated_by = ?,
           deleted_by = ?,
           deleted_at = unixepoch(),
           updated_at = unixepoch()
       WHERE is_active = 1 AND (id = ? OR parent_transaction_id = ?)`
    ).bind(actor?.id ?? null, actor?.id ?? null, id, id)
  );

  await c.env.DB.batch(statements);
  await rebuildMonthlyBalancesFrom(c.env.DB, existing.date, actor?.id ?? null);

  const row = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first();

  return c.json(row, 200);
});

app.patch('/:id/pay', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?')
    .bind(id)
    .first<TransactionRow>();

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  if (existing.paid_status === 'paid') {
    return c.json({ error: 'already paid' }, 409);
  }

  const sourceAccount = await loadActiveAccount(c.env.DB, existing.account_id);
  if (sourceAccount?.type === 'credit_card') {
    return c.json({ error: 'use the credit card payment flow to settle this transaction' }, 400);
  }

  await c.env.DB.prepare(
    "UPDATE transactions SET paid_status = 'paid', updated_by = ?, updated_at = unixepoch() WHERE id = ?"
  )
    .bind(actor?.id ?? null, id)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first();

  return c.json(row, 200);
});

export default app;
