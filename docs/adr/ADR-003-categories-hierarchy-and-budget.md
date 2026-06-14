# ADR-003: Categories Table — Hierarchy & Budget Model

**Status:** Accepted
**Date:** 2026-06-14
**Version:** 1.0.0

## Context

Categories need a parent/child grouping (e.g. "Food" -> "Groceries",
"Eating Out") with an `income`/`expense` `type` and a `budget_monthly` cap.
Two questions must be settled: (1) can a child's `type` differ from its
parent's, and (2) does a parent's `budget_monthly` aggregate its children's.

## Decision

- **Hierarchy depth ≤ 1**, enforced in the Worker: a category may only set
  `parent_id` to a row whose own `parent_id IS NULL`.
- **`type` consistency:** a child's `type` MUST equal its parent's `type`.
  Enforced on create and update (SQLite has no cross-row CHECK).
- **`type` immutability:** once a category has any children, its `type`
  cannot be changed (PUT returns 400). Childless categories can change type
  freely.
- **`budget_monthly` is independent per row, not auto-aggregated.** A
  parent's budget is its own cap; it does NOT automatically sum children's
  budgets. Any "subtree total" reporting is a read-time computation in a
  future reporting layer, never stored.
- **`budget_monthly` is `REAL`** (see ADR-001) — allows fractional budget
  amounts if ever needed; round to nearest Rupiah for display.
- **Delete = soft delete by default** (`is_active=0`). `DELETE` returns 409
  if the category has any `is_active=1` children. `?hard=true` hard-deletes
  only if the category has **zero** children (active or inactive).

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Allow mixed `type` within a tree | Breaks every report that groups by `type` — an "income" rollup could silently include an expense leaf. |
| Auto-aggregate `budget_monthly` from children (mirroring accounts' `computed_balance`) | Ambiguous semantics: is the parent's own value then a *cap* on the sum, or replaced by the sum? Avoided by keeping each row's budget independent and explicit. |
| Hard delete only | A future `transactions` table will reference `category_id`; hard-deleting a category with history orphans rows. Soft delete preserves referential integrity. |

## Consequences

- Reports that need "Food + all its children spent vs budgeted" compute the
  sum at query time from each row's own `budget_monthly` — no stored
  aggregate to keep in sync.
- A category can be deactivated (hidden from new-transaction pickers) without
  breaking historical references.
- Changing a leaf category's `type` is safe; changing a parent's `type`
  requires first reassigning/removing its children.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-14 | Initial decision |