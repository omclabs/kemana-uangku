# ADR-020: Tracked Items — Consumable Refill Forecasting & Alerts

**Status:** Accepted
**Date:** 2026-07-04
**Version:** 1.0.0

> **Retroactive ADR.** Written from code inspection (commit `8a07d86`, "Add tracked items and clean up UI flows", migration `0012_tracked_items.sql`) after the fact. No prior ADR covered this feature.

## Context

Some recurring expenses aren't just "a bill" — they're a consumable that gets refilled at irregular intervals (an LPG gas tank, a water bottle subscription, printer ink) where the useful question isn't "how much did I spend" but "when will I run out, and should I buy more soon." This needed its own tracking concept layered on top of (not replacing) the existing transaction/category model.

## Decision

### 1. `tracked_items` — a named consumable tied to one expense category

`name`, `category_id REFERENCES categories(id) ON DELETE RESTRICT` (must be an active expense **leaf** category — no children, mirroring [[ADR-013]]'s TileLookup leaf-only rule for transaction categories), `unit` (free text: "tabung", "kWh", etc.), `warning_days` (how many days before projected run-out to start alerting, default 3). `ON DELETE RESTRICT` on the category FK means a category with tracked items attached can't be deleted out from under them.

### 2. `tracked_item_refills` — the raw log the forecast is built from

Each refill: `date`, `quantity_added` (required, > 0), optional `remaining_qty_before_refill` (how much was left of the *previous* fill when this refill happened — lets the forecast account for partial usage rather than assuming every unit of the last fill was consumed), optional `transaction_id` (links to the expense transaction that paid for this refill, if logged through the transaction form rather than manually).

### 3. Forecast requires ≥ 2 refills, computed as an average daily-usage rate

`rebuildTrackedItemForecast()` (`api/src/lib/tracked-items.ts`): for each consecutive refill pair, consumption = `remaining_qty_before_refill` if recorded (previous fill's `quantity_added` minus what was left) else the full previous `quantity_added` (assume fully used); rate = `consumption / days_between_refills`. `avg_daily_usage` = mean of all pairwise rates. `estimated_run_out_at = latest_refill.date + (latest_refill.quantity_added / avg_daily_usage)`. `next_reminder_at = estimated_run_out_at - warning_days`. `forecast_ready` stays `0` until the 2-refill minimum is met, so a brand-new item shows no premature/garbage estimate.

### 4. Refills, and thus forecasts, are usually driven by transactions — not a separate manual log

`POST /transactions` accepts optional `tracked_item_id` + `refill_quantity` (+ `remaining_qty_before_refill`) on **expense** transactions — buying more of the tracked consumable *is* an expense transaction, so logging the purchase automatically creates the refill row and triggers a forecast rebuild in the same request, rather than requiring two separate data-entry steps.

### 5. `alert_active` is a derived, not stored, boolean

`GET /tracked-items` and `.../alerts` compute `alert_active = forecast_ready === 1 && next_reminder_at !== null && next_reminder_at <= now` on every read — always reflects "right now," never goes stale between forecast rebuilds the way a stored flag would need active expiry logic to stay correct.

### 6. Reimbursement role gets read access, not write

Reimbursement users can `GET` tracked items/refills (read-only visibility) but are blocked (`requireNonReimbursement`) from creating/editing tracked items or hitting the dedicated `/alerts` endpoint — consistent with [[ADR-019]]'s "their card, not the household's planning" boundary; tracked items are a household-consumables concept, not a per-card one.

## Alternatives Considered

| Alternative | Why (likely) rejected |
|---|---|
| Fixed/manual reminder schedule (e.g. "remind me every 30 days") instead of a computed forecast | Consumption of a gas tank or ink cartridge isn't calendar-regular — a computed rate from actual refill history adapts to real usage instead of a guessed fixed interval. |
| Store `alert_active` as a column, updated by a scheduled job | Would need a cron/scheduled worker (the project has explicitly avoided that infra elsewhere, per [[ADR-013]]'s recurring-transactions decision) — deriving it at read time needs no background job at all. |
| Separate "log a refill" UI disconnected from the transaction form | Would double-enter the same real-world event (a purchase) in two places; wiring refill capture into the existing expense-transaction flow (Decision §4) keeps the transaction ledger as the single source of "this money was spent," with the refill as a side effect. |
| Assume 100% of the previous fill was always consumed (ignore partial leftovers) | Would overstate usage rate whenever a refill happens before the previous fill is exhausted; the optional `remaining_qty_before_refill` field lets accurate logging correct for this, while still degrading gracefully (full-consumption assumption) when it's omitted. |

## Consequences

- Forecast accuracy depends entirely on refill regularity and whether `remaining_qty_before_refill` is filled in — a user who always refills exactly at empty (or never records the leftover) gets a less accurate rate than one who does, but the feature still functions either way.
- Deleting/restricting a category with tracked items attached is blocked at the DB level (`ON DELETE RESTRICT`) — a category page's soft-delete UI ([[ADR-003]]/[[ADR-012]]) needs to surface this as a clear error, not a raw SQL failure, if a user tries to delete a category still in use by a tracked item.
- No `DELETE /tracked-items/:id` endpoint exists — items are soft-deleted via `PUT .../:id { is_active: false }` only, consistent with the soft-delete-by-default pattern used elsewhere ([[ADR-003]], [[ADR-004]]).

## Follow-ups

- No push/email delivery for alerts found — `alert_active`/the `/alerts` endpoint surface *in-app* only (`TrackedItemAlerts.tsx`); a user who doesn't open the app won't be notified before running out.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-07-04 | Retroactive documentation of tracked items, refill logging, and the average-daily-usage forecast model. |
