import { Hono } from 'hono';
import { getCurrentUser, type Bindings } from '../middleware/auth';
import {
  listAccessibleAccountIds,
  requireAccountAccess,
  requireNonReimbursement,
} from '../lib/access';
import { csvImportCommitInput, receiptImportCommitInput, transactionCreate, transactionUpdate } from '../lib/validation';
import {
  adjustBalanceStatement,
  mergeBalanceOps,
  transactionBalanceOps,
  type BalanceOp,
  type TransactionBalanceRow,
} from '../lib/balance';
import { LIABILITY_ACCOUNT_TYPES } from '../lib/constants';
import { inPlaceholders, sha256Hex } from '../lib/db';
import { rebuildMonthlyBalancesFrom } from '../lib/month-balance';
import { buildReceiptDraft } from '../lib/receipt-import';
import { buildCsvImportDraft } from '../lib/csv-import';
import { rebuildTrackedItemForecast } from '../lib/tracked-items';

const app = new Hono<{ Bindings: Bindings }>();

const FEE_CATEGORY_ID = 'cat-admin';
const TRANSFER_CATEGORY_ID = 'cat-transfer';
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
  merchant: string | null;
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
  tracked_item_id?: string | null;
  refill_quantity?: number | null;
  remaining_qty_before_refill?: number | null;
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

type TrackedItemRow = {
  id: string;
  category_id: string;
  is_active: number;
};

type TrackedItemRefillRow = {
  id: string;
  tracked_item_id: string;
  transaction_id: string | null;
  quantity_added: number;
  remaining_qty_before_refill: number | null;
};

const TRANSACTION_SELECT = `SELECT t.*,
  r.tracked_item_id AS tracked_item_id,
  r.quantity_added AS refill_quantity,
  r.remaining_qty_before_refill AS remaining_qty_before_refill
 FROM transactions t
 LEFT JOIN tracked_item_refills r ON r.transaction_id = t.id`;

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

async function loadActiveTrackedItem(db: D1Database, id: string): Promise<TrackedItemRow | null> {
  const row = await db.prepare(
    'SELECT id, category_id, is_active FROM tracked_items WHERE id = ?'
  )
    .bind(id)
    .first<TrackedItemRow>();
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

async function loadTrackedRefillForTransaction(
  db: D1Database,
  transactionId: string
): Promise<TrackedItemRefillRow | null> {
  return db.prepare(
    `SELECT id, tracked_item_id, transaction_id, quantity_added, remaining_qty_before_refill
     FROM tracked_item_refills
     WHERE transaction_id = ?`
  )
    .bind(transactionId)
    .first<TrackedItemRefillRow>();
}

function trackRefillFieldsPresent(body: {
  tracked_item_id?: string | null;
  refill_quantity?: number | null;
  remaining_qty_before_refill?: number | null;
}): boolean {
  return body.tracked_item_id !== undefined
    || body.refill_quantity !== undefined
    || body.remaining_qty_before_refill !== undefined;
}

async function createImportedExpenseRows(
  db: D1Database,
  actorId: string | null,
  accountId: string,
  rows: Array<{ date: number; category_id: string; amount: number; note: string; merchant?: string | null; paid_status: 'paid' | 'settle' }>,
  extraStatements: D1PreparedStatement[] = []
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
          (id, date, account_id, category_id, amount, note, merchant, type, transfer_to, fee, source, paid_status, recurring_group_id, recurring_mode, installment_index, installment_total, parent_transaction_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'expense', NULL, NULL, 'bulk', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`
      ).bind(id, row.date, accountId, row.category_id, row.amount, row.note, row.merchant ?? null, row.paid_status, actorId, actorId)
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

  statements.push(...extraStatements);
  await db.batch(statements);

  const minDate = Math.min(...rows.map((row) => row.date));
  await rebuildMonthlyBalancesFrom(db, minDate, actorId);

  const placeholders = inPlaceholders(insertedIds);
  const { results } = await db.prepare(
    `SELECT * FROM transactions WHERE id IN (${placeholders}) ORDER BY date ASC, created_at ASC`
  )
    .bind(...insertedIds)
    .all<TransactionRow>();

  return results;
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (c.req.query('include_inactive') !== 'true') {
    conditions.push('t.is_active = 1');
  }

  const accountId = c.req.query('account_id');
  if (accountId) {
    const forbidden = await requireAccountAccess(c, accountId);
    if (forbidden) return forbidden;
    conditions.push('t.account_id = ?');
    values.push(accountId);
  }

  const categoryId = c.req.query('category_id');
  if (categoryId) {
    conditions.push('t.category_id = ?');
    values.push(categoryId);
  }

  const type = c.req.query('type');
  if (type) {
    conditions.push('t.type = ?');
    values.push(type);
  }

  const paidStatus = c.req.query('paid_status');
  if (paidStatus) {
    conditions.push('t.paid_status = ?');
    values.push(paidStatus);
  }

  const recurringGroupId = c.req.query('recurring_group_id');
  if (recurringGroupId) {
    conditions.push('t.recurring_group_id = ?');
    values.push(recurringGroupId);
  }

  const from = c.req.query('from');
  if (from) {
    conditions.push('t.date >= ?');
    values.push(Number(from));
  }

  const to = c.req.query('to');
  if (to) {
    conditions.push('t.date <= ?');
    values.push(Number(to));
  }

  const accessibleAccountIds = await listAccessibleAccountIds(c.env.DB, user);
  if (accessibleAccountIds !== null) {
    if (accessibleAccountIds.length === 0) {
      return c.json([], 200);
    }
    const placeholders = inPlaceholders(accessibleAccountIds);
    conditions.push(`t.account_id IN (${placeholders})`);
    values.push(...accessibleAccountIds);
  }

  let query = TRANSACTION_SELECT;
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }
  query += ' ORDER BY t.date DESC';

  const { results } = await c.env.DB.prepare(query)
    .bind(...values)
    .all<TransactionRow>();

  return c.json(results, 200);
});

app.get('/merchants', async (c) => {
  const user = getCurrentUser(c);
  const conditions = [`merchant IS NOT NULL`, `merchant != ''`, 'is_active = 1'];
  const values: unknown[] = [];

  const accessibleAccountIds = await listAccessibleAccountIds(c.env.DB, user);
  if (accessibleAccountIds !== null) {
    if (accessibleAccountIds.length === 0) {
      return c.json([], 200);
    }
    conditions.push(`account_id IN (${inPlaceholders(accessibleAccountIds)})`);
    values.push(...accessibleAccountIds);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT merchant, COUNT(*) as uses, MAX(date) as last_used
     FROM transactions
     WHERE ${conditions.join(' AND ')}
     GROUP BY merchant
     ORDER BY uses DESC, last_used DESC
     LIMIT 200`
  ).bind(...values).all<{ merchant: string }>();

  return c.json(results.map((r) => r.merchant), 200);
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`${TRANSACTION_SELECT} WHERE t.id = ?`).bind(id).first<TransactionRow>();

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  const forbidden = await requireAccountAccess(c, (row as TransactionRow).account_id);
  if (forbidden) return forbidden;

  return c.json(row, 200);
});

app.post('/import-receipt/parse', async (c) => {
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

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
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

  const actor = getCurrentUser(c);
  const body = receiptImportCommitInput.parse(await c.req.json());
  const account = await loadActiveAccount(c.env.DB, body.account_id);
  if (!account) {
    return c.json({ error: 'account_id not found or inactive' }, 400);
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

app.post('/import-csv/parse', async (c) => {
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

  const form = await c.req.formData();
  const accountId = form.get('account_id');
  const date = form.get('date');
  const file = form.get('file');

  if (typeof accountId !== 'string' || !accountId) {
    return c.json({ error: 'account_id required' }, 400);
  }
  if (typeof date !== 'string' || !date || !Number.isFinite(Number(date))) {
    return c.json({ error: 'date required' }, 400);
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

  const fileObject = file as File;
  const fileBuffer = await fileObject.arrayBuffer();
  const fileHash = await sha256Hex(fileBuffer);
  const csvText = new TextDecoder().decode(fileBuffer);
  const draft = buildCsvImportDraft(accountId, Number(date), csvText);

  const existingImport = await c.env.DB.prepare(
    'SELECT id FROM transaction_csv_imports WHERE file_hash = ?'
  )
    .bind(fileHash)
    .first<{ id: string }>();

  return c.json(
    {
      ...draft,
      file_hash: fileHash,
      file_name: fileObject.name ?? null,
      already_imported: Boolean(existingImport),
    },
    200
  );
});

app.post('/import-csv/commit', async (c) => {
  const forbidden = requireNonReimbursement(c);
  if (forbidden) return forbidden;

  const actor = getCurrentUser(c);
  const body = csvImportCommitInput.parse(await c.req.json());
  const account = await loadActiveAccount(c.env.DB, body.account_id);
  if (!account) {
    return c.json({ error: 'account_id not found or inactive' }, 400);
  }

  const includedRows = body.draft_items.filter((row) => row.included);
  if (includedRows.length === 0) {
    return c.json({ error: 'at least one included row is required' }, 400);
  }

  for (const row of includedRows) {
    if (!row.description.trim()) {
      return c.json({ error: `description required for row ${row.id}` }, 400);
    }
    if (!row.category_id) {
      return c.json({ error: `category_id required for row ${row.id}` }, 400);
    }
    const categoryError = await validateCategoryForType(
      c.env.DB,
      row.category_id,
      row.amount < 0 ? undefined : 'expense'
    );
    if (categoryError) {
      return c.json({ error: `row ${row.id}: ${categoryError}` }, 400);
    }
  }

  const paidStatus: 'paid' | 'settle' = account.type === 'credit_card' ? 'settle' : 'paid';

  const guardStatement = c.env.DB.prepare(
    `INSERT INTO transaction_csv_imports (id, file_hash, file_name, account_id, date, row_count, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    body.file_hash,
    body.file_name ?? null,
    body.account_id,
    body.date,
    includedRows.length,
    actor?.id ?? null
  );

  let created: TransactionRow[];
  try {
    created = await createImportedExpenseRows(
      c.env.DB,
      actor?.id ?? null,
      body.account_id,
      includedRows.map((row) => ({
        date: body.date,
        category_id: row.category_id as string,
        amount: row.amount,
        note: row.description.trim(),
        merchant: row.merchant?.trim() || null,
        paid_status: paidStatus,
      })),
      [guardStatement]
    );
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed:\s*transaction_csv_imports\.file_hash/i.test(err.message)) {
      return c.json({ error: 'This file has already been imported.' }, 409);
    }
    throw err;
  }

  return c.json(created, 201);
});

app.post('/', async (c) => {
  const actor = getCurrentUser(c);
  const body = transactionCreate.parse(await c.req.json());
  const accountForbidden = await requireAccountAccess(c, body.account_id);
  if (accountForbidden) return accountForbidden;

  if (body.tracked_item_id && body.recurring) {
    return c.json({ error: 'tracked item refill is not allowed for recurring transactions' }, 400);
  }

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

  if (body.type !== 'expense' && trackRefillFieldsPresent(body)) {
    return c.json({ error: 'tracked item refill is only allowed for expense transactions' }, 400);
  }
  if (body.type === 'expense' && body.tracked_item_id && (body.refill_quantity === undefined || body.refill_quantity === null)) {
    return c.json({ error: 'refill_quantity required when tracked_item_id is provided' }, 400);
  }
  if (body.type === 'expense' && !body.tracked_item_id && (body.refill_quantity !== undefined || body.remaining_qty_before_refill !== undefined)) {
    return c.json({ error: 'tracked_item_id required when refill fields are provided' }, 400);
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
    const transferForbidden = await requireAccountAccess(c, body.transfer_to);
    if (transferForbidden) return transferForbidden;
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

  let trackedItem: TrackedItemRow | null = null;
  if (body.type === 'expense' && body.tracked_item_id) {
    trackedItem = await loadActiveTrackedItem(c.env.DB, body.tracked_item_id);
    if (!trackedItem) {
      return c.json({ error: 'tracked_item_id not found or inactive' }, 400);
    }
    if (trackedItem.category_id !== categoryId) {
      return c.json({ error: 'tracked item category must match transaction category' }, 400);
    }
  }

  const occurrences = body.recurring?.total ?? 1;
  const rowAmounts = computeRowAmounts(body.amount, occurrences, body.recurring?.mode);
  const recurringMode = body.recurring?.mode ?? null;

  const statements: D1PreparedStatement[] = [];
  const balanceOps: BalanceOp[] = [];
  const insertedIds: string[] = [];
  const trackedItemIdsToRebuild = new Set<string>();
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
          (id, date, account_id, category_id, amount, note, merchant, type, transfer_to, fee, source, paid_status, recurring_group_id, recurring_mode, installment_index, installment_total, parent_transaction_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'single', ?, ?, ?, ?, ?, NULL, ?, ?)`
      ).bind(
        rowId,
        occurrenceDate,
        body.account_id,
        categoryId,
        rowAmounts[i],
        body.note ?? null,
        body.merchant || null,
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

    if (i === 0 && trackedItem && body.refill_quantity !== null && body.refill_quantity !== undefined) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO tracked_item_refills
            (id, tracked_item_id, transaction_id, date, quantity_added, remaining_qty_before_refill, note, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          trackedItem.id,
          rowId,
          occurrenceDate,
          body.refill_quantity,
          body.remaining_qty_before_refill ?? null,
          body.note ?? null,
          actor?.id ?? null,
          actor?.id ?? null,
        )
      );
      trackedItemIdsToRebuild.add(trackedItem.id);
    }

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
            (id, date, account_id, category_id, amount, note, merchant, type, transfer_to, fee, source, paid_status, recurring_group_id, recurring_mode, installment_index, installment_total, parent_transaction_id, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'expense', NULL, NULL, 'single', ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          feeRowId,
          occurrenceDate,
          body.account_id,
          FEE_CATEGORY_ID,
          body.fee,
          body.note ?? null,
          body.merchant || null,
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
  for (const trackedItemId of trackedItemIdsToRebuild) {
    await rebuildTrackedItemForecast(c.env.DB, trackedItemId);
  }
  await rebuildMonthlyBalancesFrom(
    c.env.DB,
    body.date,
    actor?.id ?? null
  );

  const placeholders = inPlaceholders(insertedIds);
  const { results } = await c.env.DB.prepare(
    `${TRANSACTION_SELECT} WHERE t.id IN (${placeholders}) ORDER BY t.date ASC, t.installment_index ASC`
  )
    .bind(...insertedIds)
    .all<TransactionRow>();

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

  const forbidden = await requireAccountAccess(c, existing.account_id);
  if (forbidden) return forbidden;

  const body = transactionUpdate.parse(await c.req.json());
  const existingRefill = await loadTrackedRefillForTransaction(c.env.DB, id);
  if (actor?.role === 'reimbursement' && (body.is_active !== undefined || body.paid_status !== undefined)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

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

  if ((existing.type !== 'expense' || existing.transfer_to !== null || existing.parent_transaction_id !== null) && trackRefillFieldsPresent(body)) {
    return c.json({ error: 'tracked item refill is only allowed for expense transactions' }, 400);
  }

  const resultingTrackedItemId = body.tracked_item_id !== undefined
    ? body.tracked_item_id
    : existingRefill?.tracked_item_id ?? null;

  if (resultingTrackedItemId === null && (body.refill_quantity !== undefined || body.remaining_qty_before_refill !== undefined)) {
    return c.json({ error: 'tracked_item_id required when refill fields are provided' }, 400);
  }

  const resultingCategoryId = body.category_id !== undefined ? body.category_id : existing.category_id;
  let resultingTrackedItem: TrackedItemRow | null = null;
  if (resultingTrackedItemId) {
    resultingTrackedItem = await loadActiveTrackedItem(c.env.DB, resultingTrackedItemId);
    if (!resultingTrackedItem) {
      return c.json({ error: 'tracked_item_id not found or inactive' }, 400);
    }
    if (resultingTrackedItem.category_id !== resultingCategoryId) {
      return c.json({ error: 'tracked item category must match transaction category' }, 400);
    }
    if (!existingRefill && (body.refill_quantity === undefined || body.refill_quantity === null)) {
      return c.json({ error: 'refill_quantity required when tracked_item_id is provided' }, 400);
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
  if (body.merchant !== undefined) {
    fields.push('merchant = ?');
    values.push(body.merchant || null);
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
  const trackedItemIdsToRebuild = new Set<string>();

  statements.push(
    c.env.DB.prepare(
      `UPDATE transactions
       SET ${[...fields, 'updated_by = ?', 'updated_at = unixepoch()'].join(', ')}
       WHERE id = ?`
    )
      .bind(...values, actor?.id ?? null, id)
  );

  if (existingRefill && resultingTrackedItemId === null) {
    statements.push(
      c.env.DB.prepare('DELETE FROM tracked_item_refills WHERE id = ?').bind(existingRefill.id)
    );
    trackedItemIdsToRebuild.add(existingRefill.tracked_item_id);
  }

  if (resultingTrackedItemId && resultingTrackedItem) {
    const refillQuantity = body.refill_quantity !== undefined
      ? body.refill_quantity
      : existingRefill?.tracked_item_id === resultingTrackedItemId
        ? existingRefill.quantity_added
        : null;
    if (refillQuantity === null) {
      return c.json({ error: 'refill_quantity required when tracked_item_id is provided' }, 400);
    }

    const remainingQtyBeforeRefill = body.remaining_qty_before_refill !== undefined
      ? body.remaining_qty_before_refill
      : existingRefill?.tracked_item_id === resultingTrackedItemId
        ? existingRefill.remaining_qty_before_refill
        : null;

    if (existingRefill) {
      statements.push(
        c.env.DB.prepare(
          `UPDATE tracked_item_refills
           SET tracked_item_id = ?,
               date = ?,
               quantity_added = ?,
               remaining_qty_before_refill = ?,
               note = ?,
               updated_by = ?,
               updated_at = unixepoch()
           WHERE id = ?`
        ).bind(
          resultingTrackedItem.id,
          body.date ?? existing.date,
          refillQuantity,
          remainingQtyBeforeRefill ?? null,
          body.note ?? existing.note ?? null,
          actor?.id ?? null,
          existingRefill.id,
        )
      );
      trackedItemIdsToRebuild.add(existingRefill.tracked_item_id);
    } else {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO tracked_item_refills
            (id, tracked_item_id, transaction_id, date, quantity_added, remaining_qty_before_refill, note, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          resultingTrackedItem.id,
          id,
          body.date ?? existing.date,
          refillQuantity,
          remainingQtyBeforeRefill ?? null,
          body.note ?? existing.note ?? null,
          actor?.id ?? null,
          actor?.id ?? null,
        )
      );
    }
    trackedItemIdsToRebuild.add(resultingTrackedItem.id);
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
  for (const trackedItemId of trackedItemIdsToRebuild) {
    await rebuildTrackedItemForecast(c.env.DB, trackedItemId);
  }
  await rebuildMonthlyBalancesFrom(
    c.env.DB,
    Math.min(existing.date, body.date ?? existing.date),
    actor?.id ?? null
  );

  const row = await c.env.DB.prepare(`${TRANSACTION_SELECT} WHERE t.id = ?`).bind(id).first();

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

  const forbidden = await requireAccountAccess(c, existing.account_id);
  if (forbidden) return forbidden;
  if (actor?.role === 'reimbursement') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const hard = c.req.query('hard') === 'true';
  const linkedRefill = await loadTrackedRefillForTransaction(c.env.DB, id);

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
    if (linkedRefill) {
      await rebuildTrackedItemForecast(c.env.DB, linkedRefill.tracked_item_id);
    }
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
  if (linkedRefill) {
    await rebuildTrackedItemForecast(c.env.DB, linkedRefill.tracked_item_id);
  }
  await rebuildMonthlyBalancesFrom(c.env.DB, existing.date, actor?.id ?? null);

  const row = await c.env.DB.prepare(`${TRANSACTION_SELECT} WHERE t.id = ?`).bind(id).first();

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
