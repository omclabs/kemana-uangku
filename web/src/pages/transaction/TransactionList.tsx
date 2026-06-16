import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { categoryVisual, initial } from '../../lib/categories';
import { ApiError, apiFetch } from '../../lib/api';
import type { Account, Category, Transaction } from '../../lib/types';
import PageContainer from '../../components/PageContainer';

// ── Inlined icons ──────────────────────────────────────────────────
function PlusIcon()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4.5v15m7.5-7.5h-15"/></svg>; }
function TrashIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>; }
function CheckIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.75l6 6 9-13.5"/></svg>; }
function ChevronLeft()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.75 19.5 8.25 12l7.5-7.5"/></svg>; }
function ChevronRight() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>; }

// ── Formatters ─────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
});
const headerFmt = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long',
});
const monthFmt = new Intl.DateTimeFormat('id-ID', {
  month: 'long', year: 'numeric',
});

function shortFmt(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(2).replace('.', ',')}jt`;
  if (abs >= 1_000)     return `${sign}Rp ${Math.round(abs / 1_000)}rb`;
  return fmt.format(value);
}

// ── Constants ──────────────────────────────────────────────────────
const SWIPE_REVEAL  = 72;
const TAP_THRESHOLD = 8;

function dateKey(unix: number): string {
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function groupByDate(txs: Transaction[]) {
  const groups: { key: string; date: number; items: Transaction[] }[] = [];
  for (const t of txs) {
    const key  = dateKey(t.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(t);
    else groups.push({ key, date: t.date, items: [t] });
  }
  return groups;
}

export default function TransactionList() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts,     setAccounts]     = useState<Account[]>([]);
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<Transaction[]>('/transactions'),
      apiFetch<Account[]>('/accounts?include_inactive=true'),
      apiFetch<Category[]>('/categories?include_inactive=true'),
    ])
      .then(([txs, accts, cats]) => {
        if (cancelled) return;
        setTransactions(txs); setAccounts(accts); setCategories(cats);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const accountName  = (id: string | null) => id ? (accounts.find((a) => a.id === id)?.name ?? 'Unknown') : '';
  const categoryName = (id: string | null) => id ? (categories.find((c) => c.id === id)?.name ?? 'Unknown') : '';

  async function markPaid(id: string) {
    try {
      const updated = await apiFetch<Transaction>(`/transactions/${id}/pay`, { method: 'PATCH' });
      setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Failed'); }
  }

  async function deleteTransaction(id: string) {
    if (!window.confirm('Delete this transaction? Account balances will be reversed.')) return;
    try {
      await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
      setTransactions((prev) => prev.filter((t) => t.id !== id && t.parent_transaction_id !== id));
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Failed'); }
  }

  // ── Derived ──────────────────────────────────────────────────────
  const visible = transactions.filter((t) => {
    const d = new Date(t.date * 1000);
    return d.getMonth() === selectedMonth.getMonth() && d.getFullYear() === selectedMonth.getFullYear();
  });
  const totalIncome  = visible.filter((t) => t.type === 'income') .reduce((s, t) => s + t.amount, 0);
  const totalExpense = visible.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const topLevel = accounts.filter((a) => a.parent_id === null && a.include_in_total === 1);
  const totalAssets = topLevel.filter((a) => a.type !== 'credit_card' && a.type !== 'loan')
    .reduce((s, a) => s + a.computed_balance, 0);
  const totalLiabilities = topLevel.reduce((s, a) => {
    if (a.type === 'credit_card') return s + ((a.credit_limit ?? 0) - a.computed_balance);
    if (a.type === 'loan') return s + Math.abs(a.computed_balance);
    return s;
  }, 0);
  const netWorth = totalAssets - totalLiabilities;

  const groups       = groupByDate(visible);
  const now          = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const canGoNext    = selectedMonth.getTime() < currentMonth;

  return (
    <PageContainer>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
          Transactions
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/transactions/import" style={{
            display: 'flex', alignItems: 'center',
            borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)',
            padding: '8px 12px', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)',
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            Import
          </Link>
          <Link to="/transactions/new" aria-label="Add transaction" style={{
            width: 40, height: 40, borderRadius: 13, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 16px -6px var(--accent)', textDecoration: 'none',
          }}>
            <PlusIcon />
          </Link>
        </div>
      </div>

      {/* ── Month navigator ───────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 18, padding: '10px 12px', marginBottom: 14,
        boxShadow: '0 2px 10px rgba(0,0,0,.04)',
      }}>
        <button type="button" onClick={() => setSelectedMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} style={{
          width: 38, height: 38, borderRadius: 12, border: '1px solid var(--line)',
          background: 'var(--surface)', color: 'var(--muted)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <ChevronLeft />
        </button>
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
            {monthFmt.format(selectedMonth)}
          </p>
        </div>
        <button type="button" onClick={() => setSelectedMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          disabled={!canGoNext}
          style={{
            width: 38, height: 38, borderRadius: 12, border: '1px solid var(--line)',
            background: 'var(--surface)', color: 'var(--muted)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            cursor: canGoNext ? 'pointer' : 'not-allowed', opacity: canGoNext ? 1 : 0.35,
          }}>
          <ChevronRight />
        </button>
      </div>

      {/* ── Summary cards removed ──────────────────────────────── */}

      {loading && <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>Loading…</p>}
      {error   && <p style={{ textAlign: 'center', color: 'var(--expense)', padding: '32px 0' }}>{error}</p>}

      {/* ── Transaction groups ────────────────────────────────────── */}
      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map((group) => {
            const dayNet = group.items.reduce((s, t) =>
              t.type === 'income' ? s + t.amount : t.type === 'expense' ? s - t.amount : s, 0);
            return (
              <section key={group.key}>
                {/* Date header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                    {headerFmt.format(new Date(group.date * 1000))}
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: dayNet >= 0 ? 'var(--income)' : 'var(--expense)',
                  }}>
                    {dayNet >= 0 ? '+' : '−'}{fmt.format(Math.abs(dayNet))}
                  </span>
                </div>
                {/* Rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.items.map((t) => (
                    <TransactionRow
                      key={t.id}
                      transaction={t}
                      accountName={accountName}
                      categoryName={categoryName}
                      onMarkPaid={markPaid}
                      onDelete={deleteTransaction}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {groups.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0', fontSize: 14 }}>
              No transactions for this month.
            </p>
          )}
        </div>
      )}
    </PageContainer>
  );
}

// ── Transaction row with swipe-to-delete ──────────────────────────
function TransactionRow({
  transaction: t, accountName, categoryName, onMarkPaid, onDelete,
}: {
  transaction: Transaction;
  accountName: (id: string | null) => string;
  categoryName: (id: string | null) => string;
  onMarkPaid: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const navigate    = useNavigate();
  const [tx, setTx] = useState(0);
  const drag        = useRef<{ startX: number; startTx: number; moved: boolean } | null>(null);

  const isTransfer   = t.transfer_to !== null;
  const categoryLabel = categoryName(t.category_id);
  const catLabel     = isTransfer ? 'Transfer' : categoryLabel;
  const visual       = categoryVisual(categoryLabel || catLabel);
  const sign         = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
  const amountColor  = t.type === 'income' ? 'var(--income)' : t.type === 'expense' ? 'var(--expense)' : 'var(--ink)';
  const accountLabel = isTransfer
    ? `${accountName(t.account_id)} → ${accountName(t.transfer_to)}`
    : `${categoryLabel} - ${accountName(t.account_id)}`;
  const noteLabel = t.note?.trim() ?? '';

  function onDown(e: PointerEvent<HTMLDivElement>) {
    drag.current = { startX: e.clientX, startTx: tx, moved: false };
  }
  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const delta = e.clientX - drag.current.startX;
    if (Math.abs(delta) > TAP_THRESHOLD) drag.current.moved = true;
    setTx(Math.min(0, Math.max(drag.current.startTx + delta, -SWIPE_REVEAL)));
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      tx !== 0 ? setTx(0) : navigate(`/transactions/${t.id}/edit`);
      return;
    }
    setTx(tx < -SWIPE_REVEAL / 2 ? -SWIPE_REVEAL : 0);
  }

  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden' }}>
      {/* Delete reveal */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'flex-end',
        background: 'var(--expense)',
      }}>
        <button type="button" aria-label="Delete" onClick={() => onDelete(t.id)}
          style={{ width: SWIPE_REVEAL, height: '100%', border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TrashIcon />
        </button>
      </div>

      {/* Row */}
      <div
        onPointerDown={onDown} onPointerMove={onMove}
        onPointerUp={onUp} onPointerCancel={onUp}
        style={{
          transform: `translateX(${tx}px)`,
          transition: drag.current ? 'none' : 'transform .2s ease',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 16, padding: '12px 14px',
          boxShadow: '0 2px 8px rgba(0,0,0,.04)',
          touchAction: 'pan-y', cursor: 'pointer', overflow: 'hidden',
        }}
      >
        {/* Icon */}
        <span style={{
          width: 42, height: 42, borderRadius: 13, flexShrink: 0,
          background: visual.soft, color: visual.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 800,
        }}>
          {initial(categoryLabel || catLabel)}
        </span>

        {/* Label */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--ink)',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            lineHeight: 1.35,
          }}>
            {noteLabel}
          </p>
          <p style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--muted)',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            lineHeight: 1.35,
          }}>
            {accountLabel}
          </p>
        </div>

        {/* Amount + settle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: amountColor, whiteSpace: 'nowrap' }}>
            {sign}{fmt.format(Math.abs(t.amount))}
          </span>
          {t.paid_status === 'settle' && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onMarkPaid(t.id); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.3)',
                borderRadius: 999, padding: '3px 8px',
                fontSize: 11, fontWeight: 700, color: '#B45309', cursor: 'pointer',
              }}
            >
              <CheckIcon /> Settle
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
