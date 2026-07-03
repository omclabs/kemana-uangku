import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageContainer from '../../components/PageContainer';
import TileLookup from '../../components/TileLookup';
import { ApiError, apiFetch } from '../../lib/api';
import { categoryVisual } from '../../lib/categories';
import type { Account, Category, Transaction } from '../../lib/types';

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M16 11h3v4h-3a2 2 0 0 1 0-4z" />
    </svg>
  );
}

function statFmt(value: number): string {
  return new Intl.NumberFormat('id-ID').format(Math.round(Math.abs(value)));
}

function fmtMD(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function fmtMDY(date: Date): string {
  return `${fmtMD(date)}.${String(date.getFullYear()).slice(2)}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function statementCycleStart(year: number, month: number, billingDate: number): Date {
  return new Date(year, month, billingDate + 1, 0, 0, 0, 0);
}

function nextStatementCycleStart(start: Date, billingDate: number): Date {
  return new Date(start.getFullYear(), start.getMonth() + 1, billingDate + 1, 0, 0, 0, 0);
}

function statementCycleEndInclusive(endExclusive: Date): Date {
  return new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate() - 1, 0, 0, 0, 0);
}

function buildStatementRange(anchor: Date, billingDate: number, offset: number) {
  const start = statementCycleStart(anchor.getFullYear(), anchor.getMonth() + offset, billingDate);
  const endExclusive = nextStatementCycleStart(start, billingDate);
  return { start, endExclusive };
}

export default function AccountPayment() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(() => parseMonthKey(searchParams.get('month')) ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  useEffect(() => {
    const nextMonth = monthKey(selectedMonth);
    if (searchParams.get('month') === nextMonth) return;
    const next = new URLSearchParams(searchParams);
    next.set('month', nextMonth);
    setSearchParams(next, { replace: true });
  }, [searchParams, selectedMonth, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiFetch<Account[]>('/accounts?include_inactive=true'),
      apiFetch<Transaction[]>('/transactions?include_inactive=true'),
      apiFetch<Category[]>('/categories?include_inactive=true'),
    ])
      .then(([nextAccounts, nextTransactions, nextCategories]) => {
        if (cancelled) return;
        setAccounts(nextAccounts);
        setTransactions(nextTransactions);
        setCategories(nextCategories);
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof ApiError ? nextError.message : 'Failed to load payment data');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const account = useMemo(() => accounts.find((item) => item.id === id) ?? null, [accounts, id]);
  const paymentAccounts = useMemo(
    () => accounts.filter((item) => item.is_active === 1 && item.id !== id && item.type !== 'credit_card' && item.type !== 'loan'),
    [accounts, id],
  );
  const billingDate = account?.type === 'credit_card' ? account.billing_date : null;
  const ranges = useMemo(() => {
    if (billingDate === null) return [];
    return [
      { key: 'previous', label: 'Previous', ...buildStatementRange(selectedMonth, billingDate, -1) },
      { key: 'current', label: 'Current', ...buildStatementRange(selectedMonth, billingDate, 0) },
      { key: 'next', label: 'Next', ...buildStatementRange(selectedMonth, billingDate, 1) },
    ] as const;
  }, [billingDate, selectedMonth]);

  const accountName = (accountId: string | null) => accounts.find((item) => item.id === accountId)?.name ?? 'Unknown';
  const categoryName = (categoryId: string | null) => categories.find((item) => item.id === categoryId)?.name ?? '';

  const sections = useMemo(() => {
    if (!id) return [];
    return ranges.map((range) => {
      const items = transactions
        .filter((transaction) => (
          transaction.is_active === 1
          && transaction.account_id === id
          && transaction.paid_status === 'settle'
          && transaction.date >= Math.floor(range.start.getTime() / 1000)
          && transaction.date < Math.floor(range.endExclusive.getTime() / 1000)
        ))
        .sort((left, right) => left.date - right.date);
      return {
        ...range,
        items,
        subtotal: items.reduce((sum, item) => sum + item.amount, 0),
      };
    });
  }, [id, ranges, transactions]);

  const selectedRows = useMemo(() => {
    const rowMap = new Map(transactions.map((transaction) => [transaction.id, transaction]));
    return selectedIds.map((transactionId) => rowMap.get(transactionId)).filter((transaction): transaction is Transaction => Boolean(transaction));
  }, [selectedIds, transactions]);
  const selectedTotal = selectedRows.reduce((sum, transaction) => sum + transaction.amount, 0);

  function toggleSelected(transactionId: string) {
    setSelectedIds((current) => (
      current.includes(transactionId)
        ? current.filter((item) => item !== transactionId)
        : [...current, transactionId]
    ));
  }

  async function handleSubmit() {
    if (!id) return;
    if (!paymentAccountId) {
      setError('Select a payment account');
      return;
    }
    if (selectedIds.length === 0) {
      setError('Select at least one transaction');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiFetch<{ payment: Transaction; total_amount: number }> (`/accounts/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          payment_account_id: paymentAccountId,
          transaction_ids: selectedIds,
          anchor_month: monthKey(selectedMonth),
        }),
      });
      setSelectedIds([]);
      setSuccess(`Payment saved: Rp ${statFmt(response.total_amount)}`);
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (nextError) {
      setError(nextError instanceof ApiError ? nextError.message : 'Failed to save payment');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageContainer><p style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>Loading…</p></PageContainer>;
  }

  if (!account || account.type !== 'credit_card' || billingDate === null) {
    return <PageContainer><p style={{ padding: 32, textAlign: 'center', color: 'var(--expense)' }}>Credit card account not found.</p></PageContainer>;
  }

  return (
    <PageContainer>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 18,
        position: 'sticky',
        top: 0,
        zIndex: 15,
        padding: '10px 0 12px',
        background: 'color-mix(in srgb, var(--bg) 84%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid color-mix(in srgb, var(--line) 75%, transparent)',
      }}>
        <button type="button" onClick={() => navigate(-1)} style={{
          width: 38, height: 38, borderRadius: 12, flexShrink: 0,
          border: '1px solid var(--line)', background: 'var(--surface)',
          color: 'var(--muted)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer',
        }}>
          <BackIcon />
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)', flex: 1 }}>
          {account.name} Payment
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button type="button" onClick={() => setSelectedMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} style={{ width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 8 }}>
            <ChevronLeft />
          </button>
          <span style={{ minWidth: 88, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
            {selectedMonth.toLocaleString('en', { month: 'short', year: 'numeric' })}
          </span>
          <button type="button" onClick={() => setSelectedMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} style={{ width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 8 }}>
            <ChevronRight />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 18,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Payment account</div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            style={{
              marginTop: 8,
              width: '100%',
              borderRadius: 14,
              border: '1px solid var(--line)',
              background: 'var(--surface-2)',
              color: 'var(--ink)',
              padding: '11px 12px',
              fontSize: 14,
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ color: 'var(--muted)', flexShrink: 0 }}><WalletIcon /></span>
              <span style={{ fontWeight: 600, color: paymentAccountId ? 'var(--ink)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {paymentAccountId ? accountName(paymentAccountId) : 'Select payment account'}
              </span>
            </span>
            <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRight /></span>
          </button>
        </div>

        {sections.map((section) => (
          <section key={section.key} style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 20,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 16px',
              background: 'var(--surface-2)',
              borderBottom: '1px solid var(--line)',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{section.label}</div>
                <div style={{ marginTop: 2, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                  {fmtMDY(section.start)} ~ {fmtMDY(statementCycleEndInclusive(section.endExclusive))}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{section.items.length} items</div>
                <div style={{ marginTop: 2, fontSize: 13, fontWeight: 800, color: 'var(--expense)' }}>Rp {statFmt(section.subtotal)}</div>
              </div>
            </div>

            {section.items.length === 0 && (
              <p style={{ margin: 0, padding: '16px', fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
                No pending settlement transactions.
              </p>
            )}

            {section.items.map((transaction) => {
              const checked = selectedIds.includes(transaction.id);
              const categoryLabel = categoryName(transaction.category_id);
              const visual = categoryVisual(categoryLabel || 'transfer');
              return (
                <button
                  key={transaction.id}
                  type="button"
                  onClick={() => toggleSelected(transaction.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 11,
                    padding: '11px 16px',
                    border: 'none',
                    borderBottom: '1px solid var(--line)',
                    background: checked ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    flexShrink: 0,
                    border: checked ? '1px solid var(--accent)' : '1px solid var(--line)',
                    background: checked ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'var(--surface-2)',
                    color: checked ? 'var(--accent)' : 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 800,
                  }}>
                    {checked ? '✓' : ''}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {transaction.note || categoryLabel || 'Credit card transaction'}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>
                      {categoryLabel} · {fmtMDY(new Date(transaction.date * 1000))}
                    </div>
                    {transaction.payment_transaction_id && (
                      <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 700, color: 'var(--accent)' }}>
                        Paid by {transaction.payment_transaction_id}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--expense)' }}>
                      Rp {statFmt(transaction.amount)}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 10.5, fontWeight: 600, color: visual.color }}>
                      {accountName(transaction.account_id)}
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
        ))}

        {(error || success) && (
          <div style={{
            padding: '11px 14px',
            borderRadius: 14,
            border: `1px solid ${error ? 'color-mix(in srgb, var(--expense) 25%, transparent)' : 'color-mix(in srgb, var(--income) 25%, transparent)'}`,
            background: error ? 'var(--expense-soft)' : 'var(--income-soft)',
            color: error ? 'var(--expense)' : 'var(--income)',
            fontSize: 13,
            fontWeight: 600,
          }}>
            {error ?? success}
          </div>
        )}

        <div style={{
          position: 'sticky',
          bottom: 12,
          display: 'grid',
          gap: 12,
          background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          padding: '8px 0 4px',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            borderTop: '1px solid var(--line)',
            borderBottom: '1px solid var(--line)',
            background: 'var(--surface)',
          }}>
            <SummaryItem label="Selected" value={String(selectedIds.length)} color="var(--ink)" bordered />
            <SummaryItem label="Total" value={`Rp ${statFmt(selectedTotal)}`} color="var(--expense)" />
            <SummaryItem label="From" value={paymentAccountId ? accountName(paymentAccountId) : '—'} color="var(--ink)" bordered topBorder />
            <SummaryItem label="To" value={account.name} color="var(--accent)" topBorder />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleSubmit}
            style={{
              border: 'none',
              borderRadius: 18,
              padding: '14px 16px',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              color: '#fff',
              fontSize: 15,
              fontWeight: 800,
              fontFamily: 'inherit',
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
              boxShadow: '0 8px 20px -6px var(--accent)',
            }}
          >
            {saving ? 'Saving…' : 'Pay selected'}
          </button>
        </div>
      </div>
      {pickerOpen && (
        <TileLookup
          items={paymentAccounts}
          value={paymentAccountId}
          onSelect={setPaymentAccountId}
          onClose={() => setPickerOpen(false)}
          allowParentSelection
          title="Payment Account"
        />
      )}
    </PageContainer>
  );
}

function SummaryItem({
  label,
  value,
  color,
  bordered = false,
  topBorder = false,
}: {
  label: string;
  value: string;
  color: string;
  bordered?: boolean;
  topBorder?: boolean;
}) {
  return (
    <div style={{
      padding: '12px 12px 11px',
      minWidth: 0,
      borderRight: bordered ? '1px solid var(--line)' : 'none',
      borderTop: topBorder ? '1px solid var(--line)' : 'none',
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{
        marginTop: 4,
        fontSize: 11,
        lineHeight: 1.35,
        fontWeight: 800,
        color,
        letterSpacing: '-.01em',
        overflowWrap: 'anywhere',
      }}>
        {value}
      </div>
    </div>
  );
}
