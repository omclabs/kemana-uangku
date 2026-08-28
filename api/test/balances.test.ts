import { SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetAndSeedTestAccounts, TEST_ACCOUNT_IDS } from './fixtures';

const AUTH = { Authorization: 'Bearer test-token' };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

const JAN_2026 = Math.floor(new Date('2026-01-15T00:00:00Z').getTime() / 1000);
const FEB_2026 = Math.floor(new Date('2026-02-15T00:00:00Z').getTime() / 1000);
const MAR_2026 = Math.floor(new Date('2026-03-15T00:00:00Z').getTime() / 1000);
const APR_2026 = Math.floor(new Date('2026-04-15T00:00:00Z').getTime() / 1000);

async function login(username: string, password: string): Promise<string> {
  const res = await SELF.fetch('https://example.com/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = (await res.json()) as { token: string };
  return body.token;
}

async function postTransaction(body: Record<string, unknown>) {
  return SELF.fetch('https://example.com/transactions', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

describe('/balances', () => {
  beforeEach(async () => {
    await resetAndSeedTestAccounts();
  });

  it('stores monthly income, expense, and running balance summaries', async () => {
    await postTransaction({
      date: JAN_2026,
      account_id: TEST_ACCOUNT_IDS.bankPrimary,
      category_id: 'cat-income-salary',
      amount: 1000000,
      type: 'income',
    });

    await postTransaction({
      date: JAN_2026,
      account_id: TEST_ACCOUNT_IDS.bankPrimary,
      category_id: 'cat-food-dining',
      amount: 250000,
      type: 'expense',
    });

    await postTransaction({
      date: FEB_2026,
      account_id: TEST_ACCOUNT_IDS.bankPrimary,
      category_id: 'cat-income-bonus',
      amount: 500000,
      type: 'income',
    });

    await postTransaction({
      date: FEB_2026,
      account_id: TEST_ACCOUNT_IDS.bankPrimary,
      transfer_to: TEST_ACCOUNT_IDS.bankSecondary,
      amount: 150000,
      type: 'transfer',
    });

    const res = await SELF.fetch('https://example.com/balances?limit=12', { headers: AUTH });
    expect(res.status).toBe(200);

    const rows = (await res.json()) as Array<{
      month_key: string;
      income: number;
      expense: number;
      balance: number;
    }>;

    const february = rows.find((row) => row.month_key === '2026-02');
    const january = rows.find((row) => row.month_key === '2026-01');

    expect(january).toMatchObject({
      month_key: '2026-01',
      income: 1000000,
      expense: 250000,
      balance: 750000,
    });

    expect(february).toMatchObject({
      month_key: '2026-02',
      income: 500000,
      expense: 0,
      balance: 1250000,
    });
  });

  it('rebuilds later months when an older transaction changes', async () => {
    const createRes = await postTransaction({
      date: MAR_2026,
      account_id: TEST_ACCOUNT_IDS.bankPrimary,
      category_id: 'cat-food-dining',
      amount: 100000,
      type: 'expense',
    });
    const [created] = (await createRes.json()) as Array<{ id: string }>;

    await postTransaction({
      date: APR_2026,
      account_id: TEST_ACCOUNT_IDS.bankPrimary,
      category_id: 'cat-income-bonus',
      amount: 200000,
      type: 'income',
    });

    await SELF.fetch(`https://example.com/transactions/${created.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ amount: 400000 }),
    });

    const res = await SELF.fetch('https://example.com/balances?limit=12', { headers: AUTH });
    const rows = (await res.json()) as Array<{
      month_key: string;
      income: number;
      expense: number;
      balance: number;
    }>;

    expect(rows.find((row) => row.month_key === '2026-03')).toMatchObject({
      month_key: '2026-03',
      income: 0,
      expense: 400000,
      balance: -400000,
    });
    expect(rows.find((row) => row.month_key === '2026-04')).toMatchObject({
      month_key: '2026-04',
      income: 200000,
      expense: 0,
      balance: -200000,
    });
  });

  it('excludes a transfer into an unflagged credit_card account from expense totals', async () => {
    await postTransaction({
      date: JAN_2026,
      account_id: TEST_ACCOUNT_IDS.bankPrimary,
      transfer_to: TEST_ACCOUNT_IDS.creditCard,
      amount: 300000,
      type: 'transfer',
    });

    const res = await SELF.fetch('https://example.com/balances?limit=12', { headers: AUTH });
    const rows = (await res.json()) as Array<{
      month_key: string;
      income: number;
      expense: number;
      balance: number;
    }>;

    expect(rows.find((row) => row.month_key === '2026-01')).toMatchObject({
      month_key: '2026-01',
      income: 0,
      expense: 0,
      balance: 0,
    });
  });

  it('counts a transfer into a count_transfer_as_expense-flagged account as an expense', async () => {
    const putRes = await SELF.fetch(`https://example.com/accounts/${TEST_ACCOUNT_IDS.creditCard}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ count_transfer_as_expense: true }),
    });
    expect(putRes.status).toBe(200);

    await postTransaction({
      date: JAN_2026,
      account_id: TEST_ACCOUNT_IDS.bankPrimary,
      transfer_to: TEST_ACCOUNT_IDS.creditCard,
      amount: 300000,
      type: 'transfer',
    });

    const res = await SELF.fetch('https://example.com/balances?limit=12', { headers: AUTH });
    const rows = (await res.json()) as Array<{
      month_key: string;
      income: number;
      expense: number;
      balance: number;
    }>;

    expect(rows.find((row) => row.month_key === '2026-01')).toMatchObject({
      month_key: '2026-01',
      income: 0,
      expense: 300000,
      balance: -300000,
    });
  });

  it('reimbursement balances show all accounts (read-only)', async () => {
    await postTransaction({
      date: JAN_2026,
      account_id: TEST_ACCOUNT_IDS.creditCard,
      category_id: 'cat-food-dining',
      amount: 120000,
      type: 'expense',
    });

    await postTransaction({
      date: JAN_2026,
      account_id: TEST_ACCOUNT_IDS.bankPrimary,
      category_id: 'cat-income-salary',
      amount: 900000,
      type: 'income',
    });

    await SELF.fetch('https://example.com/users', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        username: 'reimburse-balances',
        email: 'reimburse-balances@example.com',
        password: 'password1',
        role: 'reimbursement',
        assigned_account_ids: [TEST_ACCOUNT_IDS.creditCard],
      }),
    });

    const token = await login('reimburse-balances', 'password1');
    const res = await SELF.fetch('https://example.com/balances?limit=12', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const rows = (await res.json()) as Array<{
      month_key: string;
      income: number;
      expense: number;
      balance: number;
    }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      month_key: '2026-01',
      income: 900000,
      expense: 120000,
      balance: 780000,
      month_start: Math.floor(Date.UTC(2026, 0, 1) / 1000),
    });
  });
});
