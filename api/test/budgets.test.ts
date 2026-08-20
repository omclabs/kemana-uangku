import { SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetAndSeedTestAccounts, TEST_ACCOUNT_IDS } from './fixtures';

const AUTH = { Authorization: 'Bearer test-token' };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

async function postTransaction(body: Record<string, unknown>) {
  return SELF.fetch('https://example.com/transactions', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

describe('/budgets', () => {
  beforeEach(async () => {
    await resetAndSeedTestAccounts();
    await SELF.fetch('https://example.com/categories/cat-housing-utilities', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ budget_monthly: 0 }),
    });
  });

  it('GET /budgets returns template-backed monthly budgets with parent rollup totals', async () => {
    await SELF.fetch('https://example.com/categories/cat-food', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ budget_monthly: 100000 }),
    });
    await SELF.fetch('https://example.com/categories/cat-food-dining', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ budget_monthly: 25000 }),
    });

    const res = await SELF.fetch('https://example.com/budgets?month=2026-06', {
      headers: AUTH,
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      month_key: string;
      total_budget: number;
      items: Array<{
        category_id: string;
        own_amount: number;
        total_amount: number;
        is_saved: boolean;
      }>;
    };

    expect(body.month_key).toBe('2026-06');
    expect(body.total_budget).toBeGreaterThanOrEqual(125000);

    const parent = body.items.find((item) => item.category_id === 'cat-food');
    const child = body.items.find((item) => item.category_id === 'cat-food-dining');

    expect(parent).toMatchObject({
      category_id: 'cat-food',
      own_amount: 100000,
      total_amount: 125000,
      is_saved: false,
    });
    expect(child).toMatchObject({
      category_id: 'cat-food-dining',
      own_amount: 25000,
      total_amount: 25000,
      is_saved: false,
    });
  });

  it('PUT /budgets/:month saves month-specific values and rejects income categories', async () => {
    const badRes = await SELF.fetch('https://example.com/budgets/2026-07', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        items: [{ category_id: 'cat-income-salary', amount: 100000 }],
      }),
    });
    expect(badRes.status).toBe(400);

    const saveRes = await SELF.fetch('https://example.com/budgets/2026-07', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        items: [
          { category_id: 'cat-food', amount: 200000 },
          { category_id: 'cat-food-dining', amount: 50000 },
          { category_id: 'cat-housing', amount: 300000 },
        ],
      }),
    });
    expect(saveRes.status).toBe(200);

    const saved = (await saveRes.json()) as {
      total_budget: number;
      items: Array<{
        category_id: string;
        own_amount: number;
        total_amount: number;
        is_saved: boolean;
      }>;
    };

    const food = saved.items.find((item) => item.category_id === 'cat-food');
    const breakfast = saved.items.find((item) => item.category_id === 'cat-food-dining');
    const bills = saved.items.find((item) => item.category_id === 'cat-housing');

    expect(food).toMatchObject({
      category_id: 'cat-food',
      own_amount: 200000,
      total_amount: 250000,
      is_saved: true,
    });
    expect(breakfast).toMatchObject({
      category_id: 'cat-food-dining',
      own_amount: 50000,
      total_amount: 50000,
      is_saved: true,
    });
    expect(bills).toMatchObject({
      category_id: 'cat-housing',
      own_amount: 300000,
      total_amount: 300000,
      is_saved: true,
    });
    expect(saved.total_budget).toBeGreaterThanOrEqual(550000);
  });

  it('GET /budgets falls back to previous month actual spend when no budget is set', async () => {
    const juneDate = Math.floor(new Date('2026-06-15T00:00:00Z').getTime() / 1000);
    const txRes = await postTransaction({
      date: juneDate,
      account_id: TEST_ACCOUNT_IDS.bankPrimary,
      category_id: 'cat-housing-utilities',
      amount: 40000,
      type: 'expense',
    });
    expect(txRes.status).toBe(201);

    const res = await SELF.fetch('https://example.com/budgets?month=2026-07', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ category_id: string; is_saved: boolean; effective_amount: number }>;
    };
    const housing = body.items.find((item) => item.category_id === 'cat-housing-utilities');
    expect(housing).toMatchObject({ category_id: 'cat-housing-utilities', is_saved: false, effective_amount: 40000 });

    const saveRes = await SELF.fetch('https://example.com/budgets/2026-07', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ items: [{ category_id: 'cat-housing-utilities', amount: 300000 }] }),
    });
    const saved = (await saveRes.json()) as {
      items: Array<{ category_id: string; is_saved: boolean; effective_amount: number }>;
    };
    const savedHousing = saved.items.find((item) => item.category_id === 'cat-housing-utilities');
    expect(savedHousing).toMatchObject({ category_id: 'cat-housing-utilities', is_saved: true, effective_amount: 300000 });
  });

  it('year endpoints seed all 12 months on first save, then allow independent per-month edits', async () => {
    const before = await SELF.fetch('https://example.com/budgets/category/cat-housing-utilities/year/2026', { headers: AUTH });
    expect(before.status).toBe(200);
    const beforeBody = (await before.json()) as {
      months: Array<{ month_key: string; amount: number; is_saved: boolean }>;
    };
    expect(beforeBody.months).toHaveLength(12);
    expect(beforeBody.months.every((m) => m.is_saved === false)).toBe(true);

    const seedRes = await SELF.fetch('https://example.com/budgets/category/cat-housing-utilities/year/2026', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ amount: 500000 }),
    });
    expect(seedRes.status).toBe(200);
    const seeded = (await seedRes.json()) as {
      months: Array<{ month_key: string; amount: number; is_saved: boolean }>;
    };
    expect(seeded.months).toHaveLength(12);
    expect(seeded.months.every((m) => m.amount === 500000 && m.is_saved === true)).toBe(true);

    const overrideRes = await SELF.fetch('https://example.com/budgets/2026-08', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ items: [{ category_id: 'cat-housing-utilities', amount: 750000 }] }),
    });
    expect(overrideRes.status).toBe(200);

    const after = await SELF.fetch('https://example.com/budgets/category/cat-housing-utilities/year/2026', { headers: AUTH });
    const afterBody = (await after.json()) as {
      months: Array<{ month_key: string; amount: number; is_saved: boolean }>;
    };
    const august = afterBody.months.find((m) => m.month_key === '2026-08');
    const july = afterBody.months.find((m) => m.month_key === '2026-07');
    expect(august).toMatchObject({ month_key: '2026-08', amount: 750000, is_saved: true });
    expect(july).toMatchObject({ month_key: '2026-07', amount: 500000, is_saved: true });
  });
});
