# ADR-010: Formatted Number Inputs and Active-Toggle Active-Children Guard

**Status:** Accepted
**Date:** 2026-06-14
**Version:** 1.0.0

## Context

Immediate follow-up to ADR-009 (active/inactive toggle, has-children icon,
sub-accounts section), same session. The user asked for three more changes
to `AccountForm.tsx` (`/accounts/:id/edit`, "account detail"):

1. Format numbers as the user types them in the account detail page.
2. If the account being edited has an active child, disable the "Active"
   toggle.
3. Also format the credit limit input.

Point 2 directly resolves the inconsistency ADR-009 left open implicitly:
`PUT /accounts/:id` already allowed `is_active: false` with no check, while
`DELETE /accounts/:id` (soft delete) rejects with 409 `"cannot delete: row
has active children"` when `activeChildren.length > 0`
(`api/src/routes/accounts.ts`). Without a guard, the new "Active" checkbox
from ADR-009 could put an account into a state DELETE explicitly forbids:
inactive parent with active children.

## Decision

### 1 & 3. Live-formatted Balance and Credit limit inputs

Two helpers added to `AccountForm.tsx`:

```ts
function formatNumberInput(raw: string): string   // "1500000.5" -> "1.500.000,5"
function unformatNumberInput(display: string): string // "1.500.000,5" -> "1500000.5"
```

- `formatNumberInput` takes the raw `Number()`-compatible string held in
  state (e.g. `"1500000.5"`, `"-200000"`) and renders it id-ID style: `.` as
  thousands separator, `,` as decimal separator, leading `-` preserved.
- `unformatNumberInput` is the inverse, run on every `onChange`, so state
  always stays a plain `Number()`-parseable string.
- Both the **Balance** and **Credit limit** `<input>` elements changed from
  `type="number" step="any"` (and `min="0"` on credit limit) to `type="text"
  inputMode="decimal"`, with `value={formatNumberInput(state)}` and
  `onChange={(e) => setState(unformatNumberInput(e.target.value))}`.
- `balance` is `REAL` in SQLite (`api/migrations/0001_init.sql`), so an
  existing account can have a fractional balance (e.g. `1500000.5`). The
  helpers handle the `.` decimal point explicitly (splitting into integer /
  decimal parts before grouping) so such a value round-trips as
  `1.500.000,5` instead of being corrupted into `15000005` by a naive
  "strip all non-digits" grouping.
- `min="0"` on credit limit was dropped (meaningless on `type="text"`);
  `credit_limit: z.number().nonnegative()` is still enforced server-side and
  any rejection surfaces via the existing `error` state, unchanged.

### 2. Disable "Active" toggle when the account has active children

```ts
const hasActiveChildren = children.some((c) => c.is_active === 1);
```

The "Active" checkbox (ADR-009) gains `disabled={hasActiveChildren}`, and a
helper line is shown underneath when disabled:

```tsx
{hasActiveChildren && (
  <p className="mt-1 text-xs text-gray-500">
    Cannot change: account has active sub-accounts.
  </p>
)}
```

This mirrors the `DELETE /accounts/:id` active-children guard on the `PUT
/accounts/:id` `is_active` path: an account with at least one active child
cannot have its own `is_active` flipped via the form. To deactivate it, the
user must first deactivate (or remove) its active children.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Format on blur only (re-format when the field loses focus) | User asked for formatting "as inputted" -- live formatting while typing matches that and matches how the read-only `Rp` balances are already displayed. |
| Treat balance/credit limit as integer-only (strip `.` unconditionally, like a pure thousands-grouping function) | `balance` is `REAL`; an account can already hold a fractional value. Stripping `.` as if it were always a thousands separator would silently multiply such a value by powers of ten on next save. The helpers special-case the decimal point instead. |
| Server-side: reject `PUT is_active=false` with 409 when `activeChildren.length>0` (mirroring DELETE's check exactly) | Would duplicate the active-children query already run by `accountUpdate`/`DELETE` in a new code path, and would surface as a generic API error rather than inline UI guidance. Disabling the checkbox client-side (with explanatory text) gives the same outcome with better UX; the field is simply not editable rather than erroring after submit. Server-side enforcement can be added later if the toggle is ever exposed outside this form. |
| Cascade-deactivate all active children when a parent's "Active" is turned off | Surprising bulk side effect on accounts the user did not directly touch, not requested. Blocking (current decision) is consistent with how `DELETE` already handles this case (block, don't cascade). |

## Consequences

- Balance and Credit limit fields now show id-ID grouped values
  (`1.500.000,5`) live while typing; the values sent in the `PUT`/`POST`
  body are unchanged (`Number(balance)`, `Number(creditLimit)`).
- Typing in the middle of a long number can move the cursor to the end of
  the field once grouping separators are (re)inserted -- a known minor
  tradeoff of live-grouped numeric inputs, not addressed here.
- An account with >=1 active child cannot have its "Active" checkbox
  toggled (in either direction) from this form; the checkbox is disabled
  with a one-line explanation. This brings the `PUT is_active` path in line
  with the existing `DELETE` active-children guard.
- ADR-009's previously flagged "known remaining gap" (deactivated top-level
  accounts have no UI path back to their edit page) is unchanged by this
  ADR.

## Follow-ups

- None new. ADR-009's follow-up (possible future "Inactive accounts"
  section/filter on `/accounts`) still stands, unrequested.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-14 | Initial decision -- live id-ID formatted Balance/Credit limit inputs (`formatNumberInput`/`unformatNumberInput`), and "Active" checkbox disabled (with explanatory text) when the account has >=1 active child |
