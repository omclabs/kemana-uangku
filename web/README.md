# kemana-uangku web

Mobile-first React 19 + TypeScript + Tailwind CSS v4 SPA, consuming the [api](../api). See the [root README](../README.md) for the full feature overview and `docs/adr/` (repo root) for design rationale.

## Stack

Vite, React 19, react-router-dom v7 (`BrowserRouter`), Tailwind v4 (`@tailwindcss/vite`, no separate config file), `vite-plugin-pwa`. See `docs/adr/ADR-006` and `ADR-007`.

## Local dev

```bash
npm install
npm run dev
```

Requires the api running (`http://localhost:8787` by default — see [api/README.md](../api/README.md)). Env var: `VITE_API_BASE_URL` (defaults to the local api URL; set explicitly for a deployed api target, see [DEPLOY.md](../DEPLOY.md)).

Or via Docker from the repo root: `make start-dev` (Vite dev server on `http://localhost:5173`, hot reload from bind-mounted `./web`).

Default login: **`admin` / `admin`**. You're prompted to change it on first login.

## Layout

Responsive shell (`docs/adr/ADR-007`): `Sidebar` (desktop, `md:` and up) + `Topbar` (always visible, title/username/logout) + `BottomNav` (mobile only). Nav entries are a single source of truth in `src/lib/nav.tsx`, consumed by all three.

## Pages (`src/pages/`)

| Page | Route | Role |
|---|---|---|
| `Login.tsx` | `/login` | public |
| `Dashboard.tsx` | `/dashboard` | any |
| `ChangePassword.tsx` | (post-login prompt) | any |
| `account/AccountList.tsx`, `AccountForm.tsx` | `/accounts`, `/accounts/:id/edit` | any (reimbursement scoped) |
| `account/AccountTransactions.tsx` | `/accounts/:id/transactions` | any (reimbursement scoped) |
| `account/AccountPayment.tsx` | `/accounts/:id/pay` | admin, user, reimbursement (assigned cards) |
| `category/CategoryList.tsx`, `CategoryForm.tsx` | `/categories`, `/categories/:id/edit` | admin, user |
| `transaction/TransactionList.tsx`, `TransactionForm.tsx` | `/transactions`, `/transactions/:id/edit` | any (reimbursement scoped) |
| `transaction/TransactionReceiptImport.tsx` | `/transactions/import` | admin, user |
| `budget/BudgetPage.tsx` | `/budgets` | admin, user |
| `tracked-item/TrackedItemList.tsx`, `TrackedItemForm.tsx`, `TrackedItemAlerts.tsx` | `/tracked-items`, ... | admin, user |
| `user/UserList.tsx`, `UserForm.tsx` | `/config/users`, ... | admin |
| `Config.tsx`, `ConfigPreferences.tsx` | `/config` | admin (write), any (read) |

## Components (`src/components/`)

| Component | Purpose |
|---|---|
| `AuthGuard.tsx` | Redirects to `/login` if no session token; renders the shell otherwise |
| `RoleGuard.tsx` | Redirects if current user's role isn't in the allowed list |
| `AdminGuard.tsx` | Redirects non-admins away from admin-only pages |
| `Sidebar.tsx` / `Topbar.tsx` / `BottomNav.tsx` | Responsive shell, driven by `lib/nav.tsx` |
| `PageContainer.tsx` / `PageHeader.tsx` | Shared layout wrappers |
| `TileLookup.tsx` | Tile-grid picker for accounts/categories (parent-vs-leaf selection rules) |
| `Calculator.tsx` | Bottom-sheet numeric input for transaction amounts |
| `ToggleSwitch.tsx` / `StyledSelect.tsx` / `SummaryStrip.tsx` | Shared form/display primitives |

**Client-side guards (`AuthGuard`/`RoleGuard`/`AdminGuard`) are UX only** — the actual access control is enforced server-side (`api/src/lib/access.ts`). Don't rely on hiding a nav item as a security boundary.

## Key libs (`src/lib/`)

- `api.ts` — `apiFetch` helper, session token storage (`localStorage`)
- `types.ts` — shared API response/request types, kept in sync with `api/src/lib/validation.ts` by hand
- `nav.tsx` — single source of truth for nav entries (route, icon, label, allowed roles)
- `calculator.ts` — pure reducer behind the `Calculator` component

## Testing

No frontend test suite currently exists — verify changes manually against a running `api` (`make start-dev`, then check the golden path in a browser).
