# ADR-016: Monthly Balances — Denormalized Cache Table

**Status:** Accepted
**Date:** 2026-06-17
**Version:** 1.0.0

> **Retroactive ADR.** Written from code inspection (commit `3ddd0d2`, migration `0008_monthly_balances.sql`) after the fact.

## Context

A "Dashboard/summary" view (per-month income, expense, and running net balance over time) needs to aggregate potentially years of `transactions` rows. Computing `SUM(amount) WHERE type='income'/'expense' GROUP BY month` plus a running total on every dashboard load doesn't scale as transaction history grows, and [[ADR-018]]'s reimbursement role needs a *different, scoped* version of the same shape (only their assigned accounts' transactions).

## Decision

### 1. `monthly_balances` table, one row per calendar month

`month_start INTEGER PRIMARY KEY` (unix timestamp, UTC month-1st-00:00), `month_key TEXT UNIQUE` (`YYYY-MM`, for human-readable lookups), `income`, `expense` (that month's sums, transfers excluded), `balance` (**cumulative** — running `SUM(income - expense)` from the first tracked month through this one, not a per-month delta).

### 2. Rebuilt incrementally from a "from" point, not fully recomputed every time

`rebuildMonthlyBalancesFrom(db, fromUnixSeconds, actorId)` (`api/src/lib/month-balance.ts`):
- finds the opening balance from the last month *before* `fromUnixSeconds`
- deletes every `monthly_balances` row `>= fromMonthStart`
- re-aggregates transactions from that month forward and re-inserts with a recomputed running balance

Called after every transaction create/update/delete, seeded with that transaction's month — so only the affected month onward is ever recomputed, not the entire history.

### 3. Two read paths, split by role

`GET /balances` (`api/src/routes/balances.ts`):
- **admin/user:** reads directly from `monthly_balances` (the cache), filtered by `from`/`to`/`limit` (default 24 months) — cheap, indexed lookup.
- **reimbursement:** bypasses the cache entirely — queries `transactions` directly filtered to `listAccessibleAccountIds()`, aggregates by `strftime('%Y-%m', date)` in the query, computes the running balance in application code after fetch.

The cache table is *not* scoped per-user/per-account, so it can't answer "balance across only these 2 accounts" — the reimbursement path exists specifically because the cache can't serve it.

## Alternatives Considered

| Alternative | Why (likely) rejected |
|---|---|
| Compute every dashboard load from `transactions` directly, no cache | Fine at current scale but degrades linearly with transaction history; the cache trades a small amount of write-side bookkeeping for O(months-requested) reads. |
| Full recompute of `monthly_balances` on every transaction change | Correct but wasteful — `rebuildMonthlyBalancesFrom` only touches months from the changed transaction's month onward, since only the running balance from that point can have shifted. |
| Give the cache table an `account_id`/`user_id` dimension so reimbursement could use it too | Would require rebuilding on every account/user's slice on every transaction write (multiplicative cost); the direct-query fallback for the one role that needs scoped balances is simpler than generalizing the cache. |

## Consequences

- Any code path that writes/deletes a `transactions` row **must** call `rebuildMonthlyBalancesFrom()` afterward, or the cache silently drifts from reality — this is easy to forget when adding a new transaction-mutating endpoint (e.g. [[ADR-017]]'s payment flow explicitly calls it).
- Reimbursement users' balance numbers are computed live (no cache), so they're always correct but potentially slower — acceptable since that's a small, scoped dataset (their assigned cards only).
- `monthly_balances` has no soft-delete semantics of its own (rows are just deleted/reinserted by the rebuild) — it's pure cache, not a source of truth; the source of truth is always `transactions`.

## Follow-ups

- No test coverage found specifically for `rebuildMonthlyBalancesFrom`'s "delete from X onward, recompute" boundary logic (off-by-one month risk) — worth adding given it's load-bearing for every transaction mutation.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-17 | Retroactive documentation of the monthly balances cache and its incremental rebuild strategy. |
