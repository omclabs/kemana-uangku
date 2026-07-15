# ADR-014: Receipt/Statement CSV Import (OCR Scaffolded, Not Wired)

**Status:** Accepted
**Date:** 2026-06-16
**Version:** 1.0.0

> **Retroactive ADR.** Written from code inspection (commit `5301691`, "Implement transaction UI and config page updates") after the fact — original design rationale beyond what's inferable from the code is not preserved. No prior ADR covered this feature.

## Context

Manually entering every transaction from a bank/e-wallet statement or a paper receipt is slow. The app needed a bulk-import path: take a CSV export (statement download, or a receipt transcribed to CSV), turn each row into a review-able draft, let the user fix/exclude rows, then commit them as real expense transactions in one batch.

`api/src/middleware/auth.ts`'s `Bindings` type already declares `AI?: { run(model, input) }` and `RECEIPT_OCR_MODEL?: string` — Cloudflare Workers AI bindings for a future image-to-text OCR step — but no route or frontend code uses them yet. This ADR covers only the CSV path that **is** implemented.

## Decision

### 1. Two-step parse/commit flow, no server-side draft state

- `POST /transactions/import-receipt/parse` (`api/src/routes/transactions.ts`): accepts `FormData` (`account_id`, `file`), reads the CSV as text, calls `buildReceiptDraft()` (`api/src/lib/receipt-import.ts`), returns a `ReceiptImportDraft` JSON object. Nothing is written to the DB at this step.
- Frontend (`TransactionReceiptImport.tsx`) holds the draft in React state, lets the user edit/exclude/add rows client-side, with no round-trip to the server per edit.
- `POST /transactions/import-receipt/commit` takes the (possibly edited) draft back, validates every included row again server-side, and batch-creates transactions.
- No intermediate "draft" table — the draft only exists in the HTTP response/request bodies and browser memory. A page refresh loses in-progress edits.

### 2. Manual CSV parser, not a library

`buildReceiptDraft()` hand-parses CSV (quoted-field handling included) rather than pulling in a CSV library — required headers `note`, `amount`, `date`; optional `category_id`, `included` (default `true`), `kind` (`item`/`voucher`/`manual`, default `item`).

### 3. Locale-aware amount/date parsing, best-effort

- Amount parsing strips non-numeric characters except `,`/`.`/`-`, then heuristically decides which of `,`/`.` is the decimal separator based on which appears last in the string — handles both `1.234,56` (ID) and `1,234.56` (US) without a locale flag.
- Date parsing uses `Date.parse()` directly (handles ISO/US/locale formats it can), no bespoke date-format grammar.
- Unparseable amount/date doesn't reject the row — it's kept with a warning and `confidence: 0.5`, so the user can fix it inline rather than losing the row.

### 4. Every included row re-validated at commit, not trusted from parse

`POST .../commit` re-checks: account exists/active, at least one included row, and per-row note/category/amount/date validity — the parse step's warnings are advisory for the UI, not a substitute for server-side validation (the client payload for commit is arbitrary user-edited JSON, not the original parse output).

### 5. `source = 'bulk'` on committed rows

Transactions created via commit get `source: 'bulk'` (the `transactions.source` column/CHECK already existed unused since ADR-013) — distinguishes import-created rows from manually entered ones for any future reporting.

### 6. `paid_status` follows the same account-type rule as manual entry

Credit-card-account imports get `paid_status: 'settle'`, everything else `'paid'` — same rule `POST /transactions` uses (ADR-013), so imported credit-card purchases still flow through the [[ADR-017]] payment cycle.

## Alternatives Considered

| Alternative | Why (likely) rejected |
|---|---|
| Server-side draft table (persist parse result, edit via PATCH) | More moving parts (draft expiry, cleanup) for a flow that's realistically a single sitting; in-memory client state is sufficient and the commit step re-validates anyway. |
| Trust the parse step's `confidence`/`included` flags at commit time | Client payload at commit is user-edited and not re-derived from the original file — trusting it would let a manipulated request bypass category/amount validation. |
| CSV parsing library (`papaparse`, etc.) | Not pulled in; hand-rolled parser is small and the format is simple/self-controlled (own export format, not arbitrary third-party CSVs). |

## Consequences

- Import is CSV-only today; the `AI`/`RECEIPT_OCR_MODEL` bindings are declared but dead code — a real photo-receipt OCR flow needs a new route that calls `c.env.AI.run()`, parses its output into the same `ReceiptImportDraft` shape, and populates `ocr_text` (currently always `null`).
- Reimbursement-role users are forbidden from both parse and commit endpoints (`requireNonReimbursement`) — import is an admin/user-only workflow.
- A page refresh mid-review loses all draft edits — acceptable for a single-sitting workflow, would need persistence if imports are expected to span sessions.

## Follow-ups

- Wire the OCR path: image upload → `c.env.AI.run(RECEIPT_OCR_MODEL, ...)` → text → same draft-building logic, populating `ocr_text` and likely a `receipt_total` for reconciliation against `included_total`.
- No tests found covering `buildReceiptDraft()`'s amount/date heuristics — worth adding given the ambiguous-format guessing involved.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-16 | Retroactive documentation of the existing CSV parse/commit import flow. |
