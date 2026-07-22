import { describe, expect, it } from 'vitest';
import { reorderDump, splitStatements } from '../src/reorder';

// Table -> tables it references (mirrors api/migrations/*.sql), used to
// assert the FK graph documented for kemana-uangku-db's 11 tables:
//   config/categories/accounts -> users -> transactions ->
//   sessions/monthly_balances/budgets -> user_account_access ->
//   tracked_items -> tracked_item_refills
const EXPECTED_REFS: Record<string, string[]> = {
  config: ['users'],
  categories: ['users'], // parent_id self-reference is excluded by design
  accounts: ['users'], // parent_id self-reference is excluded by design
  users: [],
  transactions: ['accounts', 'categories', 'users'],
  sessions: ['users'],
  monthly_balances: ['users'],
  budgets: ['categories', 'users'],
  user_account_access: ['users', 'accounts'],
  tracked_items: ['categories', 'users'],
  tracked_item_refills: ['tracked_items', 'transactions', 'users'],
};

// Deliberately scrambled order (not FK-safe) simulating the D1/sqlite_master
// creation-order quirk this reordering exists to fix: several tables here
// are recreated-in-place by later migrations (transactions, sessions, users)
// so their position in a real dump does not reflect dependency order.
const SCRAMBLED_CREATE_TABLES: Record<string, string> = {
  sessions: `CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  )`,
  tracked_item_refills: `CREATE TABLE tracked_item_refills (
    id TEXT PRIMARY KEY,
    tracked_item_id TEXT NOT NULL REFERENCES tracked_items(id) ON DELETE CASCADE,
    transaction_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
  )`,
  budgets: `CREATE TABLE budgets (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
  )`,
  transactions: `CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
    parent_transaction_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
  )`,
  tracked_items: `CREATE TABLE tracked_items (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
  )`,
  user_account_access: `CREATE TABLE user_account_access (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
  )`,
  monthly_balances: `CREATE TABLE monthly_balances (
    month_key TEXT PRIMARY KEY,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
  )`,
  accounts: `CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
  )`,
  categories: `CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
  )`,
  config: `CREATE TABLE config (
    id INTEGER PRIMARY KEY,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
  )`,
  users: `CREATE TABLE users (
    id TEXT PRIMARY KEY,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL
  )`,
};

function buildScrambledDump(): string {
  // Iteration order of SCRAMBLED_CREATE_TABLES intentionally violates the FK
  // graph above (e.g. sessions, which depends on users, is listed first).
  const creates = Object.values(SCRAMBLED_CREATE_TABLES).join(';\n') + ';\n';
  const others = [
    `INSERT INTO users (id) VALUES ('u1')`,
    `INSERT INTO categories (id) VALUES ('c1')`,
  ]
    .map((s) => s + ';\n')
    .join('');
  return creates + others;
}

// Reads CREATE TABLE table names directly off the output text (rather than
// re-running splitStatements on it) since reorderDump re-terminates each
// already-`;`-terminated statement with another `;`, which is harmless for
// SQLite execution but would otherwise show up as spurious empty statements
// if the output were re-split for inspection here.
function extractTableOrder(output: string): string[] {
  const createTableRe = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?(\w+)"?/gi;
  return [...output.matchAll(createTableRe)].map((m) => m[1]);
}

describe('reorderDump', () => {
  it('orders every CREATE TABLE statement so tables it references appear first', () => {
    const output = reorderDump(buildScrambledDump());
    const order = extractTableOrder(output);

    expect(order).toHaveLength(Object.keys(SCRAMBLED_CREATE_TABLES).length);
    expect(new Set(order)).toEqual(new Set(Object.keys(SCRAMBLED_CREATE_TABLES)));

    for (const [table, refs] of Object.entries(EXPECTED_REFS)) {
      const tableIndex = order.indexOf(table);
      for (const ref of refs) {
        const refIndex = order.indexOf(ref);
        expect(refIndex, `${table} should come after ${ref}`).toBeLessThan(tableIndex);
      }
    }
  });

  it('preserves non-CREATE-TABLE statements, in original relative order, after all CREATE TABLE statements', () => {
    const output = reorderDump(buildScrambledDump());

    const lastCreateTableEnd = [...output.matchAll(/CREATE TABLE[^;]*;/gi)].at(-1)!.index!;
    const usersInsertStart = output.indexOf(`INSERT INTO users`);
    const categoriesInsertStart = output.indexOf(`INSERT INTO categories`);

    expect(usersInsertStart).toBeGreaterThan(lastCreateTableEnd);
    expect(categoriesInsertStart).toBeGreaterThan(usersInsertStart);
  });

  it('does not treat a self-referencing FK (e.g. parent_id) as an unresolved dependency', () => {
    const sql = `CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES categories(id)
    );`;
    const output = reorderDump(sql);
    expect(extractTableOrder(output)).toEqual(['categories']);
  });
});

describe('splitStatements', () => {
  it('does not split on a semicolon inside a single-quoted string literal', () => {
    const sql = `INSERT INTO notes (body) VALUES ('a; b'); INSERT INTO notes (body) VALUES ('c');`;
    const statements = splitStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toBe(`INSERT INTO notes (body) VALUES ('a; b');`);
  });

  it('handles an escaped quote (two single quotes) inside a string literal without ending the string early', () => {
    const sql = `INSERT INTO notes (body) VALUES ('it''s fine; really');`;
    const statements = splitStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toBe(`INSERT INTO notes (body) VALUES ('it''s fine; really');`);
  });

  it('does not split on a semicolon inside parentheses', () => {
    const sql = `CREATE TABLE t (id TEXT, CHECK (id IN ('a;b', 'c')));`;
    const statements = splitStatements(sql);
    expect(statements).toHaveLength(1);
  });
});
