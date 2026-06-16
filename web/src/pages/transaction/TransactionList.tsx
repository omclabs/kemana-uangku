import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { categoryVisual, initial } from '../../lib/categories';
import { ApiError, apiFetch } from '../../lib/api';
import type { Account, Category, Transaction } from '../../lib/types';
import PageContainer from '../../components/PageContainer';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, TrashIcon } from '../../components/icons';

const formatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const headerFormatter = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const monthFormatter = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric',
});

const SWIPE_REVEAL = 72;
const TAP_THRESHOLD = 8;

function dateKey(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function groupByDate(transactions: Transaction[]): { key: string; date: number; items: Transaction[] }[] {
  const groups: { key: string; date: number; items: Transaction[] }[] = [];
  for (const t of transactions) {
    const key = dateKey(t.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(t);
    } else {
      groups.push({ key, date: t.date, items: [t] });
    }
  }
  return groups;
}

export default function TransactionList() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiFetch<Transaction[]>('/transactions'),
      apiFetch<Account[]>('/accounts?include_inactive=true'),
      apiFetch<Category[]>('/categories?include_inactive=true'),
    ])
      .then(([transactionList, accountList, categoryList]) => {
        if (cancelled) return;
        setTransactions(transactionList);
        setAccounts(accountList);
        setCategories(categoryList);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load transactions');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function accountName(id: string | null): string {
    if (!id) return '';
    return accounts.find((a) => a.id === id)?.name ?? 'Unknown';
  }

  function categoryName(id: string | null): string {
    if (!id) return '';
    return categories.find((c) => c.id === id)?.name ?? 'Unknown';
  }

  async function markPaid(id: string) {
    setError(null);
    try {
      const updated = await apiFetch<Transaction>(`/transactions/${id}/pay`, { method: 'PATCH' });
      setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to mark as paid');
    }
  }

  async function deleteTransaction(id: string) {
    if (!window.confirm('Delete this transaction? Account balances will be reversed.')) {
      return;
    }
    setError(null);
    try {
      await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
      setTransactions((prev) => prev.filter((t) => t.id !== id && t.parent_transaction_id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete transaction');
    }
  }

  const visibleTransactions = transactions.filter((transaction) => {
    const date = new Date(transaction.date * 1000);
    return (
      date.getMonth() === selectedMonth.getMonth() &&
      date.getFullYear() === selectedMonth.getFullYear()
    );
  });
  const totalIncome = visibleTransactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalExpense = visibleTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const topLevelAccounts = accounts.filter(
    (account) => account.parent_id === null && account.include_in_total === 1
  );
  const totalAssets = topLevelAccounts
    .filter((account) => account.type !== 'credit_card' && account.type !== 'loan')
    .reduce((sum, account) => sum + account.computed_balance, 0);
  const totalLiabilities = topLevelAccounts.reduce((sum, account) => {
    if (account.type === 'credit_card') return sum + ((account.credit_limit ?? 0) - account.computed_balance);
    if (account.type === 'loan') return sum + Math.abs(account.computed_balance);
    return sum;
  }, 0);
  const netWorth = totalAssets - totalLiabilities;
  const netWorthDisplay = formatter.format(Math.abs(netWorth));
  const groups = groupByDate(visibleTransactions);
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const canGoNext = selectedMonth.getTime() < currentMonth;

  function changeMonth(offset: number) {
    setSelectedMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <PageContainer>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Transactions</h1>
        <Link
          to="/transactions/new"
          aria-label="Add transaction"
          className="rounded-2xl bg-gradient-to-br from-accent to-accent-2 p-2.5 text-white shadow-[0_8px_16px_-6px_var(--accent)]"
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
      </div>

      {!loading && !error && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-[18px] border border-line bg-surface p-3.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-income-soft text-income">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M12 5l-7 7M12 5l7 7" />
                </svg>
              </span>
              <span className="truncate text-xs font-semibold text-muted">Income</span>
            </div>
            <p className="mt-2 truncate whitespace-nowrap text-[clamp(0.72rem,1.8vw,0.97rem)] font-extrabold leading-none tracking-tight text-ink">
              {formatter.format(totalIncome)}
            </p>
          </div>
          <div className="rounded-[18px] border border-line bg-surface p-3.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-expense-soft text-expense">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M12 19l-7-7M12 19l7-7" />
                </svg>
              </span>
              <span className="truncate text-xs font-semibold text-muted">Expenses</span>
            </div>
            <p className="mt-2 truncate whitespace-nowrap text-[clamp(0.72rem,1.8vw,0.97rem)] font-extrabold leading-none tracking-tight text-ink">
              {formatter.format(totalExpense)}
            </p>
          </div>
          <div className="rounded-[18px] border border-line bg-surface p-3.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`flex h-[30px] w-[30px] items-center justify-center rounded-[10px] ${netWorth < 0 ? 'bg-expense-soft text-expense' : 'bg-income-soft text-income'}`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7.5h18M6 4.5h12a2.25 2.25 0 0 1 2.25 2.25v10.5A2.25 2.25 0 0 1 18 19.5H6A2.25 2.25 0 0 1 3.75 17.25V6.75A2.25 2.25 0 0 1 6 4.5Z" />
                  <path d="M16.5 13.5h.008v.008H16.5V13.5Z" />
                </svg>
              </span>
              <span className="truncate text-xs font-semibold text-muted">Net Worth</span>
            </div>
            <p className={`mt-2 truncate whitespace-nowrap text-[clamp(0.72rem,1.8vw,0.97rem)] font-extrabold leading-none tracking-tight ${netWorth < 0 ? 'text-expense' : 'text-income'}`}>
              {netWorthDisplay}
            </p>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between rounded-2xl border border-line bg-surface p-3 shadow-[0_4px_16px_-6px_rgba(60,45,110,.12)]">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-line text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-ink">{monthFormatter.format(selectedMonth)}</p>
          <p className="text-xs text-muted">Showing this month only</p>
        </div>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Next month"
          disabled={!canGoNext}
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-line text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>

      {loading && <p className="text-center text-muted">Loading...</p>}
      {error && <p className="text-center text-expense">{error}</p>}

      {!loading && !error && (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-2 text-sm font-semibold text-muted">
                {headerFormatter.format(new Date(group.date * 1000))}
              </h2>
              <ul className="space-y-2">
                {group.items.map((t) => (
                  <li key={t.id}>
                    <TransactionRow
                      transaction={t}
                      accountName={accountName}
                      categoryName={categoryName}
                      onMarkPaid={markPaid}
                      onDelete={deleteTransaction}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {groups.length === 0 && (
            <p className="text-center text-muted">No transactions for this month.</p>
          )}
        </div>
      )}
    </PageContainer>
  );
}

function TransactionRow({
  transaction,
  accountName,
  categoryName,
  onMarkPaid,
  onDelete,
}: {
  transaction: Transaction;
  accountName: (id: string | null) => string;
  categoryName: (id: string | null) => string;
  onMarkPaid: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [translateX, setTranslateX] = useState(0);
  const dragRef = useRef<{ startX: number; startTranslate: number; moved: boolean } | null>(null);

  const isTransfer = transaction.transfer_to !== null;
  const amountColor =
    transaction.type === 'income'
      ? 'text-income'
      : transaction.type === 'expense'
        ? 'text-expense'
        : 'text-ink';
  const sign = transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '';

  const categoryLabel = isTransfer ? 'Transfer' : categoryName(transaction.category_id);
  const visual = categoryVisual(categoryLabel);

  const accountLabel = isTransfer
    ? `${accountName(transaction.account_id)} → ${accountName(transaction.transfer_to)}`
    : accountName(transaction.account_id);

  const noteLabel = [
    transaction.note,
    transaction.installment_total
      ? `${transaction.installment_index}/${transaction.installment_total}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    dragRef.current = { startX: e.clientX, startTranslate: translateX, moved: false };
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = e.clientX - drag.startX;
    if (Math.abs(delta) > TAP_THRESHOLD) drag.moved = true;
    setTranslateX(Math.min(0, Math.max(drag.startTranslate + delta, -SWIPE_REVEAL)));
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    if (!drag.moved) {
      if (translateX !== 0) {
        setTranslateX(0);
      } else {
        navigate(`/transactions/${transaction.id}/edit`);
      }
      return;
    }

    setTranslateX(translateX < -SWIPE_REVEAL / 2 ? -SWIPE_REVEAL : 0);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <button
          type="button"
          aria-label="Delete transaction"
          onClick={() => onDelete(transaction.id)}
          style={{ width: SWIPE_REVEAL }}
          className="flex items-center justify-center bg-expense text-white"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ transform: `translateX(${translateX}px)` }}
        className="grid touch-pan-y grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[0_4px_16px_-6px_rgba(60,45,110,.12)] transition-transform"
      >
        <span
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px] text-[15px] font-bold"
          style={{ background: visual.soft, color: visual.color }}
        >
          {initial(categoryLabel)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{noteLabel || categoryLabel}</p>
          <p className="truncate text-xs text-muted">{accountLabel}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`whitespace-nowrap text-[clamp(0.7rem,2.5vw,0.875rem)] font-medium ${amountColor}`}>
            {sign}
            {formatter.format(transaction.amount)}
          </span>
          {transaction.paid_status === 'settle' && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onMarkPaid(transaction.id);
              }}
              className="flex items-center gap-1 rounded-2xl border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
            >
              <CheckIcon className="h-3 w-3" />
              Settle
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
