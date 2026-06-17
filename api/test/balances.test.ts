import { SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetAndSeedTestAccounts, TEST_ACCOUNT_IDS } from './fixtures';

const AUTH = { Authorization: 'Bearer test-token' };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

const JAN_2026 = Math.floor(new Date('2026-01-15T00:00:00Z').getTime() / 1000);
const FEB_2026 = Math.floor(new Date('2026-02-15T00:00:00Z').getTime() / 1000);
const MAR_2026 = Math.floor(new Date('2026-03-15T00:00:00Z').getTime() / 1000);
const APR_2026 = Math.floor(new Date('2026-04-15T00:00:00Z').getTime() / 1000);

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
});
