# ADR-004: Accounts Table — Hierarchy, Balance Sign Convention & Conditional Fields

**Status:** Accepted
**Date:** 2026-06-14
**Version:** 1.0.0

## Context

`accounts` covers 8 types (`bank`, `cash`, `autodebet`, `credit_card`,
`prepaid`, `savings`, `investment`, `loan`) spanning assets and liabilities,
with a parent/child grouping (e.g. "Bank BCA" -> "BCA 1", "BCA 2"), and two
CC/loan-specific fields (`credit_limit`, `billing_date`). This mirrors
ExpenseTracker's `ADR-009-account-hierarchy.md`, which this ADR ports and
extends for D1.

## Decision

- **Hierarchy depth ≤ 1**, same rule as categories: `parent_id` may only
  reference a row whose own `parent_id IS NULL`.
- **`computed_balance` (response-only, never stored)**, ported from
  ExpenseTracker ADR-009:
  - Top-level row (`parent_id IS NULL`):
    `computed_balance = balance + SUM(child.balance WHERE child.is_active=1 AND child.include_in_total=1)`
  - Child row: `computed_balance == balance`.
- **Signed balance / liability convention** (from ADR-001): `balance` and
  `credit_limit` are `REAL`; `credit_card` and `loan` accounts store `balance`
  as a **negative** value (amount owed). Net worth =
  `SUM(balance) WHERE is_active=1 AND include_in_total=1` across top-level
  accounts — no per-type branching.
- **`include_in_total` and `is_active` are orthogonal.** Example: an active
  `loan` can have `include_in_total=0` if the user doesn't want it in net
  worth, while still being usable for transactions.
- **Conditional fields:** `credit_limit` and `billing_date` are non-null
  **if and only if** `type = 'credit_card'`. Worker rejects (400) non-null
  values for any other type. `billing_date` is constrained to **1–28** via DB
  `CHECK`, so no end-of-month clamping logic is ever needed.
- **`type` immutability:** once an account has any children, its `type`
  cannot change (PUT returns 400).
- **Delete = soft delete by default** (`is_active=0`). `DELETE` returns 409
  if the account has any `is_active=1` children. `?hard=true` hard-deletes
  only if the account has **zero** children.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Magnitude-only balance, sign derived from `type` in queries | Every net-worth/report query needs `CASE WHEN type IN ('credit_card','loan') THEN -balance ...`; signed storage removes this branching entirely (see ADR-001). |
| `billing_date` as `1..31` with end-of-month clamping | Adds date-math edge cases (Feb 30 -> 28/29) for no real benefit; `1..28` is valid in every month. |
| Separate "AccountGroup" entity for hierarchy | Extra table/endpoints for no added value over a self-referencing `parent_id` (rejected in old ADR-009 for the same reason). |
| Recursive (>1 level) hierarchy | Not needed; adds tree-walk complexity with no current use case. |

## Consequences

- Net worth and per-account "available" figures are computed with plain
  `SUM()`/arithmetic — no type-conditional logic in queries.
- A future UI must label negative `credit_card`/`loan` balances as "owed"
  (e.g. `abs(balance)`) rather than showing a raw negative number to the user.
- `credit_limit`/`billing_date` validation lives entirely in the Worker (zod
  + a manual check), since SQLite CHECK constraints can't express
  "non-null iff type = X" across columns.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-14 | Initial decision |