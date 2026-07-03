import { env } from 'cloudflare:test';

export const TEST_ACCOUNT_IDS = {
  bankPrimary: 'acc-bank-bca',
  bankSecondary: 'acc-bank-cimb',
  cash: 'acc-cash',
  creditCard: 'acc-cc-cimb',
} as const;

export async function resetFinanceData() {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM budgets'),
    env.DB.prepare('DELETE FROM monthly_balances'),
    env.DB.prepare('DELETE FROM tracked_item_refills'),
    env.DB.prepare('DELETE FROM tracked_items'),
    env.DB.prepare('DELETE FROM transactions'),
    env.DB.prepare('DELETE FROM accounts WHERE parent_id IS NOT NULL'),
    env.DB.prepare('DELETE FROM accounts WHERE parent_id IS NULL'),
  ]);
}

export async function seedTestAccounts() {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO accounts
        (id, name, type, balance, include_in_total, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(TEST_ACCOUNT_IDS.bankPrimary, 'Primary Bank', 'bank', 0, 1, 'user-admin', 'user-admin'),
    env.DB.prepare(
      `INSERT OR IGNORE INTO accounts
        (id, name, type, balance, include_in_total, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(TEST_ACCOUNT_IDS.bankSecondary, 'Secondary Bank', 'bank', 0, 1, 'user-admin', 'user-admin'),
    env.DB.prepare(
      `INSERT OR IGNORE INTO accounts
        (id, name, type, balance, include_in_total, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(TEST_ACCOUNT_IDS.cash, 'Cash Wallet', 'cash', 0, 1, 'user-admin', 'user-admin'),
    env.DB.prepare(
      `INSERT OR IGNORE INTO accounts
        (id, name, type, balance, credit_limit, billing_date, include_in_total, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(TEST_ACCOUNT_IDS.creditCard, 'Primary Credit Card', 'credit_card', 0, 10000000, 19, 1, 'user-admin', 'user-admin'),
  ]);
}

export async function resetAndSeedTestAccounts() {
  await resetFinanceData();
  await seedTestAccounts();
}
