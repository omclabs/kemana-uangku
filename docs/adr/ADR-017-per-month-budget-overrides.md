# ADR-017: Per-Month Budget Overrides (New `budgets` Table vs. `categories.budget_monthly`)

**Status:** Accepted
**Date:** 2026-06-17
**Version:** 1.0.0

> **Retroactive ADR.** Written from code inspection (commit `3ddd0d2`, migration `0009_budgets.sql`) after the fact. Directly extends [[ADR-003]], which specified `categories.budget_monthly` as a single per-category cap with no history.

## Context

[[ADR-003]] gave every category a single `budget_monthly REAL` value — one number, reused every month, with no way to budget more for December (holidays) than November without changing the "permanent" template value. A real monthly-budgeting workflow needs per-month amounts while still having a sensible default for months nobody has explicitly budgeted.

## Decision

### 1. New `budgets` table: month-specific override, not a replacement

`id, category_id REFERENCES categories(id), month_start (unix, month-1st UTC), month_key (YYYY-MM), amount REAL CHECK (amount >= 0)`, unique on `(category_id, month_start)` — at most one override row per category per month. `categories.budget_monthly` (ADR-003) is untouched and still exists as the **template/default**.

### 2. Resolution order: saved override, else template

`GET /budgets?month=YYYY-MM` (`api/src/routes/budgets.ts`) builds the month's view by, per active expense category (excluding system categories `cat-admin`/`cat-transfer`): use the `budgets` row for that `(category_id, month_start)` if one exists (`own_amount`, `is_saved: true`), else fall back to `categories.budget_monthly` (`is_saved: false`). This means an un-budgeted month is never "0" — it inherits the template, and the UI can distinguish "using the default" from "explicitly set this month" via `is_saved`.

### 3. Hierarchy totals computed at read time, same pattern as ADR-003 rejected for auto-aggregation

`total_amount` per parent category = its own `own_amount` + sum of its children's `own_amount` — computed in the route handler on every `GET`, never stored. This mirrors [[ADR-003]]'s explicit rejection of auto-aggregating `budget_monthly` server-side; the same "don't store a derived subtree total" reasoning applies here.

### 4. `PUT /budgets/:month` replaces the whole month's overrides atomically

Deletes all existing `budgets` rows for that `month_start`, then inserts the submitted set — not a per-category upsert. Simpler than diffing, at the cost of clearing an override the client's payload happens to omit (the frontend always submits every category it displayed, so this is safe in practice but is a footgun for any future API consumer that sends a partial set expecting a merge).

### 5. Reimbursement role has no budget access

`requireNonReimbursement(c)` gates both `GET` and `PUT /budgets` — budgeting is an admin/user planning tool, not something a scoped credit-card-only user needs or should see.

## Alternatives Considered

| Alternative | Why (likely) rejected |
|---|---|
| Add a `budgets_by_month` JSON column to `categories` | A relational table with a unique `(category_id, month_start)` constraint gets "one override per month" enforcement for free at the DB level; a JSON blob would need application-level uniqueness checks. |
| Replace `categories.budget_monthly` entirely, require every month to be explicitly budgeted | Would make a brand-new category (or a month nobody has visited yet) show a blank/zero budget instead of a sensible default — the fallback-to-template design (Decision §2) avoids that. |
| Per-category upsert on `PUT` instead of delete-and-reinsert-the-month | Simpler to reason about (whole month is always in a known state after the call) at the cost of requiring the client to always send the full set — acceptable since the one client (BudgetPage.tsx) always does. |

## Consequences

- A category's `budget_monthly` template can still be edited via the Category form ([[ADR-012]]... actually hidden from that UI per that ADR, so template edits currently require direct API/DB access) and immediately changes the *fallback* for any month without its own override — a subtle interaction worth knowing about when debugging "why did last month's budget change retroactively."
- `PUT /budgets/:month` from a partial client payload silently deletes the omitted categories' overrides for that month — fine for the current single frontend, a trap for any future API consumer.
- Budget totals are always computed fresh (no caching, unlike [[ADR-016]]'s balances) — acceptable since a month's category count is small and bounded, unlike transaction history.

## Follow-ups

- `categories.budget_monthly` is still hidden from the Category UI (ADR-012) — the only way to set the *template/fallback* default is direct API access; worth deciding whether that's intentional long-term or a gap once per-month budgeting is the primary workflow.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-17 | Retroactive documentation of the `budgets` table and its fallback-to-template resolution. |
