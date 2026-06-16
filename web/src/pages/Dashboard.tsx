import { useEffect, useState } from 'react';
import PageContainer from '../components/PageContainer';
import { ApiError, apiFetch, getUser } from '../lib/api';
import { initial } from '../lib/categories';
import type { Account, Category, Transaction } from '../lib/types';

const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const DONUT_COLORS = ['#F59E0B', '#3B82F6', '#8B5CF6', '#F43F5E', '#10B981'];

function trimCompactDecimals(value: number, digits: number): string {
  return value
    .toFixed(digits)
    .replace(/\.?0+$/, '')
    .replace('.', ',');
}

function shortCurrency(value: number): string {
  if (value >= 1_000_000) return `Rp ${trimCompactDecimals(value / 1_000_000, 1)} jt`;
  if (value >= 1_000)     return `Rp ${Math.round(value / 1_000)}rb`;
  return idr.format(value);
}

function monthLabel(monthIndex: number): string {
  return new Date(2026, monthIndex, 1).toLocaleString('id-ID', { month: 'long' });
}

function pctLabel(value: number): string {
  return `${Math.round(Math.abs(value))}%`;
}

export default function Dashboard() {
  const [accounts,     setAccounts]     = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState('');
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

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
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : 'Failed to load dashboard');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const topLevelAccounts = accounts.filter(
    (a) => a.parent_id === null && a.include_in_total === 1,
  );
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  function countsTowardNetWorth(accountId: string | null): boolean {
    if (!accountId) return false;
    let current = accountById.get(accountId) ?? null;
    while (current?.parent_id) current = accountById.get(current.parent_id) ?? null;
    if (!current) return false;
    if (current.include_in_total !== 1) return false;
    return current.type !== 'credit_card' && current.type !== 'loan';
  }

  const totalBalance = topLevelAccounts
    .filter((a) => a.type !== 'credit_card' && a.type !== 'loan')
    .reduce((sum, a) => sum + a.computed_balance, 0);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const availableMonthKeys = [...new Set(
    transactions
      .map((transaction) => new Date(transaction.date * 1000))
      .filter((date) => date.getFullYear() === currentYear && date.getMonth() <= currentMonth)
      .map((date) => `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`),
  )].sort((left, right) => right.localeCompare(left));
  const effectiveMonthKey = selectedMonthKey || availableMonthKeys[0] || `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const [selectedYear, selectedMonth] = effectiveMonthKey.split('-').map(Number);

  useEffect(() => {
    if (!availableMonthKeys.length) {
      if (selectedMonthKey !== '') setSelectedMonthKey('');
      return;
    }
    if (!selectedMonthKey || !availableMonthKeys.includes(selectedMonthKey)) {
      setSelectedMonthKey(availableMonthKeys[0]);
    }
  }, [availableMonthKeys, selectedMonthKey]);

  const monthTx = transactions.filter((t) => {
    const d = new Date(t.date * 1000);
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  });
  const income  = monthTx.filter((t) => t.type === 'income') .reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const monthNetWorthDelta = monthTx.reduce((sum, transaction) => {
    let delta = sum;
    if (countsTowardNetWorth(transaction.account_id)) {
      delta += transaction.type === 'income' ? transaction.amount : -transaction.amount;
    }
    if (countsTowardNetWorth(transaction.transfer_to)) {
      delta += transaction.amount;
    }
    return delta;
  }, 0);
  const previousMonthNetWorth = totalBalance - monthNetWorthDelta;
  const hasPreviousMonthBaseline = previousMonthNetWorth !== 0;
  const monthOverMonthPct = hasPreviousMonthBaseline
    ? ((totalBalance - previousMonthNetWorth) / Math.abs(previousMonthNetWorth)) * 100
    : 0;
  const monthOverMonthPrefix = !hasPreviousMonthBaseline
    ? '-'
    : monthOverMonthPct > 0
      ? '+'
      : monthOverMonthPct < 0
        ? '-'
        : '=';
  const trendBadgeBackground = !hasPreviousMonthBaseline
    ? 'rgba(255,255,255,.2)'
    : monthOverMonthPct > 0
      ? 'rgba(187,247,208,.22)'
      : monthOverMonthPct < 0
        ? 'rgba(254,202,202,.22)'
        : 'rgba(255,255,255,.2)';
  const trendBadgeColor = !hasPreviousMonthBaseline
    ? '#fff'
    : monthOverMonthPct > 0
      ? '#dcfce7'
      : monthOverMonthPct < 0
        ? '#fee2e2'
        : '#fff';

  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? 'Other';

  const spendingByCategory = new Map<string, number>();
  monthTx
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      const n = categoryName(t.category_id);
      spendingByCategory.set(n, (spendingByCategory.get(n) ?? 0) + t.amount);
    });

  const topCategories = [...spendingByCategory.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([name, amount], i) => ({
      name, amount,
      pct: expense > 0 ? Math.round((amount / expense) * 100) : 0,
      color: DONUT_COLORS[i],
    }));
  const totalBudget = categories
    .filter((category) => category.type === 'expense' && category.is_active === 1)
    .reduce((sum, category) => sum + category.budget_monthly, 0);
  const budgetUsagePct = totalBudget > 0 ? Math.min((expense / totalBudget) * 100, 100) : 0;
  const budgetDelta = totalBudget - expense;

  const segments = topCategories.reduce<{
    offset: number;
    items: { color: string; dash: string; offset: number }[];
  }>(
    (state, cat) => ({
      offset: state.offset + cat.pct,
      items: [...state.items, {
        color: cat.color,
        dash:  `${cat.pct} ${100 - cat.pct}`,
        offset: 25 - state.offset,
      }],
    }),
    { offset: 0, items: [] },
  ).items;

  return (
    <PageContainer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            boxShadow: '0 8px 16px -4px var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, fontWeight: 800, color: '#fff',
          }}>
            {initial(user?.username ?? 'A')}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>
              Good day,
            </p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
              {user?.username ?? 'there'}
            </p>
          </div>
        </div>

        <button style={{
          width: 40, height: 40, borderRadius: 13, flexShrink: 0,
          border: '1px solid var(--line)', background: 'var(--surface)',
          color: 'var(--muted)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,.04)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
            <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>
          </svg>
        </button>
      </div>

      {loading && (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>Loading…</p>
      )}
      {error && (
        <p style={{ textAlign: 'center', color: 'var(--expense)', padding: '32px 0' }}>{error}</p>
      )}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            position: 'relative', overflow: 'hidden', borderRadius: 26,
            padding: '22px 22px 18px',
            background: 'linear-gradient(140deg, var(--accent), var(--accent-2))',
            boxShadow: '0 16px 30px -14px var(--accent)',
            color: '#fff',
          }}>
            <div style={{
              position: 'absolute', width: 180, height: 180, borderRadius: '50%',
              background: 'rgba(255,255,255,.12)', top: -70, right: -40,
            }} />
            <div style={{
              position: 'absolute', width: 90, height: 90, borderRadius: '50%',
              background: 'rgba(255,255,255,.08)', bottom: -28, right: 60,
            }} />

            <div style={{ position: 'relative' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, opacity: .85 }}>
                Total Balance
              </p>
              <p style={{ margin: '5px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {idr.format(totalBalance)}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9 }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  background: trendBadgeBackground,
                  color: trendBadgeColor,
                  padding: '3px 9px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    {monthOverMonthPct < 0 && hasPreviousMonthBaseline ? (
                      <path d="M7 7 17 17M9 17h8V9" />
                    ) : (
                      <path d="M7 17 17 7M9 7h8v8" />
                    )}
                  </svg>
                  {monthOverMonthPrefix} {pctLabel(monthOverMonthPct)}
                </span>
                <span style={{ fontSize: 12, opacity: .82 }}>vs last month</span>
              </div>
              <svg viewBox="0 0 260 50" preserveAspectRatio="none" style={{ width: '100%', height: 40, marginTop: 14, overflow: 'visible' }}>
                <polyline
                  points="0,40 26,34 52,38 78,27 104,30 130,19 156,24 182,13 208,18 234,7 260,11"
                  fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{
              flex: 1, background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 18, padding: '13px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 30, height: 30, borderRadius: 10,
                  background: 'var(--income-soft)', color: 'var(--income)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M12 5l-7 7M12 5l7 7"/>
                  </svg>
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>Income</span>
              </div>
              <p style={{ margin: '9px 0 0', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
                {idr.format(income)}
              </p>
            </div>

            <div style={{
              flex: 1, background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 18, padding: '13px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 30, height: 30, borderRadius: 10,
                  background: 'var(--expense-soft)', color: 'var(--expense)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M12 19l-7-7M12 19l7-7"/>
                  </svg>
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>Expenses</span>
              </div>
              <p style={{ margin: '9px 0 0', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
                {idr.format(expense)}
              </p>
            </div>
          </div>

          {(topCategories.length > 0 || totalBudget > 0 || expense > 0) && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 22, padding: 18,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Spending</span>
                <button
                  type="button"
                  onClick={() => setMonthPickerOpen(true)}
                  style={{
                  fontSize: 11.5, fontWeight: 700, color: 'var(--accent)',
                  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                >
                  <span>{monthLabel(selectedMonth)}</span>
                  <span style={{ fontSize: 10 }}>▾</span>
                </button>
              </div>

              {topCategories.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 16 }}>
                <div style={{ position: 'relative', width: 104, height: 104, flexShrink: 0 }}>
                  <svg viewBox="0 0 36 36" style={{ width: 104, height: 104 }}>
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--line)" strokeWidth="4"/>
                    {segments.map((s, i) => (
                      <circle
                        key={i}
                        cx="18" cy="18" r="15.915"
                        fill="none"
                        stroke={s.color}
                        strokeWidth="4.4"
                        strokeDasharray={s.dash}
                        strokeDashoffset={s.offset}
                      />
                    ))}
                  </svg>
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--muted)' }}>Spent</span>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>
                      {shortCurrency(expense)}
                    </span>
                  </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {topCategories.map((cat) => (
                    <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: cat.color, flexShrink: 0 }}/>
                      <span style={{ flex: 1, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cat.name}
                      </span>
                      <span style={{ fontWeight: 700, color: 'var(--muted)' }}>{cat.pct}%</span>
                    </div>
                  ))}
                </div>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 6, gap: 12 }}>
                  <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Monthly budget</span>
                  <span style={{ color: 'var(--ink)', fontWeight: 700 }}>
                    {totalBudget > 0 ? `${shortCurrency(expense)} / ${shortCurrency(totalBudget)}` : `${shortCurrency(expense)} / 0`}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${budgetUsagePct}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: budgetDelta >= 0
                      ? 'linear-gradient(90deg, var(--accent), var(--accent-2))'
                      : 'linear-gradient(90deg, var(--expense), #f97316)',
                  }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {monthPickerOpen && (
        <div
          onClick={() => setMonthPickerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            background: 'rgba(17,24,39,.28)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(320px, 100%)',
              borderRadius: 24,
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              boxShadow: '0 24px 64px rgba(15,23,42,.18)',
              padding: 18,
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Select month</p>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>Year to date</p>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {(availableMonthKeys.length ? availableMonthKeys : [effectiveMonthKey]).map((monthKey) => {
                const [, monthValue] = monthKey.split('-').map(Number);
                const active = monthKey === effectiveMonthKey;
                return (
                  <button
                    key={monthKey}
                    type="button"
                    onClick={() => {
                      setSelectedMonthKey(monthKey);
                      setMonthPickerOpen(false);
                    }}
                    style={{
                      border: active ? '1px solid color-mix(in srgb, var(--accent) 35%, transparent)' : '1px solid var(--line)',
                      background: active ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))' : 'var(--surface)',
                      color: active ? 'var(--accent)' : 'var(--ink)',
                      borderRadius: 16,
                      padding: '12px 14px',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: active ? 700 : 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {monthLabel(monthValue)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
