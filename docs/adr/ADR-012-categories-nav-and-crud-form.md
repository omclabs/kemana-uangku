# ADR-012: Categories Nav Page and CRUD Form

**Status:** Accepted
**Date:** 2026-06-15
**Version:** 0.1.0

## Context

User asked (caveman): "add new nav, categories. as the account, crud form
for categories." -- interpreted as adding a `/categories` nav item plus
list + create + edit pages mirroring `/accounts`'s `AccountList`/
`AccountForm` (`web/src/pages/account/`), since the categories API
(`api/src/routes/categories.ts`) already supports the same CRUD +
single-level hierarchy + active-children-delete-guard shape as accounts
(ADR-003, ADR-004, ADR-008, ADR-009).

One blocking validation bug was found during implementation:
`categoryCreate.parent_id` was `z.string().uuid().optional()`
(`api/src/lib/validation.ts:6`), but seeded top-level categories use
non-UUID ids like `cat-food`, `cat-inc-salary`
(`api/migrations/0002_seed_defaults.sql`) -- the most common real use (adding
a sub-category under a seeded top-level category) would 400 with a
ZodError. Also, `categoryUpdate` (via `.partial()`) could not accept
`parent_id: null` to un-parent a category, unlike `accountUpdate`.

**Update (v0.1.0):** The v0.0.1 implementation mirrored `AccountList`/
`AccountForm` 1:1 (flat type-grouped list with a `budget_monthly` amount and
"has sub-categories" icon per row, plus a required Monthly budget input in
the form). The user then clarified: "as account doesn[']t mean[t] same
layout. but categories should be more simpler. in the /categories use
collapsible for parent and child. also hide budget from form." The Decision
below describes the resulting (v0.1.0) design; see Changelog for what
changed from v0.0.1.

## Decision

1. **Validation fix** (`api/src/lib/validation.ts`): changed
   `categoryCreate.parent_id` from `z.string().uuid().optional()` to
   `z.string().min(1).nullable().optional()`, matching
   `accountCreate.parent_id`. This accepts seeded non-UUID ids as parents
   and allows `parent_id: null` on PUT to un-parent (the PUT handler at
   `api/src/routes/categories.ts:162-165` already had this code path, it was
   just blocked by the input type).
2. **Types** (`web/src/lib/types.ts`): added
   `CATEGORY_TYPES = ['income', 'expense'] as const`, `CategoryType`,
   `Category`, `CategoryInput` -- same shape as the `Account`/
   `AccountInput`/`ACCOUNT_TYPES` triad, minus account-only fields
   (`balance`, `credit_limit`, `billing_date`, `include_in_total`,
   `computed_balance`). `Category`/`CategoryInput` still include
   `budget_monthly` since the API field exists; only the UI omits it (see
   points 4-5).
3. **Nav** (`web/src/lib/nav.tsx`): added a `/categories` entry
   ("Categories") between "Account" and "Config", using the
   heroicons-outline "tag" icon. Rendered automatically in both `Sidebar`
   and `BottomNav` (both map over `NAV_ITEMS`).
4. **CategoryList** (`web/src/pages/category/CategoryList.tsx`, new):
   fetches `/categories` (active only) and groups top-level categories by
   `CATEGORY_TYPES` (Income / Expense section headers, same as v0.0.1's
   grouping). Each top-level category is a **collapsible row**: a chevron
   button toggles an indented list of its active sub-categories inline
   (`<Link>` to `/categories/:id/edit` each); leaf categories (no
   sub-categories) render a blank spacer instead of a chevron, so names stay
   aligned. A separate "Edit" link on every row navigates to
   `/categories/:id/edit`. No amounts (`budget_monthly`) are shown anywhere
   in the list, and the old "has sub-categories" badge icon is gone -- the
   chevron itself communicates that. "+ Add Category" links to
   `/categories/new`. No header stat boxes.
5. **CategoryForm** (`web/src/pages/category/CategoryForm.tsx`, new):
   fields are Name, Type (select, disabled when a parent is chosen,
   "Matches parent category's type" hint), Parent category (select: "None
   (top-level)" + same-type top-level active categories excluding self), and
   (edit-only) Active checkbox disabled when `hasActiveChildren` with
   "Cannot change: category has active sub-categories." hint -- same guard
   pattern as ADR-009/010. **There is no Monthly budget field.** Edit mode
   also lists Sub-categories (children, name + "Inactive" label if
   soft-deleted, no budget). On submit, POST `/categories` or PUT
   `/categories/:id` with `{name, type, parent_id: parentId || null,
   is_active}` -- `budget_monthly` is omitted from the request body
   entirely; the API defaults it to `0` on create
   (`api/src/routes/categories.ts:85`, `body.budget_monthly ?? 0`) and leaves
   it unchanged on update (`api/src/routes/categories.ts:166`, only set if
   `body.budget_monthly !== undefined`).
6. **Routes** (`web/src/App.tsx`): added `/categories`, `/categories/new`,
   `/categories/:id/edit`, all under `AuthGuard`, following the accounts
   route block.
7. **Tests** (`api/test/categories.test.ts`): added two cases covering the
   validation fix -- POST with `parent_id: 'cat-food'` (seeded, non-UUID)
   returns 201; PUT `{parent_id: null}` on a category that has a parent
   returns 200 with `parent_id: null`.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Leave `categoryCreate.parent_id` as `z.string().uuid()` and have the frontend only offer newly-created (UUID) parents | Defeats the purpose -- users would be unable to add sub-categories under any of the 19 seeded top-level categories, the primary real-world use case. |
| Flat type-grouped list with a `budget_monthly` amount + "has sub-categories" icon per row, and a required Monthly budget input in the form (v0.0.1, mirroring AccountList/AccountForm 1:1) | Rejected per explicit user feedback after the initial implementation: "as account doesn[']t mean[t] same layout... categories should be more simpler... use collapsible for parent and child... also hide budget from form." Replaced with the collapsible tree (point 4) and a budget-free form (point 5). |
| Extract `formatNumberInput`/`unformatNumberInput` to a shared `web/src/lib/format.ts` so `CategoryForm` could reuse them for `budget_monthly` (done in v0.0.1) | Reverted once `budget_monthly` was dropped from `CategoryForm` entirely -- with no second consumer, `lib/format.ts` would be a premature abstraction (violates "three similar lines is better than a premature abstraction"). Helpers restored as local to `AccountForm.tsx`; `lib/format.ts` deleted. Re-extract if/when a second real consumer (e.g. a transactions amount field) appears. |
| Add a "Total Budget" stat box to CategoryList, mirroring ADR-011's Total Assets/Liabilities | Not requested; no natural rollup definition for budgets across income+expense categories (unlike accounts' asset/liability split). Moot in v0.1.0 since no budget is shown at all. |
| Drop the Income/Expense section headers too, for a single flat list of top-level categories | Income vs. expense is intrinsic to how categories are used (`CATEGORY_TYPES`/`type`, ADR-003) and is a one-line grouping, not the per-row complexity (amounts, navigate-away-to-see-children) the user's "simpler" feedback was about. Headers retained at negligible cost; easy to remove later if it still feels heavy. |

## Consequences

- `/categories` now has full CRUD via the UI, but with a deliberately
  **simpler layout than `/accounts`**: a collapsible parent/child tree
  (chevron expand/collapse, Income/Expense headers) instead of
  `AccountList`'s flat grouped list with per-row balances, and `CategoryForm`
  has no Monthly budget field (vs. `AccountForm`'s balance/credit-limit
  inputs).
- The `parent_id` validation fix is a behavior change for `POST /categories`
  and `PUT /categories/:id`: previously-rejected non-UUID `parent_id` values
  (incl. all 19 seeded top-level category ids) are now accepted (subject to
  the existing depth/type/parent-exists checks in `categories.ts`), and
  `PUT` can now un-parent via `parent_id: null`.
- `budget_monthly` is now fully hidden/write-only from the UI's perspective:
  it can only be set via direct API calls or DB seed/migration, defaults to
  `0` on create, and is preserved as-is on update (omitted from the PUT
  body). Re-introducing it in the UI later requires no backend change --
  `categoryCreate`/`categoryUpdate` already support the field; only
  `CategoryForm` (and optionally `CategoryList`) would need a field/column
  re-added.
- Adding a 5th `NAV_ITEMS` entry affects both `Sidebar` and `BottomNav`
  layouts -- flagged for the pending manual browser check (5-item bottom bar
  on mobile).

## Follow-ups

- Manual browser verification pending (same gate as US-018..US-022):
  `/categories` list -- Income/Expense grouping, chevron expand/collapse of
  sub-categories (and that leaf categories render without a chevron, just
  aligned),`/categories/new` create (incl. picking a seeded top-level
  category as parent), `/categories/:id/edit` edit/un-parent/active-toggle-
  with-children-guard (no budget field present), nav appears correctly in
  Sidebar + BottomNav (5 items).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.0.1 | 2026-06-15 | Initial: `/categories` nav + CategoryList/CategoryForm CRUD pages mirroring accounts; `categoryCreate.parent_id` validation fix (`uuid()` -> `min(1).nullable().optional()`) to support seeded non-UUID parent ids and un-parenting via PUT; shared `lib/format.ts` extraction. |
| 0.1.0 | 2026-06-15 | Redesign per user feedback ("as account doesn[']t mean[t] same layout... categories should be more simpler... use collapsible for parent and child... also hide budget from form"): `CategoryList` rewritten as a collapsible parent/child tree (chevron expand/collapse, no `budget_monthly` display, Income/Expense headers retained); `CategoryForm`'s Monthly budget field/state removed entirely (`budget_monthly` omitted from request bodies, API defaults/preserves it); reverted the `lib/format.ts` extraction (no second consumer remains) -- `formatNumberInput`/`unformatNumberInput` restored as local to `AccountForm.tsx`. |
