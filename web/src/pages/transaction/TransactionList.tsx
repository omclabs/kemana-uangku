import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';
import type { Account, Category, Transaction } from '../../lib/types';
import PageContainer from '../../components/PageContainer';
import { CheckIcon, PlusIcon, TrashIcon } from '../../components/icons';

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

const SWIPE_REVEAL = 72;
const TAP_THRESHOLD = 8;

// Groups consecutive (already date-DESC-sorted) transactions by local
// calendar day, for "[Day], Date" section headers.
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

  const groups = groupByDate(transactions);

  return (
    <PageContainer>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Transactions</h1>
        <Link
          to="/transactions/new"
          aria-label="Add transaction"
          className="rounded-md bg-blue-600 p-2 text-white"
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
      </div>

      {loading && <p className="text-center text-gray-500">Loading...</p>}
      {error && <p className="text-center text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-2 text-sm font-semibold text-gray-500">
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
            <p className="text-center text-gray-500">No transactions yet.</p>
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
      ? 'text-emerald-600'
      : transaction.type === 'expense'
        ? 'text-red-600'
        : 'text-gray-900';
  const sign = transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '';

  const categoryLabel = isTransfer ? 'Transfer' : categoryName(transaction.category_id);

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
    <div className="relative overflow-hidden rounded-lg">
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <button
          type="button"
          aria-label="Delete transaction"
          onClick={() => onDelete(transaction.id)}
          style={{ width: SWIPE_REVEAL }}
          className="flex items-center justify-center bg-red-600 text-white"
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
        className="grid touch-pan-y grid-cols-[4.5rem_1fr_auto] items-center gap-2 rounded-lg bg-white p-3 shadow-sm transition-transform"
      >
        <p className="min-w-0 truncate text-xs font-medium text-gray-900">{categoryLabel}</p>
        <div className="min-w-0">
          {noteLabel && <p className="truncate text-sm text-gray-700">{noteLabel}</p>}
          <p className="truncate text-xs text-gray-500">{accountLabel}</p>
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
              className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200"
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
