import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';
import { categoryVisual, initial } from '../../lib/categories';
import { ACCOUNT_TYPES, type Account } from '../../lib/types';
import PageContainer from '../../components/PageContainer';
import { PlusIcon } from '../../components/icons';

const formatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function formatTypeLabel(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function AccountList() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<Account[]>('/accounts')
      .then((accountList) => {
        if (cancelled) return;
        setAccounts(accountList);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load accounts');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const topLevel = accounts.filter((a) => a.parent_id === null);
  const groups = ACCOUNT_TYPES.map((type) => ({
    type,
    accounts: topLevel.filter((a) => a.type === type),
  })).filter((group) => group.accounts.length > 0);

  const included = topLevel.filter((a) => a.include_in_total === 1);
  const totalAssets = included
    .filter((a) => a.type !== 'credit_card' && a.type !== 'loan')
    .reduce((sum, a) => sum + a.computed_balance, 0);
  const totalLiabilities = included.reduce((sum, a) => {
    if (a.type === 'credit_card') return sum + ((a.credit_limit ?? 0) - a.computed_balance);
    if (a.type === 'loan') return sum + Math.abs(a.computed_balance);
    return sum;
  }, 0);

  return (
    <PageContainer>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Accounts</h1>
        <Link
          to="/accounts/new"
          aria-label="Add account"
          className="rounded-2xl bg-gradient-to-br from-accent to-accent-2 p-2.5 text-white shadow-[0_8px_16px_-6px_var(--accent)]"
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
      </div>

      {!loading && !error && (
        <div className="mb-4 flex gap-3">
          <div className="min-w-0 flex-1 rounded-[18px] border border-line bg-surface p-3.5">
            <div className="flex items-center gap-2">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-income-soft text-income">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M12 5l-7 7M12 5l7 7" />
                  </svg>
                </span>
              <span className="text-xs font-semibold text-muted">Assets</span>
            </div>
            <p className="mt-2 text-[15.5px] font-extrabold text-ink">{formatter.format(totalAssets)}</p>
          </div>
          <div className="min-w-0 flex-1 rounded-[18px] border border-line bg-surface p-3.5">
            <div className="flex items-center gap-2">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-expense-soft text-expense">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M12 19l-7-7M12 19l7-7" />
                  </svg>
                </span>
              <span className="text-xs font-semibold text-muted">Liabilities</span>
            </div>
            <p className="mt-2 text-[15.5px] font-extrabold text-ink">{formatter.format(totalLiabilities)}</p>
          </div>
        </div>
      )}

      {loading && <p className="text-center text-muted">Loading...</p>}
      {error && <p className="text-center text-expense">{error}</p>}

      {!loading && !error && (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.type}>
              <h2 className="mb-2 border-b border-line pb-1 text-sm font-semibold uppercase tracking-wide text-muted">
                {formatTypeLabel(group.type)}
              </h2>
              <ul className="space-y-2">
                {group.accounts.map((account) => (
                  <li key={account.id}>
                    <Link
                      to={`/accounts/${account.id}/edit`}
                      className="block rounded-2xl bg-surface p-3 shadow-[0_4px_16px_-6px_rgba(60,45,110,.12)] hover:bg-surface-2"
                    >
                      <AccountRow
                        account={account}
                        hasChildren={accounts.some((a) => a.parent_id === account.id)}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {groups.length === 0 && (
            <p className="text-center text-muted">No accounts yet.</p>
          )}
        </div>
      )}
    </PageContainer>
  );
}

function AccountRow({ account, hasChildren }: { account: Account; hasChildren: boolean }) {
  const visual = categoryVisual(account.name);

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px] text-[15px] font-bold"
          style={{ background: visual.soft, color: visual.color }}
        >
          {initial(account.name)}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium text-ink">
            <span className="truncate">{account.name}</span>
            {hasChildren && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 shrink-0 text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-label="Has sub-accounts"
              >
                <title>Has sub-accounts</title>
                <path d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            )}
          </p>
          {!account.include_in_total && (
            <p className="text-xs text-muted">Excluded from total</p>
          )}
        </div>
      </div>
      <span
        className={`shrink-0 text-sm font-medium ${
          account.computed_balance < 0 ? 'text-expense' : 'text-ink'
        }`}
      >
        {formatter.format(account.computed_balance)}
      </span>
    </div>
  );
}
