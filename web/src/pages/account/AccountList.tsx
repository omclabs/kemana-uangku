import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';
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
        <h1 className="text-xl font-semibold text-gray-900">Accounts</h1>
        <Link
          to="/accounts/new"
          aria-label="Add account"
          className="rounded-md bg-blue-600 p-2 text-white"
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
      </div>

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

      {loading && <p className="text-center text-gray-500">Loading...</p>}
      {error && <p className="text-center text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.type}>
              <h2 className="mb-2 border-b border-gray-200 pb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {formatTypeLabel(group.type)}
              </h2>
              <ul className="space-y-2">
                {group.accounts.map((account) => (
                  <li key={account.id}>
                    <Link
                      to={`/accounts/${account.id}/edit`}
                      className="block rounded-lg bg-white p-3 shadow-sm hover:bg-gray-50"
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
            <p className="text-center text-gray-500">No accounts yet.</p>
          )}
        </div>
      )}
    </PageContainer>
  );
}

function AccountRow({ account, hasChildren }: { account: Account; hasChildren: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-medium text-gray-900">
          <span className="truncate">{account.name}</span>
          {hasChildren && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 shrink-0 text-gray-400"
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
          <p className="text-xs text-gray-500">Excluded from total</p>
        )}
      </div>
      <span
        className={`shrink-0 text-sm font-medium ${
          account.computed_balance < 0 ? 'text-red-600' : 'text-gray-900'
        }`}
      >
        {formatter.format(account.computed_balance)}
      </span>
    </div>
  );
}
