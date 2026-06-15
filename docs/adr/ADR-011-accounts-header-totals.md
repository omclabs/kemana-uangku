# ADR-011: Total Assets / Total Liabilities in Accounts Page Header

**Status:** Accepted
**Date:** 2026-06-15
**Version:** 1.1.0

## Context

The user asked, via `/plan` (direct mode, plan saved to
`.omc/plans/kemana-uangku-accounts-header-totals.md`), then "do it":
"add the plan, in the header of account, show the total asset and total
liabilities."

"Header of account" was interpreted as the `/accounts` list page header
(`web/src/pages/account/AccountList.tsx`, the row currently containing
`<h1>Accounts</h1>` + "+ Add Account") -- a per-account asset/liability split
doesn't make sense on the single-account edit page, so this is an aggregate
across the accounts shown on the list.

The data needed already exists client-side, no backend changes:

- `api/src/routes/accounts.ts`'s `SELECT_WITH_BALANCE` computes
  `computed_balance` for top-level accounts (`parent_id IS NULL`) as
  `balance + SUM(active, include_in_total=1 children's balance)`; for child
  accounts `computed_balance == balance`. Top-level rows already roll up
  their children, so summing only top-level rows avoids double-counting.
- `AccountList.tsx` already derives `topLevel = accounts.filter((a) =>
  a.parent_id === null)`.
- An account with `include_in_total === 0` is already labeled "Excluded from
  total" on this same page -- the new totals must respect that flag so the
  page doesn't show a number that contradicts a label next to it.
- `/accounts` (default, no `include_inactive`) already returns only
  `is_active === 1` rows.

**v1.1.0 revision (same session, before any user verification of v1.0.0):**
the user corrected the definition to be **type-based**, not sign-based:

> total assets is sum of type which is bank, cash, autodebet, prepaid,
> saving, investment, liabilities is sum (available - remaining balance from
> credit card), loan

Clarified via `AskUserQuestion` ("CC liability" header): for `credit_card`,
"available - remaining balance" maps to `credit_limit - balance` (`balance`
modeled as remaining available credit: `credit_limit` when unused, `0` when
fully used) -- user picked this over an `abs(balance)`-only alternative.
For `loan`, liability = `abs(computed_balance)` (handles either a
positive "amount owed" convention or the negative-balance convention
mentioned in `AccountForm.tsx`'s `credit_card`/`loan` hint text).

## Decision

In `AccountList.tsx`, after the existing `topLevel`/`groups` derivations,
added:

```ts
const included = topLevel.filter((a) => a.include_in_total === 1);
const totalAssets = included
  .filter((a) => a.type !== 'credit_card' && a.type !== 'loan')
  .reduce((sum, a) => sum + a.computed_balance, 0);
const totalLiabilities = included.reduce((sum, a) => {
  if (a.type === 'credit_card') return sum + ((a.credit_limit ?? 0) - a.computed_balance);
  if (a.type === 'loan') return sum + Math.abs(a.computed_balance);
  return sum;
}, 0);
```

- **Total Assets** = sum of `computed_balance` over top-level,
  `include_in_total === 1` accounts whose `type` is one of `bank`, `cash`,
  `autodebet`, `prepaid`, `savings`, `investment` (i.e. every type except
  `credit_card` and `loan`). Summed as-is (no sign filtering) -- e.g. an
  overdrawn savings account reduces the total, which is correct.
- **Total Liabilities** = for the same `included` set:
  - `credit_card`: `credit_limit - computed_balance` (the account's own
    `credit_limit`, minus its rolled-up `computed_balance`).
  - `loan`: `Math.abs(computed_balance)`.
  - all other types: `0` (already counted in Total Assets).
- Classification is now purely by `type`, not by the sign of
  `computed_balance`.

Below the existing title/"+ Add Account" row, added a 2-column stat-box
grid, rendered only when `!loading && !error` (same gating as the existing
list body):

```tsx
{!loading && !error && (
  <div className="mb-4 grid grid-cols-2 gap-3">
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-900/5">
      <p className="text-xs uppercase tracking-wide text-gray-500">Total Assets</p>
      <p className="text-lg font-semibold text-emerald-600">
        {formatter.format(totalAssets)}
      </p>
    </div>
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-900/5">
      <p className="text-xs uppercase tracking-wide text-gray-500">Total Liabilities</p>
      <p className="text-lg font-semibold text-rose-600">
        {formatter.format(totalLiabilities)}
      </p>
    </div>
  </div>
)}
```

Reuses the existing `formatter` (`Intl.NumberFormat('id-ID', {style:
'currency', currency: 'IDR', maximumFractionDigits: 0})`) -- no new
formatter. `rounded-xl ... ring-1 ring-gray-900/5` matches the card style
proposed (but not yet implemented at time of writing) in the separate UI
depth/accent-color plan; this ADR does not depend on that plan landing.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Classify assets/liabilities by `computed_balance` sign instead of `type` (v1.0.0's original decision) | Superseded by the user's v1.1.0 correction: assets/liabilities are determined by account `type` (bank/cash/autodebet/prepaid/savings/investment vs. credit_card/loan), not by whether the current balance happens to be positive or negative. |
| `credit_card` liability = `abs(computed_balance)` only, `credit_limit` unused (the `AskUserQuestion` alternative not chosen) | User picked `credit_limit - computed_balance` instead -- `balance` is modeled as *remaining available credit*, so the amount used (= owed) is the gap between the limit and what remains. `abs(balance)` would instead require `balance` to directly store the owed amount, which the user's formula treats as `credit_limit`'s complement. |
| Also show "Net worth" (Assets − Liabilities) | Not requested. Trivial follow-up (`totalAssets - totalLiabilities`, both already computed) if wanted later -- not added now to avoid scope creep. |
| Sum over all accounts (including children) instead of `topLevel` only | Would double-count: a top-level account's `computed_balance` already includes its active, included children's balances server-side. Summing all rows would count each child twice. |
| Ignore `include_in_total` for the new totals | Would contradict the existing per-account "Excluded from total" label shown on the same page for the same accounts. |

## Consequences

- `/accounts` now shows two stat boxes (Total Assets, Total Liabilities)
  below the page title, computed client-side from data already fetched (no
  new API calls).
- Totals automatically reflect parent/child rollups and `include_in_total`
  exclusions exactly as already labeled per-account on the same page.
- If `groups.length === 0` ("No accounts yet."), both stat boxes render
  showing `Rp 0` (sum of an empty filtered array) -- no special-casing
  needed.
- A `credit_card` account with `computed_balance > credit_limit` (e.g. went
  over its limit, or `balance` wasn't reduced from its initial
  `credit_limit` placeholder) yields a *negative* contribution to
  `totalLiabilities` from `credit_limit - computed_balance`. Not specially
  handled -- the sum would simply be smaller; flagged as a known edge case,
  not addressed since it requires a value judgement (clamp to 0? treat as
  negative liability / asset?) that wasn't part of the user's instruction.
- Net worth is not shown; can be added trivially later if requested.

## Follow-ups

- None new. Net worth display remains a possible future addition,
  unrequested. The `credit_limit - computed_balance < 0` edge case above is
  also unaddressed, pending user input if it ever occurs in practice.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-15 | Initial decision -- Total Assets / Total Liabilities stat boxes added to `/accounts` header, computed from `topLevel` accounts filtered by `include_in_total`, split by `computed_balance` sign |
| 1.1.0 | 2026-06-15 | User correction (same session, before verification): classification changed from sign-based to type-based. Total Assets = sum of `computed_balance` for bank/cash/autodebet/prepaid/savings/investment. Total Liabilities = `credit_limit - computed_balance` for `credit_card` + `abs(computed_balance)` for `loan`, per `AskUserQuestion` ("CC liability") |
