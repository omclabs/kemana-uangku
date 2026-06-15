# ADR-013: Transactions CRUD and Form

**Status:** Accepted
**Date:** 2026-06-15
**Version:** 0.0.1

## Context

User asked, via `/plan` (direct mode, plan saved to
`.omc/plans/transactions-crud-and-form.md`), then "do it": add a new
`transactions` feature -- a ledger table (`income` / `expense` / `transfer`)
with a CRUD API and a `/transactions` form UI, plus "at the end update minor
version" (`config.version`).

Key requirements from the spec, clarified during planning:

- `transactions` table: `id, date, account_id, category_id, amount, note,
  type, transfer_to, fee, source, paid_status, is_active, created_at,
  updated_at`, plus recurring/installment bookkeeping columns.
- `account_id`/`transfer_to`: TileLookup, parent **or** child selectable
  (`allowParentSelection=true`).
- `category_id`: TileLookup, leaf-only when the category has active children
  (`allowParentSelection=false`) -- "if has child then must use child".
- `amount`: tile that opens a simple `Calculator`; operator-replace rule
  (`12 * -` -> `12 -`, not `12 * -`).
- Optional recurring/installment (3 / 6 / 12 / custom 2-60).
- Transfer + optional `fee` -> 2 rows (main transfer + a linked fee row).
- Transfer to a `credit_card`/`loan` destination -> reclassified as an
  `expense` on the source account.
- `paid_status`: `settle` for `credit_card`-account transactions until marked
  paid (`PATCH /transactions/:id/pay`), else `paid`.

Decisions locked via `AskUserQuestion` during planning:

- Recurring/installment: **pre-generate all N rows at creation** (no cron).
  Recurring = same `amount` repeated for N months, same date-of-month.
  Installment = `amount` split N ways (`floor`, remainder on the last row).
- `accounts.balance`: auto-updated by transaction CRUD via a uniform
  delta -- `expense` always `-amount`, `income` always `+amount`, on every
  account type including `credit_card`/`loan` (matches `AccountForm.tsx`'s
  "negative = amount owed" hint).
- Fee rows and reclassified transfer rows are mapped to existing seeded
  categories (`cat-admin`, `cat-transfer`) rather than left `category_id =
  NULL`.
- `paid_status` is computed automatically at creation; flipped via a
  dedicated `PATCH /transactions/:id/pay` (409 if already `paid`).

## Decision

1. **Migration `api/migrations/0005_transactions.sql`**: new `transactions`
   table -- `id, date, account_id, category_id, amount (CHECK > 0), note,
   type (income|expense|transfer), transfer_to, fee (CHECK >= 0 or NULL),
   source (single|bulk, default single), paid_status (paid|settle, default
   paid), recurring_group_id, recurring_mode (recurring|installment|NULL),
   installment_index, installment_total, parent_transaction_id (FK ->
   transactions, ON DELETE CASCADE), is_active, created_at, updated_at`, with
   indexes on `account_id`, `category_id`, `transfer_to`, `date`,
   `recurring_group_id`, `parent_transaction_id`.
   `parent_transaction_id` is an addition beyond the literal spec: it links a
   fee row to its parent transfer row so PUT/DELETE on the parent can cascade
   (`ON DELETE CASCADE` for hard delete; soft delete cascades in the route
   handler).
2. **Migration `api/migrations/0006_bump_config_version.sql`**: `UPDATE
   config SET version = '1.1.0', last_updated = unixepoch() WHERE id = 1`
   ("at the end update minor version", `1.0.0 -> 1.1.0`). Runs after 0005.
3. **Validation** (`api/src/lib/validation.ts`): added `transactionCreate`
   (zod object + `.refine()`) and `transactionUpdate` (plain object, since
   `.refine()` returns a `ZodEffects` which has no `.omit()`).
   `transactionCreate.refine()` enforces `recurring.mode !== 'installment' ||
   amount >= recurring.total` -- otherwise `Math.floor(amount/total)` could
   produce a `0`-amount row, violating the `amount > 0` table `CHECK`.
   Cross-field rules that zod can't express cleanly (transfer requires
   `transfer_to` != `account_id`; non-transfer rejects `transfer_to`/`fee`
   and requires `category_id`; category must exist/be active/match
   type/have no active children, except for the system categories
   `cat-admin`/`cat-transfer`) are enforced in the route handler.
4. **Balance delta helper** (`api/src/lib/balance.ts`, new): `deltaForAccount`
   (`income` -> `+amount`, `expense` -> `-amount`, uniform across every
   account type, no per-type branch), `transactionBalanceOps` (a transfer is
   "expense on `account_id`" + "income on `transfer_to`"; this holds even for
   rows reclassified to `type: 'expense'` since the row still carries
   `transfer_to`), `mergeBalanceOps` (nets multiple op lists -- used by `PUT`
   to apply a reverse-old + apply-new diff in one pass, dropping zero-delta
   accounts), and `adjustBalanceStatement` (the `UPDATE accounts SET balance
   = balance + ? WHERE id = ?` statement, batched via `DB.batch`).
   This delta is correct under either reading of `credit_card`/`loan`
   `balance` ("negative = owed" vs. "remaining available credit") -- see the
   open question in Follow-ups.
5. **Route `api/src/routes/transactions.ts`** (new), registered in
   `api/src/index.ts` as `protectedApp.route('/transactions', ...)`:
   - `GET /` -- filters `account_id`, `category_id`, `type`, `paid_status`,
     `recurring_group_id`, `from`/`to` (date range), `include_inactive=true`;
     default `is_active = 1`, `ORDER BY date DESC`.
   - `GET /:id` -- 404 if missing.
   - `POST /` -- validates as above, loads/validates `account_id` (+
     `transfer_to` if transfer) and `category_id`. Computes `paid_status =
     account.type === 'credit_card' ? 'settle' : 'paid'`. If
     `type === 'transfer'` and the `transfer_to` account's type is
     `credit_card`/`loan`, the row's stored `type` is reclassified to
     `'expense'` and `category_id` set to `cat-transfer` (`transfer_to` is
     retained either way, so balance math is unaffected).
     `occurrences = recurring?.total ?? 1`; per-row amounts via
     `computeRowAmounts` (recurring: every row = full `amount`; installment:
     `floor(amount/occurrences)` per row, remainder absorbed by the last
     row). For `i in 0..occurrences-1`: `occurrenceDate = addMonths(date, i)`
     (UTC `setUTCMonth`), insert the main row (`recurring_group_id` = row 0's
     id when `occurrences > 1`, `installment_index`/`installment_total` set
     accordingly). If `type === 'transfer'` and `fee > 0`, also insert a
     linked fee row (`type='expense'`, `category_id='cat-admin'`,
     `amount=fee`, `transfer_to=null`, `parent_transaction_id=<main row
     id>`) -- the fee is **not** split across occurrences; every occurrence
     gets the full `fee`. All inserts + `mergeBalanceOps`-derived balance
     updates run in one `DB.batch`. Returns the inserted rows, 201.
   - `PUT /:id` -- editable: `date`, `category_id`, `amount`, `note`,
     `paid_status`, `is_active`. Rejects `category_id` changes when
     `existing.transfer_to !== null || existing.parent_transaction_id !==
     null` (transfer/reclassified/fee rows have system-managed categories).
     Recomputes the balance delta as reverse-old (if previously active) +
     apply-new (if still active) via `mergeBalanceOps`, so an `amount` change
     and an `is_active` toggle are handled in one diff. **Cannot** change
     `type`/`account_id`/`transfer_to`/`fee` -- see Follow-ups.
   - `DELETE /:id` -- soft delete (`is_active = 0`, reverses balance) by
     default, cascading to any fee rows (`parent_transaction_id = :id`);
     `?hard=true` hard-deletes (DB `ON DELETE CASCADE` removes fee rows),
     reversing balances for any rows that were still active.
   - `PATCH /:id/pay` -- 404 if missing, 409 if already `paid`, else sets
     `paid_status = 'paid'`. No balance effect (`settle` vs `paid` is a
     tracking flag only).
   - `source` is always stored as `'single'` server-side this phase (column +
     `CHECK` exist for future bulk import; client value ignored).
6. **Frontend types** (`web/src/lib/types.ts`): added `TRANSACTION_TYPES`,
   `TransactionType`, `PAID_STATUSES`, `PaidStatus`, `INSTALLMENT_OPTIONS`
   (`[3, 6, 12]` + custom), `RECURRING_MODES`, `RecurringMode`, `Transaction`,
   `TransactionInput`.
7. **Calculator** (`web/src/lib/calculator.ts` + `web/src/components/
   Calculator.tsx`, new): pure reducer (`pressDigit`, `pressOperator`,
   `pressEqual`, `evaluate`, `reset`, `displayValue`) plus a bottom-sheet
   modal. **Operator-replace rule**: if the current token is empty and the
   last token in the expression is already an operator, pressing another
   operator replaces it instead of appending (`12 * -` -> `12 -`).
   Evaluation is left-to-right with no operator precedence. The modal's "OK"
   button calls `onConfirm(evaluate(state))`, sending the result back to the
   caller (the amount/fee field).
8. **TileLookup** (`web/src/components/TileLookup.tsx`, new): generic
   tile-grid picker modal (`items, value, onSelect, onClose,
   allowParentSelection, title`). Top-level active items render as tiles; a
   tile with active children drills into a child grid (back-chevron to
   return). When `allowParentSelection=true` (accounts), the child grid is
   prefixed with an "All `<Parent>`" tile so the parent itself remains
   selectable. When `allowParentSelection=false` (categories), no such tile
   is shown -- a parent with children cannot be selected directly, matching
   "if has child then must use child".
9. **Icons** (`web/src/components/icons.tsx`): added `CalculatorIcon`,
   `TagIcon`, `WalletIcon`, `ChevronLeftIcon`, `TrashIcon`.
10. **Pages** (`web/src/pages/transaction/`, new, replacing the
    `Transaction.tsx` placeholder):
    - `TransactionList.tsx` -- lists transactions (`date DESC`), grouped by
      calendar day under a "Weekday, Date" header (id-ID locale). Each row is
      a 3-column grid: col 1 is the category (or `Transfer`, smaller text,
      fixed width, truncated); col 2 stacks the note on top of the account
      (or, for transfers, `from -> to`) in smaller gray text; col 3 is the
      amount (colored by `type`, `+`/`-` sign for income/expense, responsive
      font size via `clamp()`) plus, for `paid_status === 'settle'` rows, a
      "Settle" button calling `PATCH /transactions/:id/pay`. Swiping a row
      left reveals a `TrashIcon` delete action (`DELETE /transactions/:id`,
      with confirm); tapping a row
      navigates to `/transactions/:id/edit`. "+ Add" -> `/transactions/new`.
    - `TransactionForm.tsx` -- type tabs (Income / Expense / Transfer, create
      only; `PUT` can't change `type` so edit mode shows it as a label).
      `date` via `<input type="datetime-local">`. `account`/`from`
      (TileLookup, `allowParentSelection=true`). For transfer, `to`
      (TileLookup, accounts) and an optional `fee` tile (Calculator). For
      income/expense, `category` (TileLookup, `allowParentSelection=false`,
      filtered to categories of the matching type) -- locked/read-only in
      edit mode for rows where `transfer_to`/`parent_transaction_id` is set
      (reclassified or fee rows, matching the `PUT` restriction). `amount`
      tile opens `Calculator`. Optional recurring/installment section
      (create only): mode tabs Recurring/Installment, count 3/6/12/custom
      (2-60), with helper text describing the per-row amount(s) that will be
      generated. On submit, builds a `TransactionInput` and `POST`s (create)
      or `PUT`s (edit, sending only `date`/`amount`/`note`/`category_id`).
11. **Routes** (`web/src/App.tsx`): `/transactions` -> `TransactionList`,
    `/transactions/new` and `/transactions/:id/edit` -> `TransactionForm`,
    all under `AuthGuard`. Removed the `Transaction.tsx` placeholder and its
    import/route.
12. **Tests** (`api/test/transactions.test.ts`, new, 17 cases): validation
    400s, balance deltas (income/expense/transfer/transfer+fee/
    reclassification), `paid_status` (`settle` for `credit_card`), recurring
    (3 rows, same amount, sequential months), installment (100000/3 ->
    33333/33333/33334), `PATCH /:id/pay` (settle -> paid, 409 on repeat),
    `PUT` amount diff, soft `DELETE` (balance reversal), hard `DELETE` with
    fee-row cascade, `GET` filters. Also fixed `api/test/config.test.ts` to
    expect `version: '1.1.0'` after migration 0006. All 59 tests pass.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Template + cron-generated recurring/installment rows (generate future occurrences lazily over time) | No cron/scheduled-worker infrastructure exists in this project. Pre-generating all N rows at creation (chosen) is simpler, makes every occurrence immediately visible/editable, and matches "add optional recurring/installment option" without new infra. |
| Manual `accounts.balance` adjustment (user edits balance separately from transactions) | Defeats the purpose of a transaction ledger -- balances would drift from the recorded history. Auto delta (chosen, `balance.ts`) keeps `accounts.balance` consistent with every income/expense/transfer. |
| Leave `category_id = NULL` for fee rows and reclassified transfer rows | `category_id` is used for type-matching and leaf-validation elsewhere; `NULL` would need special-casing throughout (list display, validation, reporting). Mapping to existing seeded `cat-admin`/`cat-transfer` (chosen) keeps every row's `category_id` meaningful with zero new categories. |
| Single recurring mode (only "repeat full amount" OR only "split total"), forcing the user to pick one budgeting style | User clarified both modes are wanted ("add option 3,6,12, custom" alongside "installment"). Both `recurring` and `installment` modes are supported via `recurring_mode`, sharing the same generation loop and `computeRowAmounts` split logic. |

## Consequences

- `/transactions` now has full CRUD via the UI: list with paid/settle
  tracking, create (all three types, with recurring/installment and
  transfer+fee), and a restricted edit (date/category/amount/note only).
- `accounts.balance` is now mutated as a side effect of every transaction
  `POST`/`PUT`/`DELETE` -- any future feature that also writes
  `accounts.balance` directly (e.g. a manual "adjust balance" action) must
  go through `balance.ts`'s delta helpers or risk double-counting.
- **Reporting caveat (surfaced during review, not a bug):** paying off a
  `credit_card`/`loan` via a `transfer` that gets reclassified to `expense`
  means the original purchase (an `expense` at time of charge) and the later
  payoff (also stored as `type='expense'`, due to reclassification) both
  reduce a naive `SUM(amount) WHERE type='expense'`. This is *correct* for
  balance tracking (both events really do move money out of the source
  account) but means "sum of expense transactions" is not the same as
  "spending" in a budget-reporting sense. Flagged so a future
  spending-report feature doesn't double-count; no code changes needed for
  this ADR.
- `parent_transaction_id` (fee-row link) is new surface area: any future
  bulk-edit/bulk-delete of transactions must account for cascading to linked
  fee rows the same way `DELETE /:id` does.

## Follow-ups

- `PUT /transactions/:id` cannot reassign `type`, `account_id`,
  `transfer_to`, or `fee` (would require re-deriving balance deltas across
  potentially different accounts and row-counts). To change any of these,
  delete + recreate the transaction. Not exposed as a one-click "convert" UI.
- `addMonths` (`setUTCMonth`) has the standard JS month-end rollover edge
  case for installments/recurring starting on the 29th-31st (e.g. Jan 31 ->
  Mar 3, skipping/shifting Feb). Not addressed; would need an explicit
  "clamp to end of month" policy if it becomes a problem in practice.
- Bulk import (`source = 'bulk'`) is not implemented -- the column and
  `CHECK` constraint exist for it, but every row created via this API is
  `source = 'single'`.
- Per-bank `cat-admin-*` fee sub-categorization is not wired; all transfer
  fees use the single shared `cat-admin` category.
- **Open question for the user (not blocking, doesn't need resolving for
  this ADR):** ADR-011's `credit_card` Total Liabilities formula
  (`credit_limit - computed_balance`, i.e. `balance` = "remaining available
  credit", 0..`credit_limit`) and `AccountForm.tsx`'s hint text ("negative =
  amount owed" for `credit_card`/`loan`) describe two different conventions
  for the same `accounts.balance` column -- both can't be true at once.
  Evidence leaning toward "negative = owed": the seeded `acc-cc-cimb` defaults
  `balance` to `0` (migration 0002 doesn't set it); under "remaining
  available credit" that would mean *maxed out on day one* (an odd default
  for a fresh demo account), whereas under "negative = owed" it means *no
  debt yet* (a sensible default). This ADR's balance delta (`balance.ts`,
  point 4) is correct under either convention, so no code here depends on the
  answer -- but if "negative = owed" is confirmed, `AccountList.tsx`'s Total
  Liabilities for `credit_card` (`credit_limit - computed_balance =
  credit_limit + debt`) will overstate once real transactions push that
  balance negative, and would need an ADR-011 revision (existing ADRs aren't
  bumped without explicit instruction, per the project's ADR-versioning
  convention).
- Manual browser verification pending (same gate as prior UI ADRs):
  `/transactions` list (paid/settle "Settle" action, transfer arrow display,
  installment badges), `/transactions/new` for each type (account/category
  TileLookup parent-vs-leaf rules, Calculator incl. operator-replace,
  transfer + fee, recurring and installment helper text), `/transactions/:id/
  edit` (locked type/account/transfer_to/fee/category-when-system, amount/
  date/note/category edits), nav entry (already existed, unchanged).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.0.1 | 2026-06-15 | Initial: `transactions` table + indexes (migration 0005), config version bump to `1.1.0` (migration 0006), `transactionCreate`/`transactionUpdate` validation, `balance.ts` delta helpers, `api/src/routes/transactions.ts` (GET/POST/PUT/DELETE/PATCH `/pay`), frontend types, `Calculator`/`TileLookup` shared components + new icons, `TransactionList`/`TransactionForm` pages, routes, 17 new API tests (59 total passing). |
