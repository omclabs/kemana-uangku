# ADR-009: Account Active/Inactive Toggle, Has-Children Icon, and Sub-accounts Section

**Status:** Accepted
**Date:** 2026-06-14
**Version:** 1.0.0

## Context

Following ADR-008 (accounts list redesign), `/accounts` only renders top-level
accounts and links each card straight to `/accounts/:id/edit`. Child accounts
are folded into the parent's `computed_balance` and have no card of their own
-- ADR-008 noted this means a child account has no UI path to be edited or
re-activated once it exists.

The user asked for three additions, all scoped to the account pages:

1. An active/inactive toggle for an account.
2. An icon on `/accounts` cards when the account has child accounts.
3. On the account edit page (`/accounts/:id/edit`, the only "detail" view for
   an account), if the account has children, show them as cards below the
   Save/Cancel buttons, each linking to that child's edit page.

Point 3 directly closes the child-edit-reachability gap flagged in ADR-008:
a child can now be reached via its parent's edit page.

`api/src/routes/accounts.ts` `GET /` already supports `include_inactive=true`
(returns rows regardless of `is_active`) and `PUT /:id` already accepts
`is_active` (validated by `accountUpdate` in `api/src/lib/validation.ts`,
ADR-005/ADR-004 era) -- no backend changes were needed for any of the three
points.

## Decision

### 1. Active/inactive toggle in `AccountForm.tsx` (edit mode only)

A checkbox styled like the existing "Include in net worth total" toggle:

```tsx
{isEdit && (
  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
    <input
      type="checkbox"
      className="h-4 w-4"
      checked={isActive}
      onChange={(e) => setIsActive(e.target.checked)}
    />
    Active
  </label>
)}
```

`isActive` is seeded from `account.is_active === 1` on load and sent as
`is_active` in the `PUT /accounts/:id` body. Not shown when creating a new
account (`!isEdit`) -- new accounts are always created active, matching the
API default (`include_in_total`/`is_active` default to `1` when omitted on
`POST`).

`AccountInput` (`web/src/lib/types.ts`) gained an optional `is_active?:
boolean` field so the form body can carry it. `accountCreate` does not
declare `is_active`, but Zod's default "strip unknown keys" behavior means
the field is silently dropped if it were ever sent on `POST` -- it never is,
since the checkbox is `isEdit`-only.

### 2. Has-children icon on `/accounts` cards

`AccountList.tsx` already fetches the full active account list (parents +
children) in one request. For each top-level account:

```ts
hasChildren={accounts.some((a) => a.parent_id === account.id)}
```

`AccountRow` renders a small heroicons-style "squares" icon (`h-4 w-4
text-gray-400`, `aria-label`/`<title>` "Has sub-accounts") next to the
account name when `hasChildren` is true, following the same inline-SVG
convention as `web/src/lib/nav.tsx` / `Sidebar.tsx`.

### 3. Sub-accounts section on the account edit page

`AccountForm.tsx` now fetches `/accounts?include_inactive=true` (previously
`/accounts`, which defaults to `is_active=1` only) into a renamed `accounts`
state (full list, was `topLevelAccounts`). Two values are derived from it at
render time:

```ts
const topLevelAccounts = accounts.filter(
  (a) => a.parent_id === null && a.id !== id && a.is_active === 1
);
const parentOptions = topLevelAccounts.filter((a) => a.type === type);
const children = accounts.filter((a) => a.parent_id === id);
```

`topLevelAccounts` keeps its prior `is_active === 1` behavior for the parent
dropdown (Decision intro of ADR-008, point 6) -- an inactive account is never
offered as a parent, even though it's now present in the underlying fetch.

`children` is **not** filtered by `is_active` -- inactive children are shown
too, each as a card (name, `Rp`-formatted `computed_balance`, "Inactive"
label when `is_active === 0`) linking to `/accounts/:id/edit`, rendered below
the Save/Cancel button row when `isEdit && children.length > 0`:

```tsx
{isEdit && children.length > 0 && (
  <div className="mt-6">
    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
      Sub-accounts
    </h2>
    <ul className="space-y-2">
      {children.map((child) => (
        <li key={child.id}>
          <Link to={`/accounts/${child.id}/edit`} ...>
            {/* name, computed_balance, Inactive badge */}
          </Link>
        </li>
      ))}
    </ul>
  </div>
)}
```

Showing inactive children here is intentional: it is the only remaining path
to reach a deactivated child account and flip its "Active" toggle (point 1)
back on.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Show the active/inactive toggle on `/accounts` cards (e.g. a switch per row) | The card is now a single click-target navigating to edit (ADR-008); adding an interactive control inside it would conflict with that. The edit page is the natural place for account-level settings. |
| Keep `/accounts` fetch as `/accounts` (active only) and add a second request for children in `AccountForm` | A second request is unnecessary -- `/accounts?include_inactive=true` already returns the full tree (parents + all children) in one call, which both `topLevelAccounts`/`parentOptions` and the new `children` derive from. |
| Filter `children` to `is_active === 1` (hide inactive children too) | Would leave deactivated child accounts permanently unreachable in the UI -- the exact gap ADR-008 flagged, just shifted from "all children" to "inactive children". Showing them (with an "Inactive" badge) gives a path back via the toggle. |
| Add a global "show inactive accounts" filter to `/accounts` | Out of scope for this request; `/accounts` continues to show only active top-level accounts (unchanged from ADR-008). Only the edit page's sub-accounts section surfaces inactive rows. |

## Consequences

- `AccountForm.tsx` makes one `/accounts?include_inactive=true` request
  instead of `/accounts`; `topLevelAccounts` (parent dropdown source)
  continues to exclude inactive accounts via an explicit `is_active === 1`
  filter, so dropdown behavior from ADR-008 is unchanged.
- A child account, once reachable only via the now-removed nested list
  (pre-ADR-008) and unreachable after ADR-008, is reachable again via its
  parent's "Sub-accounts" section -- including when inactive.
- `/accounts` cards visually indicate which top-level accounts have
  sub-accounts via the new icon; clicking the card still navigates to that
  account's own edit page (the sub-accounts live one click further, on that
  edit page).
- **Known remaining gap**: a *top-level* account that is deactivated still
  has no card on `/accounts` (which shows active top-level accounts only) and
  is not any other account's child, so it has no UI path back to its edit
  page to be re-activated. This existed before this ADR (soft-delete via
  `DELETE /accounts/:id` already produced inactive top-level rows with no UI
  affordance) and is unchanged by it. Not addressed here -- flagged as a
  follow-up.

## Follow-ups

- Top-level inactive accounts have no UI entry point (see Consequences). If
  needed, a future change could add an "Inactive accounts" section/filter to
  `/accounts` (likely via `?include_inactive=true` plus a visual
  active/inactive split), but this was not requested and is left for a
  separate decision.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-14 | Initial decision -- `is_active` toggle in `AccountForm` (edit only), has-children icon on `/accounts` cards, sub-accounts section (incl. inactive children) below Save/Cancel on the edit page |
