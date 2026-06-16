import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageContainer from '../components/PageContainer';
import { ApiError, apiFetch, getUser } from '../lib/api';
import { categoryVisual, initial } from '../lib/categories';
import type { Account, Category, Transaction } from '../lib/types';

const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const DONUT_COLORS = ['#F59E0B', '#3B82F6', '#8B5CF6', '#F43F5E', '#10B981'];

function shortCurrency(value: number): string {
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1).replace('.', ',')}jt`;
  if (value >= 1_000) return `Rp ${Math.round(value / 1_000)}rb`;
  return idr.format(value);
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const user = getUser();

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiFetch<Account[]>('/accounts'),
      apiFetch<Transaction[]>('/transactions'),
      apiFetch<Category[]>('/categories?include_inactive=true'),
    ])
      .then(([accountList, transactionList, categoryList]) => {
        if (cancelled) return;
        setAccounts(accountList);
        setTransactions(transactionList);
        setCategories(categoryList);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load dashboard');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const topLevelAccounts = accounts.filter((account) => account.parent_id === null && account.include_in_total === 1);
  const totalBalance = topLevelAccounts
    .filter((account) => account.type !== 'credit_card' && account.type !== 'loan')
    .reduce((sum, account) => sum + account.computed_balance, 0);

  const now = new Date();
  const monthTransactions = transactions.filter((transaction) => {
    const date = new Date(transaction.date * 1000);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const income = monthTransactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expense = monthTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  function categoryName(id: string | null): string {
    return categories.find((category) => category.id === id)?.name ?? 'Other';
  }

  const spendingByCategory = new Map<string, number>();
  monthTransactions
    .filter((transaction) => transaction.type === 'expense')
    .forEach((transaction) => {
      const name = categoryName(transaction.category_id);
      spendingByCategory.set(name, (spendingByCategory.get(name) ?? 0) + transaction.amount);
    });

  const topCategories = [...spendingByCategory.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([name, amount], index) => ({
      name,
      amount,
      pct: expense > 0 ? Math.round((amount / expense) * 100) : 0,
      color: DONUT_COLORS[index],
    }));

  const segments = topCategories.reduce<{
    offset: number;
    items: { color: string; dash: string; offset: number }[];
  }>(
    (state, category) => ({
      offset: state.offset + category.pct,
      items: [
        ...state.items,
        {
          color: category.color,
          dash: `${category.pct} ${100 - category.pct}`,
          offset: 25 - state.offset,
        },
      ],
    }),
    { offset: 0, items: [] }
  ).items;

  const recentTransactions = monthTransactions.slice(0, 4);

  return (
    <PageContainer>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-[17px] font-extrabold text-white">
            {initial(user?.username ?? 'A')}
          </div>
          <div>
            <p className="text-[12.5px] font-medium text-muted">Good day,</p>
            <p className="text-[17px] font-extrabold tracking-tight text-ink">{user?.username ?? 'there'}</p>
          </div>
        </div>
      </div>

      {loading && <p className="text-center text-muted">Loading...</p>}
      {error && <p className="text-center text-expense">{error}</p>}

      {!loading && !error && (
        <div className="space-y-3.5">
          <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-accent to-accent-2 p-[22px] text-white shadow-[0_16px_30px_-14px_var(--accent)]">
            <div className="pointer-events-none absolute -right-8 -top-16 h-44 w-44 rounded-full bg-white/[0.13]" />
            <div className="relative">
              <p className="text-[13px] font-medium opacity-85">Total Balance</p>
              <p className="mt-1 text-[30px] font-extrabold tracking-tight">{idr.format(totalBalance)}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 rounded-[18px] border border-line bg-surface p-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-income-soft text-income">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M12 5l-7 7M12 5l7 7" />
                  </svg>
                </span>
                <span className="text-xs font-semibold text-muted">Income</span>
              </div>
              <p className="mt-2 text-[15.5px] font-extrabold text-ink">{idr.format(income)}</p>
            </div>
            <div className="flex-1 rounded-[18px] border border-line bg-surface p-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-expense-soft text-expense">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M12 19l-7-7M12 19l7-7" />
                  </svg>
                </span>
                <span className="text-xs font-semibold text-muted">Expenses</span>
              </div>
              <p className="mt-2 text-[15.5px] font-extrabold text-ink">{idr.format(expense)}</p>
            </div>
          </div>

          {topCategories.length > 0 && (
            <div className="rounded-[22px] border border-line bg-surface p-[18px]">
              <p className="text-[15px] font-extrabold text-ink">Spending this month</p>
              <div className="mt-3.5 flex items-center gap-[18px]">
                <div className="relative h-[104px] w-[104px] shrink-0">
                  <svg viewBox="0 0 36 36" className="h-[104px] w-[104px]">
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--line)" strokeWidth="4" />
                    {segments.map((segment, index) => (
                      <circle
                        key={index}
                        cx="18"
                        cy="18"
                        r="15.915"
                        fill="none"
                        stroke={segment.color}
                        strokeWidth="4.4"
                        strokeDasharray={segment.dash}
                        strokeDashoffset={segment.offset}
                      />
                    ))}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[9.5px] font-semibold text-muted">Spent</span>
                    <span className="text-[14.5px] font-extrabold text-ink">{shortCurrency(expense)}</span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2.5">
                  {topCategories.map((category) => (
                    <div key={category.name} className="flex items-center gap-2 text-[12.5px]">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: category.color }} />
                      <span className="flex-1 truncate font-semibold text-ink">{category.name}</span>
                      <span className="font-bold text-muted">{category.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[15px] font-extrabold text-ink">Recent</p>
              <Link to="/transactions" className="text-[12.5px] font-bold text-accent">
                See all
              </Link>
            </div>
            {recentTransactions.map((transaction) => {
              const name = transaction.note || categoryName(transaction.category_id);
              const visual = categoryVisual(categoryName(transaction.category_id));
              const isIncome = transaction.type === 'income';
              return (
                <Link
                  key={transaction.id}
                  to={`/transactions/${transaction.id}/edit`}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span
                    className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px] text-[15px] font-bold"
                    style={{ background: visual.soft, color: visual.color }}
                  >
                    {initial(name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{name}</p>
                    <p className="truncate text-xs text-muted">{categoryName(transaction.category_id)}</p>
                  </div>
                  <span className={`whitespace-nowrap text-sm font-extrabold ${isIncome ? 'text-income' : 'text-expense'}`}>
                    {isIncome ? '+' : '-'}
                    {idr.format(transaction.amount)}
                  </span>
                </Link>
              );
            })}
            {recentTransactions.length === 0 && <p className="py-6 text-center text-muted">No transactions this month.</p>}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
