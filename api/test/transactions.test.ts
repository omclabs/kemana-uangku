import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const AUTH = { Authorization: 'Bearer test-token' };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

const BASE_DATE = Math.floor(new Date('2026-01-15T00:00:00Z').getTime() / 1000);

type TxRow = {
  id: string;
  date: number;
  account_id: string;
  category_id: string | null;
  amount: number;
  type: string;
  transfer_to: string | null;
  fee: number | null;
  source: 'single' | 'bulk';
  paid_status: string;
  recurring_group_id: string | null;
  recurring_mode: string | null;
  installment_index: number | null;
  installment_total: number | null;
  parent_transaction_id: string | null;
  is_active: number;
};

async function getAccountBalance(id: string): Promise<number> {
  const res = await SELF.fetch(`https://example.com/accounts/${id}`, { headers: AUTH });
  const body = (await res.json()) as { balance: number };
  return body.balance;
}

async function postTransaction(body: Record<string, unknown>) {
  return SELF.fetch('https://example.com/transactions', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

async function listTransactions() {
  const res = await SELF.fetch('https://example.com/transactions', { headers: AUTH });
  return (await res.json()) as TxRow[];
}

describe('/transactions', () => {
  it('POST income without category_id returns 400', async () => {
    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      amount: 1000,
      type: 'income',
    });
    expect(res.status).toBe(400);
  });

  it('POST expense with transfer_to returns 400', async () => {
    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      category_id: 'cat-food-breakfast',
      amount: 1000,
      type: 'expense',
      transfer_to: 'acc-cash',
    });
    expect(res.status).toBe(400);
  });

  it('POST expense with fee returns 400', async () => {
    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      category_id: 'cat-food-breakfast',
      amount: 1000,
      type: 'expense',
      fee: 100,
    });
    expect(res.status).toBe(400);
  });

  it('POST transfer without transfer_to returns 400', async () => {
    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      amount: 1000,
      type: 'transfer',
    });
    expect(res.status).toBe(400);
  });

  it('POST transfer to itself returns 400', async () => {
    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      amount: 1000,
      type: 'transfer',
      transfer_to: 'acc-bank-bca',
    });
    expect(res.status).toBe(400);
  });

  it('POST expense with a category that has active children returns 400', async () => {
    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      category_id: 'cat-food', // has children (cat-food-breakfast, ...)
      amount: 1000,
      type: 'expense',
    });
    expect(res.status).toBe(400);
  });

  it('POST expense with an income category returns 400', async () => {
    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      category_id: 'cat-inc-salary',
      amount: 1000,
      type: 'expense',
    });
    expect(res.status).toBe(400);
  });

  it('POST installment with amount < occurrence count returns 400', async () => {
    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      category_id: 'cat-food-breakfast',
      amount: 2,
      type: 'expense',
      recurring: { mode: 'installment', total: 3 },
    });
    expect(res.status).toBe(400);
  });

  it('POST income increases account balance and sets paid_status=paid for a bank account', async () => {
    const before = await getAccountBalance('acc-bank-bca');

    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      category_id: 'cat-inc-salary',
      amount: 1000000,
      type: 'income',
      note: 'Salary',
    });
    expect(res.status).toBe(201);
    const rows = (await res.json()) as TxRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0].paid_status).toBe('paid');
    expect(rows[0].type).toBe('income');

    const after = await getAccountBalance('acc-bank-bca');
    expect(after - before).toBeCloseTo(1000000, 5);
  });

  it('POST expense decreases account balance', async () => {
    const before = await getAccountBalance('acc-bank-bca');

    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      category_id: 'cat-food-breakfast',
      amount: 50000,
      type: 'expense',
    });
    expect(res.status).toBe(201);

    const after = await getAccountBalance('acc-bank-bca');
    expect(after - before).toBeCloseTo(-50000, 5);
  });

  it('POST transfer moves balance from -> to, category_id stays null', async () => {
    const fromBefore = await getAccountBalance('acc-bank-bca');
    const toBefore = await getAccountBalance('acc-bank-cimb');

    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      transfer_to: 'acc-bank-cimb',
      amount: 200000,
      type: 'transfer',
    });
    expect(res.status).toBe(201);
    const rows = (await res.json()) as TxRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('transfer');
    expect(rows[0].category_id).toBeNull();

    const fromAfter = await getAccountBalance('acc-bank-bca');
    const toAfter = await getAccountBalance('acc-bank-cimb');
    expect(fromAfter - fromBefore).toBeCloseTo(-200000, 5);
    expect(toAfter - toBefore).toBeCloseTo(200000, 5);
  });

  it('POST transfer with fee creates a linked fee row and applies both deltas', async () => {
    const fromBefore = await getAccountBalance('acc-bank-bca');
    const toBefore = await getAccountBalance('acc-bank-cimb');

    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      transfer_to: 'acc-bank-cimb',
      amount: 100000,
      fee: 5000,
      type: 'transfer',
    });
    expect(res.status).toBe(201);
    const rows = (await res.json()) as TxRow[];
    expect(rows).toHaveLength(2);

    const main = rows.find((r) => r.type === 'transfer')!;
    const feeRow = rows.find((r) => r.type === 'expense')!;
    expect(main.fee).toBe(5000);
    expect(feeRow.category_id).toBe('cat-admin');
    expect(feeRow.amount).toBe(5000);
    expect(feeRow.parent_transaction_id).toBe(main.id);

    const fromAfter = await getAccountBalance('acc-bank-bca');
    const toAfter = await getAccountBalance('acc-bank-cimb');
    expect(fromAfter - fromBefore).toBeCloseTo(-105000, 5);
    expect(toAfter - toBefore).toBeCloseTo(100000, 5);
  });

  it('POST transfer to a credit_card account is reclassified to expense with cat-transfer', async () => {
    const fromBefore = await getAccountBalance('acc-bank-bca');
    const ccBefore = await getAccountBalance('acc-cc-cimb');

    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      transfer_to: 'acc-cc-cimb',
      amount: 50000,
      type: 'transfer',
    });
    expect(res.status).toBe(201);
    const rows = (await res.json()) as TxRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('expense');
    expect(rows[0].category_id).toBe('cat-transfer');
    expect(rows[0].transfer_to).toBe('acc-cc-cimb');
    expect(rows[0].paid_status).toBe('paid'); // from-account (bank) drives paid_status

    const fromAfter = await getAccountBalance('acc-bank-bca');
    const ccAfter = await getAccountBalance('acc-cc-cimb');
    expect(fromAfter - fromBefore).toBeCloseTo(-50000, 5);
    expect(ccAfter - ccBefore).toBeCloseTo(50000, 5); // debt reduced
  });

  it('POST expense from a credit_card account sets paid_status=settle', async () => {
    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-cc-cimb',
      category_id: 'cat-food-breakfast',
      amount: 20000,
      type: 'expense',
    });
    expect(res.status).toBe(201);
    const rows = (await res.json()) as TxRow[];
    expect(rows[0].paid_status).toBe('settle');
  });

  it('recurring: pre-generates N rows with the same amount, one per month', async () => {
    const before = await getAccountBalance('acc-bank-bca');

    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      category_id: 'cat-inc-salary',
      amount: 100000,
      type: 'income',
      recurring: { mode: 'recurring', total: 3 },
    });
    expect(res.status).toBe(201);
    const rows = (await res.json()) as TxRow[];
    expect(rows).toHaveLength(3);

    rows.forEach((row, i) => {
      expect(row.amount).toBe(100000);
      expect(row.recurring_mode).toBe('recurring');
      expect(row.installment_index).toBe(i + 1);
      expect(row.installment_total).toBe(3);
      expect(row.recurring_group_id).toBe(rows[0].id);
    });

    expect(new Date(rows[0].date * 1000).getUTCMonth()).toBe(0); // Jan
    expect(new Date(rows[1].date * 1000).getUTCMonth()).toBe(1); // Feb
    expect(new Date(rows[2].date * 1000).getUTCMonth()).toBe(2); // Mar

    const after = await getAccountBalance('acc-bank-bca');
    expect(after - before).toBeCloseTo(300000, 5);
  });

  it('installment: splits amount across N rows, remainder on the last row', async () => {
    const before = await getAccountBalance('acc-bank-bca');

    const res = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      category_id: 'cat-food-breakfast',
      amount: 100000,
      type: 'expense',
      recurring: { mode: 'installment', total: 3 },
    });
    expect(res.status).toBe(201);
    const rows = (await res.json()) as TxRow[];
    expect(rows).toHaveLength(3);

    expect(rows[0].amount).toBe(33333);
    expect(rows[1].amount).toBe(33333);
    expect(rows[2].amount).toBe(33334);
    expect(rows[0].amount + rows[1].amount + rows[2].amount).toBe(100000);

    const after = await getAccountBalance('acc-bank-bca');
    expect(after - before).toBeCloseTo(-100000, 5);
  });

  it('PATCH /:id/pay flips settle -> paid, and 409s if already paid', async () => {
    const createRes = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-cc-cimb',
      category_id: 'cat-food-breakfast',
      amount: 15000,
      type: 'expense',
    });
    const [row] = (await createRes.json()) as TxRow[];
    expect(row.paid_status).toBe('settle');

    const payRes = await SELF.fetch(`https://example.com/transactions/${row.id}/pay`, {
      method: 'PATCH',
      headers: AUTH,
    });
    expect(payRes.status).toBe(200);
    const paid = (await payRes.json()) as TxRow;
    expect(paid.paid_status).toBe('paid');

    const againRes = await SELF.fetch(`https://example.com/transactions/${row.id}/pay`, {
      method: 'PATCH',
      headers: AUTH,
    });
    expect(againRes.status).toBe(409);
  });

  it('PUT amount change adjusts the balance by the diff', async () => {
    const before = await getAccountBalance('acc-bank-bca');

    const createRes = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      category_id: 'cat-inc-salary',
      amount: 100000,
      type: 'income',
    });
    const [row] = (await createRes.json()) as TxRow[];

    const afterCreate = await getAccountBalance('acc-bank-bca');
    expect(afterCreate - before).toBeCloseTo(100000, 5);

    const putRes = await SELF.fetch(`https://example.com/transactions/${row.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ amount: 150000 }),
    });
    expect(putRes.status).toBe(200);

    const afterPut = await getAccountBalance('acc-bank-bca');
    expect(afterPut - before).toBeCloseTo(150000, 5);
  });

  it('DELETE (soft) reverses the balance and sets is_active=0', async () => {
    const before = await getAccountBalance('acc-bank-bca');

    const createRes = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      category_id: 'cat-food-breakfast',
      amount: 30000,
      type: 'expense',
    });
    const [row] = (await createRes.json()) as TxRow[];

    const afterCreate = await getAccountBalance('acc-bank-bca');
    expect(afterCreate - before).toBeCloseTo(-30000, 5);

    const deleteRes = await SELF.fetch(`https://example.com/transactions/${row.id}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(deleteRes.status).toBe(200);
    const deleted = (await deleteRes.json()) as TxRow;
    expect(deleted.is_active).toBe(0);

    const afterDelete = await getAccountBalance('acc-bank-bca');
    expect(afterDelete - before).toBeCloseTo(0, 5);
  });

  it('DELETE ?hard=true on a transfer with a fee row cascades and reverses both deltas', async () => {
    const fromBefore = await getAccountBalance('acc-bank-bca');
    const toBefore = await getAccountBalance('acc-bank-cimb');

    const createRes = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      transfer_to: 'acc-bank-cimb',
      amount: 100000,
      fee: 5000,
      type: 'transfer',
    });
    const rows = (await createRes.json()) as TxRow[];
    const main = rows.find((r) => r.type === 'transfer')!;
    const feeRow = rows.find((r) => r.type === 'expense')!;

    const hardDeleteRes = await SELF.fetch(`https://example.com/transactions/${main.id}?hard=true`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(hardDeleteRes.status).toBe(200);

    const fromAfter = await getAccountBalance('acc-bank-bca');
    const toAfter = await getAccountBalance('acc-bank-cimb');
    expect(fromAfter - fromBefore).toBeCloseTo(0, 5);
    expect(toAfter - toBefore).toBeCloseTo(0, 5);

    const mainGet = await SELF.fetch(`https://example.com/transactions/${main.id}`, { headers: AUTH });
    expect(mainGet.status).toBe(404);

    const feeGet = await SELF.fetch(`https://example.com/transactions/${feeRow.id}`, { headers: AUTH });
    expect(feeGet.status).toBe(404);
  });

  it('PUT is_active cascades to a fee row, reversing and re-applying both deltas', async () => {
    const fromBefore = await getAccountBalance('acc-bank-bca');
    const toBefore = await getAccountBalance('acc-bank-cimb');

    const createRes = await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-bank-bca',
      transfer_to: 'acc-bank-cimb',
      amount: 100000,
      fee: 5000,
      type: 'transfer',
    });
    const rows = (await createRes.json()) as TxRow[];
    const main = rows.find((r) => r.type === 'transfer')!;
    const feeRow = rows.find((r) => r.type === 'expense')!;

    const disableRes = await SELF.fetch(`https://example.com/transactions/${main.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ is_active: false }),
    });
    expect(disableRes.status).toBe(200);

    let fromAfter = await getAccountBalance('acc-bank-bca');
    let toAfter = await getAccountBalance('acc-bank-cimb');
    expect(fromAfter - fromBefore).toBeCloseTo(0, 5);
    expect(toAfter - toBefore).toBeCloseTo(0, 5);

    const feeAfterDisable = await SELF.fetch(`https://example.com/transactions/${feeRow.id}`, { headers: AUTH });
    expect(((await feeAfterDisable.json()) as TxRow).is_active).toBe(0);

    const restoreRes = await SELF.fetch(`https://example.com/transactions/${main.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ is_active: true }),
    });
    expect(restoreRes.status).toBe(200);

    fromAfter = await getAccountBalance('acc-bank-bca');
    toAfter = await getAccountBalance('acc-bank-cimb');
    expect(fromAfter - fromBefore).toBeCloseTo(-105000, 5);
    expect(toAfter - toBefore).toBeCloseTo(100000, 5);

    const feeAfterRestore = await SELF.fetch(`https://example.com/transactions/${feeRow.id}`, { headers: AUTH });
    expect(((await feeAfterRestore.json()) as TxRow).is_active).toBe(1);
  });

  it('GET /transactions supports filtering by type and account_id', async () => {
    await postTransaction({
      date: BASE_DATE,
      account_id: 'acc-cash',
      category_id: 'cat-inc-bonus',
      amount: 10000,
      type: 'income',
    });

    const res = await SELF.fetch('https://example.com/transactions?account_id=acc-cash&type=income', {
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as TxRow[];
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      expect(row.account_id).toBe('acc-cash');
      expect(row.type).toBe('income');
    });
  });

  it('POST /import-receipt/parse returns draft rows from csv without creating transactions', async () => {
    const before = await listTransactions();
    const form = new FormData();
    form.set('account_id', 'acc-bank-bca');
    form.set(
      'file',
      new File(
        [
          [
            'note,amount,date,kind',
            'Nasi Goreng,30000,2026-01-16,item',
            'Es Teh,8000,2026-01-16,item',
            'Voucher Toko,-5000,2026-01-16,voucher',
          ].join('\n'),
        ],
        'receipt.csv',
        { type: 'text/csv' }
      )
    );

    const res = await SELF.fetch('https://example.com/transactions/import-receipt/parse', {
      method: 'POST',
      headers: AUTH,
      body: form,
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      receipt_total: number | null;
      included_total: number;
      draft_items: Array<{ kind: string; note: string; amount: number; included: boolean; category_id: string | null }>;
      warnings: Array<{ code: string }>;
    };

    expect(body.receipt_total).toBeNull();
    expect(body.included_total).toBe(33000);
    expect(body.draft_items).toHaveLength(3);
    expect(body.draft_items.map((row) => row.amount)).toEqual([30000, 8000, -5000]);
    expect(body.draft_items.find((row) => row.kind === 'voucher')?.amount).toBe(-5000);
    expect(body.draft_items.every((row) => row.category_id === null)).toBe(true);
    expect(body.warnings.some((warning) => warning.code === 'invalid_csv')).toBe(false);

    const after = await listTransactions();
    expect(after).toHaveLength(before.length);
  });

  it('POST /import-receipt/parse rejects csv without required headers', async () => {
    const form = new FormData();
    form.set('account_id', 'acc-bank-bca');
    form.set(
      'file',
      new File([['description,total', 'Nasi Goreng,30000'].join('\n')], 'invalid.csv', { type: 'text/csv' })
    );

    const res = await SELF.fetch('https://example.com/transactions/import-receipt/parse', {
      method: 'POST',
      headers: AUTH,
      body: form,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      draft_items: Array<{ amount: number }>;
      warnings: Array<{ code: string }>;
    };
    expect(body.draft_items).toHaveLength(0);
    expect(body.warnings.some((row) => row.code === 'invalid_csv')).toBe(true);
  });

  it('POST /import-receipt/commit creates bulk expense rows and applies voucher balance math', async () => {
    const parseForm = new FormData();
    parseForm.set('account_id', 'acc-bank-bca');
    parseForm.set(
      'file',
      new File(
        [
          [
            'note,amount,date,kind',
            'Roti Bakar,12000,2026-01-16,item',
            'Kopi Susu,18000,2026-01-16,item',
            'Voucher Member,-5000,2026-01-16,voucher',
          ].join('\n'),
        ],
        'receipt.csv',
        { type: 'text/csv' }
      )
    );

    const parseRes = await SELF.fetch('https://example.com/transactions/import-receipt/parse', {
      method: 'POST',
      headers: AUTH,
      body: parseForm,
    });
    const draft = (await parseRes.json()) as {
      account_id: string;
      draft_items: Array<{
        id: string;
        kind: 'item' | 'voucher' | 'manual';
        note: string;
        amount: number;
        date: number;
        category_id: string | null;
        included: boolean;
        origin: 'parsed' | 'manual';
        confidence: number;
        warnings: Array<{ code: string; message: string; row_id?: string }>;
        raw_line: string | null;
      }>;
    };

    const before = await getAccountBalance('acc-bank-bca');
    const commitRes = await SELF.fetch('https://example.com/transactions/import-receipt/commit', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        account_id: draft.account_id,
        draft_items: [
          {
            ...draft.draft_items[0],
            category_id: 'cat-food-breakfast',
          },
          {
            ...draft.draft_items[1],
            note: 'Kopi susu panas',
            category_id: 'cat-food-coffee',
          },
          {
            ...draft.draft_items[2],
            category_id: 'cat-admin-bca',
          },
          {
            id: 'manual-row-1',
            kind: 'manual',
            note: 'Service charge',
            amount: 2000,
            date: draft.draft_items[0].date,
            category_id: 'cat-admin-bca',
            included: true,
            origin: 'manual',
            confidence: 1,
            warnings: [],
            raw_line: null,
          },
        ],
      }),
    });

    expect(commitRes.status).toBe(201);
    const created = (await commitRes.json()) as TxRow[];
    expect(created).toHaveLength(4);
    created.forEach((row) => {
      expect(row.source).toBe('bulk');
      expect(row.type).toBe('expense');
      expect(row.account_id).toBe('acc-bank-bca');
    });

    const voucherRow = created.find((row) => row.amount < 0)!;
    expect(voucherRow.amount).toBe(-5000);
    expect(voucherRow.category_id).toBe('cat-admin-bca');

    const after = await getAccountBalance('acc-bank-bca');
    expect(after - before).toBeCloseTo(-27000, 5);
  });
});
