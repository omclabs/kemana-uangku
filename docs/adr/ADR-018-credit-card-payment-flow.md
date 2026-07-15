# ADR-018: Credit Card Payment Flow (Settle → Paid, Payment-Transaction Links)

**Status:** Accepted
**Date:** 2026-06-19
**Version:** 1.0.0

> **Retroactive ADR.** Written from code inspection (commit `32d89d7`, "feat: add credit card payment flow", migration `0010_credit_card_payment_links.sql`) after the fact. Directly extends [[ADR-013]] (`paid_status: settle` for credit-card transactions was already reserved for this).

## Context

[[ADR-013]] introduced `paid_status` (`paid`/`settle`) and a `PATCH /transactions/:id/pay` no-op flag-flip, noting `settle` is used "for credit_card-account transactions until marked paid." It never specified how a user actually *pays off* a batch of settled charges from a real funding account, or how that payment should be reflected in both the paying account's balance and the credit card's outstanding charges. This ADR is that missing piece — it replaces the bare `PATCH .../pay` flag-flip for credit cards with a real payment transaction.

## Decision

### 1. `payment_transaction_id` links a settled charge to the payment that cleared it

Migration `0010` adds one column: `transactions.payment_transaction_id TEXT NULL REFERENCES transactions(id) ON DELETE SET NULL`. When a payment clears a batch of charges, every cleared charge row gets this set to the new payment transaction's ID — a bidirectional trail from "this $50 grocery charge" to "the $500 card payment that included it."

### 2. `POST /accounts/:id/payments` — one endpoint, does three things atomically

Given a credit card account ID, a `payment_account_id` (funding source), a list of `transaction_ids` to settle, and an `anchor_month`:

1. **Validates**: card exists/active/is `credit_card`; payment account exists/active/not the same account/not itself a liability (`credit_card`/`loan`, per `constants.ts`); every transaction ID exists, is active, belongs to *this* card, and is currently `paid_status: 'settle'`; every transaction's date falls within the allowed statement window (current month ± 1 relative to the card's `billing_date`, via `anchor_month`); total payment amount is non-zero.
2. **Creates one expense transaction** on the payment account — amount = sum of the settled charges, `category_id: cat-transfer`, `transfer_to:` the credit card, mirroring how [[ADR-013]] already models transfers, so the payment account's balance drops through the exact same `balance.ts` delta path as any other transfer-to-liability transaction.
3. **Flips every selected charge** to `paid_status: 'paid'` and stamps `payment_transaction_id` with the new payment's ID — in the same batch as the balance-adjusting statement, then calls [[ADR-016]]'s `rebuildMonthlyBalancesFrom()` from the payment date forward.

### 3. Statement-window guard on which charges are payable together

Charges eligible for a given payment are restricted to roughly one statement cycle around `anchor_month` (derived from the card's `billing_date`, [[ADR-004]]) — prevents accidentally lumping unrelated months' charges into a single "payment," keeping the payment total meaningful against an actual bill.

### 4. Credit cards can't be a `transfer` source anymore

`POST /transactions` now rejects (400) a `type: 'transfer'` where the source account is a credit card — [[ADR-013]]'s original transfer-to-liability reclassification only handled the *destination* side; this ADR closes the other direction: money can't leave a credit card except through the structured payment flow above, keeping every "money left the card" event traceable via `payment_transaction_id`.

## Alternatives Considered

| Alternative | Why (likely) rejected |
|---|---|
| Keep using bare `PATCH /transactions/:id/pay` per charge | Never actually moved money or touched the funding account's balance — [[ADR-013]] left it as a tracking-flag-only flip; a real payment needs a real transaction that debits *some* account. |
| Let a credit-card-source `transfer` handle payments (symmetric with the already-supported transfer-to-credit-card reclassification) | Would allow one-charge-at-a-time payments with no link back to which settled charges it covered, and no statement-window guard — the batch endpoint (Decision §2) does both in one call, which the transfer endpoint's per-row shape can't express. |
| No statement-window restriction (any settle-status charge, any month, payable together) | Would let a payment silently span unrelated billing cycles, making the payment total meaningless relative to an actual statement — the `anchor_month` guard keeps payments statement-shaped. |

## Consequences

- A credit card's outstanding balance is now only reduced two ways: this payment endpoint, or a soft/hard `DELETE` of a charge — direct `PUT` balance edits or ad-hoc transfers are blocked.
- `payment_transaction_id` is new surface area for any future bulk-edit/bulk-delete of transactions: deleting a payment transaction sets the column `NULL` on its formerly-linked charges (via `ON DELETE SET NULL`) rather than reverting them to `settle` — those charges would show as `paid` with no linked payment, a latent inconsistency worth flagging if payment deletion is ever exposed in the UI.
- Reimbursement-role users (`user_account_access`, [[ADR-019]]) *can* initiate payments on their assigned cards — this is one of the few write operations that role is allowed, since it's how they'd actually settle spend on a card they're responsible for.

## Follow-ups

- Deleting a payment transaction doesn't currently revert its linked charges back to `settle` — if payment deletion/editing is ever exposed in the UI, this needs explicit handling.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-19 | Retroactive documentation of the credit card payment flow, `payment_transaction_id` linkage, and the credit-card-as-transfer-source block. |
