# ADR-001: Technology Stack & Cross-Cutting Conventions

**Status:** Accepted
**Date:** 2026-06-14
**Version:** 1.0.0

## Context

kemana-uangku is a ground-up rewrite of personal expense tracking (spiritual
successor to ExpenseTracker's Sheets/GAS setup, but a separate codebase, not a
migration). API + DB run on Cloudflare Workers + D1. Several cross-cutting
choices (framework, ID format, timestamp format, auth, money sign convention)
affect every table and must be fixed before writing schema or route code.

## Decision

- **Framework:** Hono (TypeScript) on Cloudflare Workers.
- **Database:** D1 (SQLite), schema managed via `wrangler d1 migrations`.
- **IDs:** `TEXT` UUID v4, generated in the Worker via `crypto.randomUUID()`
  before INSERT.
- **Timestamps:** `INTEGER` unix epoch **seconds**, via SQL column default
  `(unixepoch())`. Display timezone comes from `config.default_timezone`.
- **Auth:** single shared-secret bearer token (`Authorization: Bearer <API_TOKEN>`),
  checked by Hono middleware on every route including GET (single-user app,
  no public reads).
- **Money:** all monetary columns (`accounts.balance`, `accounts.credit_limit`,
  `categories.budget_monthly`) are `REAL` (IEEE-754 double) in IDR (no per-row
  currency column — IDR-only per `config.currency`). Liability-type accounts
  (`credit_card`, `loan`) store a **negative** balance representing debt owed.

## Decision Drivers

- Old project's hand-rolled vanilla `fetch` router + `lib/response.js` does
  not scale cleanly to 3 tables x 5 endpoints each.
- Single-user app: AUTOINCREMENT contention is a non-issue, but UUIDs let the
  API return the new row's `id` without a `RETURNING` round trip and avoid
  leaking row counts.
- Epoch-seconds avoids ISO8601 parsing/format drift across the API and any
  future frontend.
- A signed balance convention means net worth is a single `SUM(balance)` with
  no `CASE WHEN type IN (...)` branching — liabilities are already negative.
- `REAL` over `INTEGER` for money: keeps the door open for fractional units
  (investment shares, future foreign-currency sub-amounts) without a later
  column-type migration; D1's `REAL` is an IEEE-754 double, with 53-bit
  mantissa precision — far beyond any personal-finance magnitude.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Vanilla Workers `fetch` switch (old project's pattern) | Routing/middleware boilerplate grows linearly with endpoint count; Hono is near-zero overhead on Workers. |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | Acceptable for single-user, but UUID avoids a `RETURNING`/refetch step and keeps IDs opaque. |
| ISO8601 `TEXT` timestamps | More human-readable, but invites format/timezone drift; epoch-seconds is unambiguous. |
| Magnitude-only balance + type-based sign in queries | Every net-worth/report query needs `CASE WHEN type IN ('credit_card','loan') THEN -balance ELSE balance END`; signed storage removes this entirely. |
| `INTEGER` (whole-Rupiah) amounts | Less flexible for fractional units (investment shares, future sub-currency); `REAL` precision is more than sufficient at personal-finance scale, and rounding at display/aggregation neutralizes float drift. |

## Consequences

**Positive:**
- Consistent ID/timestamp handling across all current and future tables.
- Net-worth and `computed_balance` queries are plain `SUM()`.
- Middleware-based auth is a one-line swap if multi-user auth is added later.

**Negative:**
- UUIDs are less human-debuggable than sequential integers (acceptable for a
  personal-scale dataset; can be mitigated with a `short_id` display column
  later if needed).
- Negative balances for liability accounts must be surfaced correctly in any
  future UI (e.g. display `abs(balance)` with an "owed" label for
  `credit_card`/`loan`).
- `REAL` storage means sums (`computed_balance`, net worth, budget totals) can
  accumulate tiny floating-point error. Mitigation: round to the nearest
  Rupiah (or agreed sub-unit) at response/report time, and never compare
  monetary `REAL` values with exact `=` — use a small epsilon (e.g. `< 0.005`).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-14 | Initial decision |