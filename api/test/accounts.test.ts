import { SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetFinanceData } from './fixtures';

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

describe('/accounts', () => {
  beforeEach(async () => {
    await resetFinanceData();
  });

  it('GET /accounts returns empty on a fresh database', async () => {
    const res = await SELF.fetch('https://example.com/accounts', { headers: AUTH });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('GET /accounts sorts by type then name ascending', async () => {
    await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Zulu Bank', type: 'bank', balance: 0 }),
    });
    await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Alpha Bank', type: 'bank', balance: 0 }),
    });
    await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Bravo Cash', type: 'cash', balance: 0 }),
    });
    await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Alpha Cash', type: 'cash', balance: 0 }),
    });

    const res = await SELF.fetch('https://example.com/accounts?include_inactive=true', { headers: AUTH });
    expect(res.status).toBe(200);

    const rows = (await res.json()) as Array<{ type: string; name: string }>;
    expect(rows.map((row) => `${row.type}:${row.name}`)).toEqual([
      'bank:Alpha Bank',
      'bank:Zulu Bank',
      'cash:Alpha Cash',
      'cash:Bravo Cash',
    ]);
  });

  it('POST /accounts with invalid type returns 400', async () => {
    const res = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Bad', type: 'not_a_type' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /accounts credit_card without credit_limit/billing_date returns 400', async () => {
    const res = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'CC', type: 'credit_card' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /accounts non-credit_card with credit_limit set returns 400', async () => {
    const res = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Bank', type: 'bank', credit_limit: 1000 }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /accounts credit_card with billing_date out of range returns 400', async () => {
    const res = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'CC',
        type: 'credit_card',
        credit_limit: 5000000,
        billing_date: 35,
      }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /accounts count_transfer_as_expense=true on a non-liability account returns 400', async () => {
    const res = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Bank',
        type: 'bank',
        count_transfer_as_expense: true,
      }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /accounts count_transfer_as_expense=true on a credit_card account is accepted', async () => {
    const res = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'KPR',
        type: 'credit_card',
        credit_limit: 500000000,
        billing_date: 5,
        count_transfer_as_expense: true,
      }),
    });
    expect(res.status).toBe(201);
    const account = (await res.json()) as { count_transfer_as_expense: number };
    expect(account.count_transfer_as_expense).toBe(1);
  });

  it('full account hierarchy, computed_balance, and delete lifecycle', async () => {
    // Create a top-level bank account
    const parentRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Main Bank',
        type: 'bank',
        balance: 1000000,
        include_in_total: true,
      }),
    });
    expect(parentRes.status).toBe(201);
    const parent = (await parentRes.json()) as { id: string; parent_id: string | null; created_by: string | null };
    expect(parent.parent_id).toBeNull();
    expect(parent.created_by).toBe('user-admin');
    const parentId = parent.id;

    // Create a child account included in total (same type as parent)
    const childRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Sub Account',
        type: 'bank',
        balance: 200000,
        parent_id: parentId,
        include_in_total: true,
      }),
    });
    expect(childRes.status).toBe(201);
    const child = (await childRes.json()) as { id: string; is_active: number };
    expect(child.is_active).toBe(1);
    const childId = child.id;

    // GET parent -> computed_balance includes included child's balance
    const parentGetRes = await SELF.fetch(`https://example.com/accounts/${parentId}`, {
      headers: AUTH,
    });
    expect(parentGetRes.status).toBe(200);
    const parentGet = (await parentGetRes.json()) as { computed_balance: number };
    expect(parentGet.computed_balance).toBeCloseTo(1200000, 5);

    // GET child -> computed_balance == balance
    const childGetRes = await SELF.fetch(`https://example.com/accounts/${childId}`, {
      headers: AUTH,
    });
    expect(childGetRes.status).toBe(200);
    const childGet = (await childGetRes.json()) as { computed_balance: number; balance: number };
    expect(childGet.computed_balance).toBeCloseTo(childGet.balance, 5);
    expect(childGet.computed_balance).toBeCloseTo(200000, 5);

    // Create a second child excluded from total (same type as parent)
    const excludedChildRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Excluded Sub Account',
        type: 'bank',
        balance: 500000,
        parent_id: parentId,
        include_in_total: false,
      }),
    });
    expect(excludedChildRes.status).toBe(201);
    const excludedChild = (await excludedChildRes.json()) as { id: string };

    // GET parent again -> computed_balance unchanged (excluded child not counted)
    const parentGetRes2 = await SELF.fetch(`https://example.com/accounts/${parentId}`, {
      headers: AUTH,
    });
    const parentGet2 = (await parentGetRes2.json()) as { computed_balance: number };
    expect(parentGet2.computed_balance).toBeCloseTo(1200000, 5);

    // PUT parent changing type while it has children -> 400
    const typeChangeRes = await SELF.fetch(`https://example.com/accounts/${parentId}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ type: 'cash' }),
    });
    expect(typeChangeRes.status).toBe(400);

    // DELETE parent while it has active children -> 409
    const deleteWithActiveChildrenRes = await SELF.fetch(`https://example.com/accounts/${parentId}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(deleteWithActiveChildrenRes.status).toBe(409);

    // Soft-delete both children
    const softDeleteChildRes = await SELF.fetch(`https://example.com/accounts/${childId}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(softDeleteChildRes.status).toBe(200);
    const softDeletedChild = (await softDeleteChildRes.json()) as { is_active: number; deleted_by: string | null };
    expect(softDeletedChild.is_active).toBe(0);
    expect(softDeletedChild.deleted_by).toBe('user-admin');

    const softDeleteExcludedChildRes = await SELF.fetch(
      `https://example.com/accounts/${excludedChild.id}`,
      { method: 'DELETE', headers: AUTH }
    );
    expect(softDeleteExcludedChildRes.status).toBe(200);

    // Now soft-delete the parent (no active children left)
    const softDeleteParentRes = await SELF.fetch(`https://example.com/accounts/${parentId}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(softDeleteParentRes.status).toBe(200);
    const softDeletedParent = (await softDeleteParentRes.json()) as { is_active: number };
    expect(softDeletedParent.is_active).toBe(0);

    // Hard delete a leaf child (zero children) -> 200, then GET -> 404
    const hardDeleteChildRes = await SELF.fetch(
      `https://example.com/accounts/${childId}?hard=true`,
      { method: 'DELETE', headers: AUTH }
    );
    expect(hardDeleteChildRes.status).toBe(200);

    const getAfterHardDeleteRes = await SELF.fetch(`https://example.com/accounts/${childId}`, {
      headers: AUTH,
    });
    expect(getAfterHardDeleteRes.status).toBe(404);
  });

  it('DELETE /accounts/:id?hard=true with children returns 409', async () => {
    const parentRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Wallet', type: 'cash', balance: 100000 }),
    });
    const parent = (await parentRes.json()) as { id: string };

    await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Wallet Sub',
        type: 'cash',
        balance: 50000,
        parent_id: parent.id,
      }),
    });

    const hardDeleteRes = await SELF.fetch(`https://example.com/accounts/${parent.id}?hard=true`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(hardDeleteRes.status).toBe(409);
  });

  it('PUT /accounts/:id with parent_id set to itself returns 400', async () => {
    const res = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Emergency Fund', type: 'savings', balance: 0 }),
    });
    const row = (await res.json()) as { id: string };

    const selfParentRes = await SELF.fetch(`https://example.com/accounts/${row.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ parent_id: row.id }),
    });
    expect(selfParentRes.status).toBe(400);
  });

  it('PUT /accounts/:id re-parenting a row that has children returns 400', async () => {
    const parentRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Investments', type: 'investment', balance: 0 }),
    });
    const parent = (await parentRes.json()) as { id: string };

    await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Stocks',
        type: 'investment',
        balance: 0,
        parent_id: parent.id,
      }),
    });

    const otherParentRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Retirement', type: 'investment', balance: 0 }),
    });
    const otherParent = (await otherParentRes.json()) as { id: string };

    const reparentRes = await SELF.fetch(`https://example.com/accounts/${parent.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ parent_id: otherParent.id }),
    });
    expect(reparentRes.status).toBe(400);
  });

  it('POST /accounts with parent_id and mismatched type returns 400', async () => {
    const parentRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Brokerage', type: 'investment', balance: 0 }),
    });
    const parent = (await parentRes.json()) as { id: string };

    const childRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Mismatched Child',
        type: 'savings',
        balance: 0,
        parent_id: parent.id,
      }),
    });
    expect(childRes.status).toBe(400);
    const body = (await childRes.json()) as { error: string };
    expect(body.error).toBe('parent and child must have same type');
  });

  it('PUT /accounts/:id with mismatched type vs parent returns 400', async () => {
    const parentRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Daily Wallet', type: 'cash', balance: 0 }),
    });
    const parent = (await parentRes.json()) as { id: string };

    const childRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Petty Cash',
        type: 'cash',
        balance: 0,
        parent_id: parent.id,
      }),
    });
    const child = (await childRes.json()) as { id: string };

    // Changing the child's own type away from its parent's type -> 400
    const changeTypeRes = await SELF.fetch(`https://example.com/accounts/${child.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ type: 'savings' }),
    });
    expect(changeTypeRes.status).toBe(400);

    // Re-parenting to a parent of a different type -> 400
    const otherParentRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Savings Goal', type: 'savings', balance: 0 }),
    });
    const otherParent = (await otherParentRes.json()) as { id: string };

    const reparentRes = await SELF.fetch(`https://example.com/accounts/${child.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ parent_id: otherParent.id }),
    });
    expect(reparentRes.status).toBe(400);
  });

  it('PUT /accounts/:id balance increase creates an income transaction and monthly balance entry', async () => {
    const createRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'BCA', type: 'bank', balance: 0 }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; balance: number };
    expect(created.balance).toBe(0);

    const updateRes = await SELF.fetch(`https://example.com/accounts/${created.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ balance: 100000 }),
    });
    expect(updateRes.status).toBe(200);

    const updated = (await updateRes.json()) as { balance: number };
    expect(updated.balance).toBe(100000);

    const txRes = await SELF.fetch(`https://example.com/transactions?account_id=${created.id}`, {
      headers: AUTH,
    });
    expect(txRes.status).toBe(200);
    const transactions = (await txRes.json()) as Array<{
      category_id: string | null;
      amount: number;
      note: string | null;
      type: 'income' | 'expense' | 'transfer';
    }>;
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      type: 'income',
      category_id: 'cat-income-other',
      amount: 100000,
      note: 'Account balance adjustment',
    });

    const monthKey = new Date().toISOString().slice(0, 7);
    const balancesRes = await SELF.fetch('https://example.com/balances?limit=12', { headers: AUTH });
    expect(balancesRes.status).toBe(200);
    const rows = (await balancesRes.json()) as Array<{
      month_key: string;
      income: number;
      expense: number;
      balance: number;
    }>;
    expect(rows.find((row) => row.month_key === monthKey)).toMatchObject({
      month_key: monthKey,
      income: 100000,
      expense: 0,
      balance: 100000,
    });
  });

  it('PUT /accounts/:id balance decrease creates an expense transaction and updates monthly balance', async () => {
    const createRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Wallet', type: 'cash', balance: 150000 }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; balance: number };
    expect(created.balance).toBe(150000);

    const updateRes = await SELF.fetch(`https://example.com/accounts/${created.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ balance: 50000 }),
    });
    expect(updateRes.status).toBe(200);

    const updated = (await updateRes.json()) as { balance: number };
    expect(updated.balance).toBe(50000);

    const txRes = await SELF.fetch(`https://example.com/transactions?account_id=${created.id}`, {
      headers: AUTH,
    });
    expect(txRes.status).toBe(200);
    const transactions = (await txRes.json()) as Array<{
      category_id: string | null;
      amount: number;
      note: string | null;
      type: 'income' | 'expense' | 'transfer';
    }>;
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      type: 'expense',
      category_id: 'cat-other-misc',
      amount: 100000,
      note: 'Account balance adjustment',
    });

    const monthKey = new Date().toISOString().slice(0, 7);
    const balancesRes = await SELF.fetch('https://example.com/balances?limit=12', { headers: AUTH });
    expect(balancesRes.status).toBe(200);
    const rows = (await balancesRes.json()) as Array<{
      month_key: string;
      income: number;
      expense: number;
      balance: number;
    }>;
    expect(rows.find((row) => row.month_key === monthKey)).toMatchObject({
      month_key: monthKey,
      income: 0,
      expense: 100000,
      balance: -100000,
    });
  });

  it('reimbursement users see all accounts (read-only) but cannot manage accounts', async () => {
    const assignedRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Assigned Card',
        type: 'credit_card',
        balance: 0,
        credit_limit: 4000000,
        billing_date: 19,
      }),
    });
    const assigned = (await assignedRes.json()) as { id: string };

    const otherRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Other Card',
        type: 'credit_card',
        balance: 0,
        credit_limit: 4000000,
        billing_date: 21,
      }),
    });
    const other = (await otherRes.json()) as { id: string };

    await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        username: 'reimburse-accounts',
        email: 'reimburse-accounts@example.com',
        password: 'password1',
        role: 'reimbursement',
        assigned_account_ids: [assigned.id],
      }),
    });

    const token = await login('reimburse-accounts', 'password1');
    const userHeaders = { Authorization: `Bearer ${token}` };

    const listRes = await SELF.fetch('https://example.com/accounts', { headers: userHeaders });
    expect(listRes.status).toBe(200);
    const rows = (await listRes.json()) as Array<{ id: string }>;
    expect(rows.map((row) => row.id).sort()).toEqual([assigned.id, other.id].sort());

    const detailRes = await SELF.fetch(`https://example.com/accounts/${other.id}`, { headers: userHeaders });
    expect(detailRes.status).toBe(200);

    const postRes = await SELF.fetch('https://example.com/accounts', {
      method: 'POST',
      headers: { ...userHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Blocked Bank', type: 'bank', balance: 0 }),
    });
    expect(postRes.status).toBe(403);
  });
});
