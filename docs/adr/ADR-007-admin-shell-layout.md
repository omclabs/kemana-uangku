# ADR-007: Admin Shell Layout (Toolbox Admin template)

**Status:** Accepted
**Date:** 2026-06-14
**Version:** 1.0.0

## Context

`web/` (ADR-006) shipped with a mobile-first shell: a single top header
(`AuthGuard.tsx`) with app name + Logout, content, and a fixed `BottomNav`
with 4 tabs (Dashboard, Transaction, Account, Config). No desktop layout
existed — on wide screens, content stretched edge-to-edge below a thin
header, with the bottom nav still pinned across the full width.

The user asked to "amend the layout" using the ThemeWagon **Toolbox Admin**
free Tailwind admin template
(https://themewagon.com/themes/toolbox-admin-free-responsive-tailwind-css-admin-template/,
live demo: https://www.tailwindtoolbox.com/templates/admin-template-demo.php)
as a reference. That template's structure: a desktop sidebar nav that
collapses into a fixed bottom nav on small screens, a top header with search
+ user menu, and card-based content (white cards, rounded corners,
`shadow-sm`) on a neutral gray background.

## Decision

### 1. Full responsive shell — `Sidebar` (desktop) + `Topbar` + `BottomNav` (mobile)

Adopted via `AskUserQuestion` ("Full shell: sidebar+header+bottom-nav") over
a colors/cards-only restyle. Concretely:

- `web/src/components/Sidebar.tsx` (new) — fixed `w-56` column, `hidden
  md:flex`, vertical nav using shared `NAV_ITEMS`, app name header.
- `web/src/components/Topbar.tsx` (new) — replaces the inline `<header>`
  previously in `AuthGuard.tsx`. Shows the current section title (derived
  from `location.pathname` via `NAV_ITEMS`, prefix match) on the left;
  username (new `getUser()`, `web/src/lib/api.ts`) + Logout on the right.
  Visible at all breakpoints.
- `web/src/components/BottomNav.tsx` — unchanged 4-tab bar, now `md:hidden`
  so it doesn't double up with `Sidebar` on desktop.
- `web/src/components/AuthGuard.tsx` — rewritten as a `flex` row:
  `Sidebar` + a column of `Topbar` / `<main>` / `BottomNav`.

This is framed as an **extension** of ADR-006 §1's mobile-first design, not
a replacement: the Toolbox Admin template itself collapses its sidebar into
a bottom nav below its mobile breakpoint — i.e. the existing bottom-nav
design *is* that template's mobile behavior. The desktop sidebar is new;
mobile is unchanged structurally (still bottom-nav, now `md:hidden`).

**Breakpoint:** `md:` (768px, Tailwind default) — `Sidebar` appears and
`BottomNav` disappears at `md:` and above.

### 2. Shared `NAV_ITEMS` — single source of truth for nav entries

`web/src/lib/nav.tsx` (new) exports `NAV_ITEMS`, the 4 route/icon/label
tuples (Dashboard, Transaction, Account, Config) previously inlined as
`TABS` in `BottomNav.tsx`. Both `Sidebar` and `BottomNav` import it, and
`Topbar` uses it to derive the page title from the route — avoids the two
navs (and the title logic) drifting out of sync.

### 3. No new color tokens — structural change only

`web/src/index.css` already has no custom theme tokens beyond Tailwind's
defaults, and the existing palette (`blue-600` accent, white / `gray-50` /
`gray-200` surfaces, `rounded-lg`, `shadow-sm` — see `Login.tsx`,
`AccountList.tsx`) already matches the Toolbox Admin "clean minimal" look.
This change is shell structure (`Sidebar`, `Topbar`, `PageContainer`) plus
reuse of existing utility classes — no new Tailwind theme config, no new
color values.

### 4. No decorative search input in `Topbar`

The Toolbox Admin template's top header includes a search box. This app has
no search feature anywhere (no search endpoint, no searchable list view), so
a non-functional search input would be dead UI. `Topbar` = title + username +
Logout only. (Flagged to the user during planning before implementation; no
objection raised.)

### 5. Sidebar nav items = existing 4 only

The template's demo includes unrelated nav entries (Tasks, Messages,
Payments, Analytics, etc.). None map to a feature in this app, so `Sidebar`
reuses exactly the same 4 items as `BottomNav` (via `NAV_ITEMS`) — no
placeholder links to non-existent pages.

### 6. `PageContainer` — applied to 3 of 5 authenticated pages

`web/src/components/PageContainer.tsx` (new) — `mx-auto w-full max-w-3xl
p-4`, so content doesn't stretch full-width next to the desktop sidebar.
Applied to:

- `AccountList.tsx` (was root `<div className="p-4">`)
- `AccountForm.tsx` (was root `<div className="p-4">`)
- `Config.tsx` (was root `<div className="p-4">`)

**Not applied** to `Dashboard.tsx` / `Transaction.tsx` — both are "coming
soon" placeholders with root `<div className="flex h-full items-center
justify-center p-6 text-center">` (centered, not `p-4`). Wrapping in
`max-w-3xl` would left-align the centered placeholder text. Left unchanged;
revisit once these pages have real content.

`Login.tsx` is rendered outside `AuthGuard` (see `App.tsx` route table) and
is unaffected by this ADR.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Restyle only (colors/cards/typography), keep bottom-nav-only structure | User explicitly chose the full shell option; restyle-only would leave desktop screens with edge-to-edge content and no use of the available width — the main visual gap vs. the template. |
| Adopt all of the template's nav items (Tasks, Messages, Payments, Analytics, search) | Would add links to non-existent pages and a non-functional search box — half-finished UI with no backing feature. |
| New Tailwind theme tokens / custom palette to match template colors exactly | Existing palette already matches the template's "clean minimal" look (blue-600, white/gray-50/gray-200, rounded-lg, shadow-sm); a recolor would be unjustified churn. |
| Wrap `Dashboard`/`Transaction` in `PageContainer` for consistency | Their root is a centered placeholder (`flex items-center justify-center`), not `p-4`; `max-w-3xl` would break the centering and look like a layout bug. |
| Separate `useNavTitle` hook instead of `NAV_ITEMS` prefix-match in `Topbar` | `NAV_ITEMS.find(item => pathname.startsWith(item.to))` is a 1-line lookup against data already needed by `Sidebar`/`BottomNav` — a separate hook would be an abstraction for a single call site. |

## Consequences

- Desktop (`md:` and up): `Sidebar` + `Topbar` + content, no `BottomNav`.
  Mobile (below `md:`): `Topbar` + content + `BottomNav`, no `Sidebar`. No
  double navigation at any breakpoint.
- `Topbar`'s title derives from route prefix match against `NAV_ITEMS`; adding
  a new top-level route requires adding it to `NAV_ITEMS` (single file) for
  `Sidebar`, `BottomNav`, and `Topbar` title to all stay in sync.
- `getUser()` (`web/src/lib/api.ts`) reads back the `user` key that
  `setSession` (ADR-006) already wrote to `localStorage` but was previously
  never read. Returns `null` on missing/malformed data — `Topbar` simply
  omits the username in that case (non-fatal; `AuthGuard` already redirects
  to `/login` when there's no token).
- Dashboard/Transaction remain unstyled placeholders; the template's
  stat-card/chart widgets were not adopted (no data source yet) — open
  follow-up for when those pages are specced.

## Follow-ups

- When Dashboard/Transaction get real content, decide then whether they use
  `PageContainer` or a wider/different layout (e.g. stat-card grid spanning
  more of the sidebar-adjacent width).
- If a search feature is ever added, `Topbar` is the natural place for the
  search input flagged in Decision §4.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-14 | Initial decision — full responsive shell (Sidebar/Topbar/BottomNav), shared NAV_ITEMS, PageContainer on 3 pages |
