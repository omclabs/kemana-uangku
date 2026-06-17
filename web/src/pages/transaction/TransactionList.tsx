import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { categoryVisual } from '../../lib/categories';
import { ApiError, apiFetch } from '../../lib/api';
import type { Account, Category, Transaction } from '../../lib/types';
import PageContainer from '../../components/PageContainer';

// ── Inlined icons ──────────────────────────────────────────────────
function PlusIcon()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4.5v15m7.5-7.5h-15"/></svg>; }
function CheckIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.75l6 6 9-13.5"/></svg>; }
function ChevronLeft()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.75 19.5 8.25 12l7.5-7.5"/></svg>; }
function ChevronRight() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>; }

// ── Formatters ─────────────────────────────────────────────────────
const monthFmt = new Intl.DateTimeFormat('id-ID', {
  month: 'long', year: 'numeric',
});

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

  // ── Derived ──────────────────────────────────────────────────────
  const visible = transactions.filter((t) => {
    const d = new Date(t.date * 1000);
    return d.getMonth() === selectedMonth.getMonth() && d.getFullYear() === selectedMonth.getFullYear();
  });
  const groups       = groupByDate(visible);
  const summary = visible.reduce(
    (acc, transaction) => {
      if (transaction.type === 'income') acc.income += transaction.amount;
      else acc.expense += transaction.amount;
      acc.total = acc.income - acc.expense;
      return acc;
    },
    { income: 0, expense: 0, total: 0 },
  );
  const now          = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const canGoNext    = selectedMonth.getTime() < currentMonth;
  const summaryItems = [
    { label: 'Income', value: summary.income, color: 'var(--income)' },
    { label: 'Expense', value: summary.expense, color: 'var(--expense)' },
    { label: 'Total', value: summary.total, color: 'var(--ink)' },
  ] as const;

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', marginBottom: 20 }}>
        {summaryItems.map((item, index) => (
          <div
            key={item.label}
            style={{
              padding: '13px 10px',
              paddingLeft: index === 0 ? 16 : 10,
              paddingRight: index === 2 ? 16 : 10,
              borderRight: index < 2 ? '1px solid var(--line)' : 'none',
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{item.label}</div>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                fontWeight: 800,
                color: item.color,
                letterSpacing: '-.03em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Rp {new Intl.NumberFormat('id-ID').format(Math.abs(item.value))}
            </div>
          </div>
        ))}
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>Loading…</p>}
      {error   && <p style={{ textAlign: 'center', color: 'var(--expense)', padding: '32px 0' }}>{error}</p>}

      {/* ── Transaction groups ────────────────────────────────────── */}
      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map((group) => {
            const groupDate = new Date(group.date * 1000);
            const depositTotal = group.items.reduce((sum, transaction) => {
              if (transaction.type === 'income') return sum + transaction.amount;
              return sum;
            }, 0);
            const withdrawalTotal = group.items.reduce((sum, transaction) => {
              if (transaction.type === 'expense' || transaction.type === 'transfer') {
                return sum + transaction.amount;
              }
              return sum;
            }, 0);
            return (
              <section key={group.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 16px 9px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', lineHeight: 1, minWidth: 30 }}>
                    {String(groupDate.getDate()).padStart(2, '0')}
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, background: 'var(--accent)', color: '#fff', padding: '2px 6px', borderRadius: 5, flexShrink: 0 }}>
                    {groupDate.toLocaleString('en', { weekday: 'short' })}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, flex: 1 }}>
                    {`${String(groupDate.getMonth() + 1).padStart(2, '0')}.${groupDate.getFullYear()}`}
                  </span>
                  {depositTotal > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--income)', whiteSpace: 'nowrap' }}>
                      Rp {new Intl.NumberFormat('id-ID').format(depositTotal)}
                    </span>
                  )}
                  {withdrawalTotal > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--expense)', whiteSpace: 'nowrap', marginLeft: depositTotal > 0 ? 6 : 0 }}>
                      Rp {new Intl.NumberFormat('id-ID').format(withdrawalTotal)}
                    </span>
                  )}
                </div>
                <div>
                  {group.items.map((t) => (
                    <TransactionRow
                      key={t.id}
                      transaction={t}
                      accountName={accountName}
                      categoryName={categoryName}
                      onMarkPaid={markPaid}
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

function TransactionRow({
  transaction: t, accountName, categoryName, onMarkPaid,
}: {
  transaction: Transaction;
  accountName: (id: string | null) => string;
  categoryName: (id: string | null) => string;
  onMarkPaid: (id: string) => void;
}) {
  const navigate = useNavigate();

  const isTransfer = t.transfer_to !== null;
  const isDeposit = t.type === 'income';
  const categoryLabel = categoryName(t.category_id);
  const visual = categoryVisual(isTransfer ? 'transfer' : categoryLabel);
  const label = t.note ?? '';
  const sublabel = isTransfer
    ? `Transfer - ${accountName(t.account_id)}`
    : `${categoryLabel} - ${accountName(t.account_id)}`;

  return (
    <div
      style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 16px', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
      onClick={() => navigate(`/transactions/${t.id}/edit`)}
    >
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            flexShrink: 0,
            background: visual.soft,
            color: visual.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          {isTransfer ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d={isDeposit ? 'M5 12h14M15 6l6 6-6 6' : 'M19 12H5M9 6l-6 6 6 6'} />
            </svg>
          ) : (
            (categoryLabel || 'T').trim()[0].toUpperCase()
          )}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--ink)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
          {sublabel && <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>{sublabel}</div>}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: isDeposit ? 'var(--income)' : t.type === 'expense' ? 'var(--expense)' : 'var(--ink)' }}>
            {isDeposit ? '+' : t.type === 'expense' ? '−' : ''}Rp {new Intl.NumberFormat('id-ID').format(Math.abs(t.amount))}
          </div>
          {t.paid_status === 'settle' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMarkPaid(t.id);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 4,
                background: 'rgba(245,158,11,.12)',
                border: '1px solid rgba(245,158,11,.3)',
                borderRadius: 999,
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 700,
                color: '#B45309',
                cursor: 'pointer',
              }}
            >
              <CheckIcon /> Settle
            </button>
          )}
        </div>
    </div>
  );
}
