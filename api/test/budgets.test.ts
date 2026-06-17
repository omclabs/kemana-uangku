import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const AUTH = { Authorization: 'Bearer test-token' };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

describe('/budgets', () => {
  it('GET /budgets returns template-backed monthly budgets with parent rollup totals', async () => {
    await SELF.fetch('https://example.com/categories/cat-food', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ budget_monthly: 100000 }),
    });
    await SELF.fetch('https://example.com/categories/cat-food-breakfast', {
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
    const child = body.items.find((item) => item.category_id === 'cat-food-breakfast');

    expect(parent).toMatchObject({
      category_id: 'cat-food',
      own_amount: 100000,
      total_amount: 125000,
      is_saved: false,
    });
    expect(child).toMatchObject({
      category_id: 'cat-food-breakfast',
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
        items: [{ category_id: 'cat-inc-salary', amount: 100000 }],
      }),
    });
    expect(badRes.status).toBe(400);

    const saveRes = await SELF.fetch('https://example.com/budgets/2026-07', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        items: [
          { category_id: 'cat-food', amount: 200000 },
          { category_id: 'cat-food-breakfast', amount: 50000 },
          { category_id: 'cat-bills', amount: 300000 },
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
    const breakfast = saved.items.find((item) => item.category_id === 'cat-food-breakfast');
    const bills = saved.items.find((item) => item.category_id === 'cat-bills');

    expect(food).toMatchObject({
      category_id: 'cat-food',
      own_amount: 200000,
      total_amount: 250000,
      is_saved: true,
    });
    expect(breakfast).toMatchObject({
      category_id: 'cat-food-breakfast',
      own_amount: 50000,
      total_amount: 50000,
      is_saved: true,
    });
    expect(bills).toMatchObject({
      category_id: 'cat-bills',
      own_amount: 300000,
      total_amount: 300000,
      is_saved: true,
    });
    expect(saved.total_budget).toBeGreaterThanOrEqual(550000);
  });
});
