import { SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetAndSeedTestAccounts, TEST_ACCOUNT_IDS } from './fixtures';

const AUTH = { Authorization: 'Bearer test-token' };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

const BASE_DATE = Math.floor(new Date('2026-01-15T00:00:00Z').getTime() / 1000);
const DAY = 86_400;
const CATEGORY_IDS = {
  expenseUtilities: 'cat-housing-utilities',
  expenseHomeSupplies: 'cat-household-supplies',
  expenseLeaf: 'cat-food-dining',
  incomeSalary: 'cat-income-salary',
} as const;

describe('/tracked-items', () => {
  beforeEach(async () => {
    await resetAndSeedTestAccounts();
  });

  it('POST /tracked-items creates a tracked item for an expense leaf category', async () => {
    const res = await SELF.fetch('https://example.com/tracked-items', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Electricity',
        category_id: CATEGORY_IDS.expenseUtilities,
        unit: 'kWh',
        warning_days: 3,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { name: string; category_id: string; unit: string; forecast_ready: number };
    expect(body.name).toBe('Electricity');
    expect(body.category_id).toBe(CATEGORY_IDS.expenseUtilities);
    expect(body.unit).toBe('kWh');
    expect(body.forecast_ready).toBe(0);
  });

  it('POST /tracked-items rejects income categories', async () => {
    const res = await SELF.fetch('https://example.com/tracked-items', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Bad item',
        category_id: CATEGORY_IDS.incomeSalary,
        unit: 'pcs',
        warning_days: 3,
      }),
    });

    expect(res.status).toBe(400);
  });

  it('GET /tracked-items/alerts returns forecasted items inside the reminder window', async () => {
    const trackedRes = await SELF.fetch('https://example.com/tracked-items', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Electricity',
        category_id: CATEGORY_IDS.expenseUtilities,
        unit: 'kWh',
        warning_days: 3,
      }),
    });
    const trackedItem = await trackedRes.json() as { id: string };

    const firstTx = await SELF.fetch('https://example.com/transactions', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        date: BASE_DATE - DAY * 3,
        account_id: TEST_ACCOUNT_IDS.bankPrimary,
        category_id: CATEGORY_IDS.expenseUtilities,
        amount: 50000,
        type: 'expense',
        tracked_item_id: trackedItem.id,
        refill_quantity: 15,
      }),
    });
    expect(firstTx.status).toBe(201);

    const secondTx = await SELF.fetch('https://example.com/transactions', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        date: BASE_DATE,
        account_id: TEST_ACCOUNT_IDS.bankPrimary,
        category_id: CATEGORY_IDS.expenseUtilities,
        amount: 50000,
        type: 'expense',
        tracked_item_id: trackedItem.id,
        refill_quantity: 1,
      }),
    });
    expect(secondTx.status).toBe(201);

    const alertsRes = await SELF.fetch('https://example.com/tracked-items/alerts', { headers: AUTH });
    expect(alertsRes.status).toBe(200);
    const alerts = await alertsRes.json() as Array<{ id: string; alert_active: boolean; forecast_ready: number }>;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe(trackedItem.id);
    expect(alerts[0].forecast_ready).toBe(1);
    expect(alerts[0].alert_active).toBe(true);
  });

  it('improved model uses remaining_qty_before_refill when available', async () => {
    const nowUnix = Math.floor(Date.now() / 1000);

    const trackedRes = await SELF.fetch('https://example.com/tracked-items', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: 'Soap',
        category_id: CATEGORY_IDS.expenseHomeSupplies,
        unit: 'bottle',
        warning_days: 2,
      }),
    });
    const trackedItem = await trackedRes.json() as { id: string };

    const firstTx = await SELF.fetch('https://example.com/transactions', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        date: nowUnix - DAY * 14,
        account_id: TEST_ACCOUNT_IDS.bankPrimary,
        category_id: CATEGORY_IDS.expenseHomeSupplies,
        amount: 20000,
        type: 'expense',
        tracked_item_id: trackedItem.id,
        refill_quantity: 2,
      }),
    });
    expect(firstTx.status).toBe(201);

    const secondTx = await SELF.fetch('https://example.com/transactions', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        date: nowUnix,
        account_id: TEST_ACCOUNT_IDS.bankPrimary,
        category_id: CATEGORY_IDS.expenseHomeSupplies,
        amount: 20000,
        type: 'expense',
        tracked_item_id: trackedItem.id,
        refill_quantity: 2,
        remaining_qty_before_refill: 0.5,
      }),
    });
    expect(secondTx.status).toBe(201);

    const itemRes = await SELF.fetch(`https://example.com/tracked-items/${trackedItem.id}`, { headers: AUTH });
    const item = await itemRes.json() as { avg_daily_usage: number; forecast_ready: number };
    expect(item.forecast_ready).toBe(1);
    expect(item.avg_daily_usage).toBeCloseTo(1.5 / 14, 5);
  });
});
