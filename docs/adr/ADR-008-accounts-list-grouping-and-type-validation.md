# ADR-008: Accounts List Grouping, Card-as-Link, and Parent/Child Type Rule

**Status:** Accepted
**Date:** 2026-06-14
**Version:** 1.0.0

## Context

`web/src/pages/account/AccountList.tsx` (pre-ADR-007 era, then wrapped in
`PageContainer` by ADR-007) rendered top-level accounts as cards with a
nested `<ul>` of child accounts underneath each parent, an inline "Edit"
link per row, a `type` text label per row, and a balance formatted via
`Intl.NumberFormat('id-ID', { currency: config.currency })` where
`config.currency` came from `/config` (default `'IDR'`, but editable —
when set to e.g. `'USD'`, the `id-ID` locale renders amounts with a
`"US$"` prefix instead of `"Rp"`).

The user asked to:
1. Always display `Rp` (IDR), regardless of the `/config` currency setting.
2. Remove the per-row "Edit" link — make the whole card clickable to edit.
3. Remove the per-row `type` text; instead group cards under a section
   heading per account type (e.g. "Bank" / "Cash" / ...).
4. Only display parent (top-level) accounts — drop the nested children
   list entirely.
5. Display each parent's balance as parent balance + sum of its children's
   balances.
6. Enforce that a child account's `type` always matches its parent's `type`.

Point 5 was already implemented: `SELECT_WITH_BALANCE` in
`api/src/routes/accounts.ts` (ADR-004) computes `computed_balance` as
`balance + SUM(active, included children's balances)` for top-level rows.
No backend change was needed for point 5 — the frontend already displays
`computed_balance` for top-level accounts.

Point 6 was a genuinely new business rule (confirmed via `AskUserQuestion`:
"Add validation" over "just context for grouping"), since prior to this ADR
the API allowed a child's `type` to differ from its parent's `type`.

## Decision

### 1. Hardcode `Rp` (IDR) formatting on the Accounts page

```ts
const formatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});
```

Module-level constant, no longer derived from `/config`. The `/config`
fetch and `Config` type import were removed from `AccountList.tsx` — they
existed only to source `currency` for this formatter. `id-ID` + `IDR`
renders as `"Rp 1.500.000"`. The `/config` page (`Config.tsx`) and its
`currency` field are unchanged — they no longer affect the Accounts page's
display.

### 2. Whole card is the edit link

Each account card is now `<Link to={/accounts/${id}/edit}>` wrapping the
entire row content (name, balance, "Excluded from total" badge), with
`hover:bg-gray-50` for affordance. The standalone "Edit" `<Link>` text was
removed from `AccountRow`.

### 3. Group top-level accounts by `type`, with section headers

```ts
const groups = ACCOUNT_TYPES.map((type) => ({
  type,
  accounts: topLevel.filter((a) => a.type === type),
})).filter((group) => group.accounts.length > 0);
```

Each non-empty group renders as a `<section>` with an `<h2>` header
(`formatTypeLabel(type)`, e.g. `"credit_card"` -> `"Credit Card"`) followed
by its cards. Groups are ordered per `ACCOUNT_TYPES`
(`web/src/lib/types.ts`); types with zero top-level accounts are not shown.
The per-card `type` text line was removed from `AccountRow` — the section
header now carries that information.

### 4. Only top-level (parent) accounts are rendered

The nested `childrenOf(parentId)` lookup and its `<ul>` were removed
entirely. `topLevel = accounts.filter(a => a.parent_id === null)` (unchanged
filter) is now the *only* thing rendered. Combined with Decision §6 (every
child shares its parent's `type`), grouping by the parent's `type` already
represents the full type-distribution of the account tree — children add no
new type information, only balance (already folded into
`computed_balance`, Decision intro / point 5).

### 5. New validation: child `type` must equal parent `type`

`api/src/routes/accounts.ts`:

- New constant `PARENT_TYPE_MISMATCH_ERROR = 'parent and child must have
  same type'`.
- `POST /accounts`: when `body.parent_id` is set, after the existing
  "parent exists" / "max hierarchy depth is 1" checks, reject with 400 if
  `parent.type !== body.type`.
- `PUT /accounts/:id`: compute `resultingParentId` (new `body.parent_id` if
  provided, else `existing.parent_id`) and `resultingType` (new `body.type`
  if provided, else `existing.type`). If `resultingParentId !== null`,
  fetch that parent (reusing the row already fetched when `body.parent_id`
  was provided, via a hoisted `newParent` variable, to avoid a duplicate
  query) and reject with 400 if `parent.type !== resultingType`. This covers
  three cases: creating a child with a mismatched type, changing an existing
  child's `type` away from its parent's, and re-parenting to a
  differently-typed parent.

`api/src/lib/validation.ts` is unchanged — this is a cross-row business
rule (depends on the parent row's data), not a per-field schema constraint,
so it lives in the route handler alongside the existing
`creditCardFieldsValid` / hierarchy-depth checks.

### 6. `AccountForm.tsx`: parent dropdown filtered by current type

Rather than letting the user pick any top-level account as parent and
silently rewriting `type` to match (which would surprise users mid-edit,
e.g. clearing credit-card fields), the "Parent account" dropdown is
**filtered to top-level accounts whose `type` already equals the form's
current `type`**:

```ts
const parentOptions = topLevelAccounts.filter((a) => a.type === type);
```

`topLevelAccounts` (renamed from the old `parentOptions` state) holds all
top-level accounts except self, unfiltered by type, fetched once on load.
`parentOptions` is now derived at render time so it reacts to `type`
changes.

The `type` `<select>` is `disabled` whenever a parent is selected
(`disabled={Boolean(parentId)}`), with helper text "Matches parent
account's type." — since `parentOptions` is already type-filtered, any
selected parent's type equals the current `type` by construction, so
disabling `type` simply prevents the user from creating a now-inconsistent
combination (they must clear the parent first to change `type`).

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Read `currency` from `/config` for `Rp` display, just default it to `'IDR'` | User explicitly asked to remove the `US$` display; `/config.currency` is user-editable and the Accounts page should not be at the mercy of that setting. Hardcoding is simpler and matches the "always Rp" requirement exactly. |
| Keep nested children `<ul>`, just restyle | User explicitly asked for parent-only display; nested list was the thing being removed. |
| Auto-sync `type` to the selected parent's `type` on parent select (considered first) | Silently rewriting a user's `type` choice after they may have already filled type-specific fields (credit limit/billing date) is surprising. Filtering the dropdown by current `type` (Decision §6) avoids the need for any auto-rewrite. |
| Treat "parent and child must have same type" as display-only context (no API change) | User explicitly chose "Add validation" via `AskUserQuestion` — the rule should be enforced at the API boundary, not just assumed by the UI. |
| Add `type` as a field-level Zod refinement in `validation.ts` | The check needs the *parent row's* `type`, which requires a DB read — not expressible as a pure schema refinement. Belongs in the route handler with the other hierarchy checks. |

## Consequences

- Accounts page now always shows `Rp`-formatted amounts; `/config.currency`
  has no effect there (still used for the Config page itself).
- Tapping/clicking anywhere on an account card navigates to its edit page;
  there is no longer a separate "Edit" hit target.
- Account types with no top-level account produce no section — e.g. if
  every `savings` account is a child of a `bank` parent, no "Savings"
  section appears (its balance is folded into the parent `bank` card via
  `computed_balance`).
- Creating/updating an account with `parent_id` set now requires
  `type === parent.type`; the API returns 400
  `"parent and child must have same type"` otherwise.
- In `AccountForm`, the parent dropdown only ever offers same-type
  top-level accounts, so the new API validation can never be triggered via
  the form itself (only via direct API calls, where the 400 + message is
  the contract).
- `api/test/accounts.test.ts`'s "full account hierarchy" test was updated:
  its two child accounts (previously `type: 'savings'` under a `bank`
  parent) are now `type: 'bank'` to satisfy the new rule. Two new tests
  cover the 400 paths (POST mismatch, PUT type-change/re-parent mismatch).

## Follow-ups

- None identified. If a future account type needs a distinct icon or color
  per group header, `formatTypeLabel` (`AccountList.tsx`) is the place to
  extend.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-14 | Initial decision — Rp-only formatting, card-as-link, type-grouped parent-only list, parent/child type-match validation (API + form dropdown filter) |
