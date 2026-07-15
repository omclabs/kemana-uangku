import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../components/PageContainer';
import { ApiError, apiFetch, getUser } from '../lib/api';
import { categoryVisual, initial } from '../lib/categories';
import { trimCompactDecimals } from '../lib/format';
import { useTheme } from '../lib/theme';
import type { Account, BudgetMonth, Category, MonthlyBalance, TrackedItem, Transaction } from '../lib/types';

const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const DONUT_COLORS = ['#F59E0B', '#3B82F6', '#8B5CF6', '#F43F5E', '#10B981'];

function shortCurrency(value: number): string {
  if (value >= 1_000_000) return `Rp ${trimCompactDecimals(value / 1_000_000, 1)} jt`;
  if (value >= 1_000)     return `Rp ${Math.round(value / 1_000)} rb`;
  return idr.format(value);
}

function monthLabel(year: number, monthNumber: number): string {
  return new Date(year, monthNumber - 1, 1).toLocaleString('id-ID', { month: 'long', year: 'numeric' });
}

function pctLabel(value: number): string {
  return `${Math.round(Math.abs(value))}%`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [accounts,     setAccounts]     = useState<Account[]>([]);
  const [budgetMonth, setBudgetMonth] = useState<BudgetMonth | null>(null);
  const [monthlyBalances, setMonthlyBalances] = useState<MonthlyBalance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState('');
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [categoryTab, setCategoryTab] = useState<'income' | 'expense'>('expense');
  const [alertCount, setAlertCount] = useState(0);

  const user = getUser();
  const canViewAllDashboardAccounts = user?.role === 'admin' || user?.role === 'reimbursement';

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<Account[]>('/accounts'),
      apiFetch<MonthlyBalance[]>('/balances?limit=24'),
      apiFetch<Transaction[]>('/transactions'),
      apiFetch<Category[]>('/categories?include_inactive=true'),
    ])
      .then(([accountList, monthlyBalanceList, transactionList, categoryList]) => {
        if (cancelled) return;
        setAccounts(accountList);
        setMonthlyBalances(monthlyBalanceList);
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

  useEffect(() => {
    if (user?.role === 'reimbursement') return;

    let cancelled = false;
    apiFetch<TrackedItem[]>('/tracked-items/alerts')
      .then((items) => {
        if (!cancelled) setAlertCount(items.length);
      })
      .catch(() => {
        if (!cancelled) setAlertCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  const topLevelAccounts = accounts.filter(
    (a) => a.parent_id === null && a.include_in_total === 1,
  );

  const totalBalance = topLevelAccounts
    .filter((a) => canViewAllDashboardAccounts || (a.type !== 'credit_card' && a.type !== 'loan'))
    .reduce((sum, a) => sum + a.computed_balance, 0);

  const now = new Date();
  const fallbackMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const availableMonthKeys = monthlyBalances.map((row) => row.month_key);
  const selectedMonthKeyValue = availableMonthKeys.includes(selectedMonthKey) ? selectedMonthKey : '';
  const effectiveMonthKey = selectedMonthKeyValue || availableMonthKeys[0] || fallbackMonthKey;
  const [selectedYear, selectedMonthNumber] = effectiveMonthKey.split('-').map(Number);
  const selectedMonth = selectedMonthNumber - 1;

  useEffect(() => {
    let cancelled = false;

    apiFetch<BudgetMonth>(`/budgets?month=${effectiveMonthKey}`)
      .then((payload) => {
        if (!cancelled) setBudgetMonth(payload);
      })
      .catch(() => {
        if (!cancelled) setBudgetMonth(null);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveMonthKey]);

  const monthTx = transactions.filter((t) => {
    const d = new Date(t.date * 1000);
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  });
  const selectedMonthlyBalance = monthlyBalances.find((row) => row.month_key === effectiveMonthKey) ?? null;
  const selectedIndex = monthlyBalances.findIndex((row) => row.month_key === effectiveMonthKey);
  const previousMonthlyBalance = selectedIndex >= 0 ? monthlyBalances[selectedIndex + 1] ?? null : null;
  const income = selectedMonthlyBalance?.income
    ?? monthTx.filter((t) => t.type === 'income' && t.transfer_to === null).reduce((s, t) => s + t.amount, 0);
  const expense = selectedMonthlyBalance?.expense
    ?? monthTx.filter((t) => t.type === 'expense' && t.transfer_to === null).reduce((s, t) => s + t.amount, 0);
  const balanceSummary = selectedMonthlyBalance?.balance ?? totalBalance;
  const previousMonthNetWorth = previousMonthlyBalance?.balance ?? (balanceSummary - income + expense);
  const hasPreviousMonthBaseline = previousMonthNetWorth !== 0;
  const monthOverMonthPct = hasPreviousMonthBaseline
    ? ((balanceSummary - previousMonthNetWorth) / Math.abs(previousMonthNetWorth)) * 100
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

  const categoryTransactions = monthTx.filter(
    (transaction): transaction is Transaction & { type: 'income' | 'expense' } =>
      (transaction.type === 'income' || transaction.type === 'expense') && transaction.transfer_to === null,
  );
  const incomeByCategory = new Map<string, number>();
  const expenseByCategory = new Map<string, number>();
  categoryTransactions.forEach((transaction) => {
    const name = categoryName(transaction.category_id);
    const target = transaction.type === 'income' ? incomeByCategory : expenseByCategory;
    target.set(name, (target.get(name) ?? 0) + transaction.amount);
  });

  const donutSource = categoryTab === 'income' ? incomeByCategory : expenseByCategory;
  const donutTotal = categoryTab === 'income' ? income : expense;
  const donutTitle = categoryTab === 'income' ? 'Incoming' : 'Spending';
  const donutCategories = [...donutSource.entries()]
    .sort(([, left], [, right]) => right - left)
    .map(([name, amount], index) => ({
      name,
      amount,
      pct: donutTotal > 0 ? (amount / donutTotal) * 100 : 0,
      color: DONUT_COLORS[index % DONUT_COLORS.length],
    }));
  const totalBudget = budgetMonth?.total_budget ?? categories
    .filter((category) => category.type === 'expense' && category.is_active === 1)
    .reduce((sum, category) => sum + category.budget_monthly, 0);
  const budgetUsagePct = totalBudget > 0 ? Math.min((expense / totalBudget) * 100, 100) : 0;
  const budgetDelta = totalBudget - expense;
  const categorySummaries = categoryTransactions
    .reduce<Array<{ key: string; name: string; total: number; type: 'income' | 'expense' }>>((groups, transaction) => {
      const groupName = categoryName(transaction.category_id);
      const existing = groups.find((group) => group.key === groupName);
      const delta = transaction.amount;
      if (existing) {
        existing.total += delta;
        return groups;
      }
      return [...groups, { key: groupName, name: groupName, total: delta, type: transaction.type }];
    }, [])
    .sort((left, right) => right.total - left.total);
  const visibleCategorySummaries = categorySummaries.filter((group) => group.type === categoryTab);

  const segments = donutCategories.reduce<{
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle theme"
            style={{
              width: 40, height: 40, borderRadius: 13, flexShrink: 0,
              border: '1px solid var(--line)', background: 'var(--surface)',
              color: 'var(--muted)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,.04)',
            }}
          >
            {theme === 'dark' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={() => navigate('/tracked-items/alerts')}
            style={{
              width: 40, height: 40, borderRadius: 13, flexShrink: 0,
              border: '1px solid var(--line)', background: 'var(--surface)',
              color: 'var(--muted)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,.04)',
              position: 'relative',
            }}
          >
            {alertCount > 0 && user?.role !== 'reimbursement' && (
              <span style={{
                position: 'absolute',
                marginTop: -22,
                marginLeft: 22,
                minWidth: 18,
                height: 18,
                borderRadius: 999,
                background: 'var(--expense)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 5px',
              }}>
                {alertCount}
              </span>
            )}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
              <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>
            </svg>
          </button>
        </div>
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
                Balance
              </p>
              <p style={{ margin: '5px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {idr.format(balanceSummary)}
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

          {(donutCategories.length > 0 || (categoryTab === 'expense' && (totalBudget > 0 || expense > 0))) && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 22, padding: 18,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{donutTitle}</span>
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
                  <span>{monthLabel(selectedYear, selectedMonthNumber)}</span>
                  <span style={{ fontSize: 10 }}>▾</span>
                </button>
              </div>

              {donutCategories.length > 0 && (
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
                    <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--muted)' }}>
                      {categoryTab === 'income' ? 'Received' : 'Spent'}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>
                      {shortCurrency(donutTotal)}
                    </span>
                  </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {donutCategories.map((cat) => (
                    <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: cat.color, flexShrink: 0 }}/>
                      <span style={{ flex: 1, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cat.name}
                      </span>
                      <span style={{ fontWeight: 700, color: 'var(--muted)' }}>{Math.round(cat.pct)}%</span>
                    </div>
                  ))}
                </div>
                </div>
              )}

              {categoryTab === 'expense' && (
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
              )}
            </div>
          )}

          {categorySummaries.length > 0 && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 22, padding: 18,
            }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <div style={{
                  display: 'inline-flex',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 999,
                  padding: 3,
                  gap: 3,
                }}>
                  {(['income', 'expense'] as const).map((tab) => {
                    const active = categoryTab === tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setCategoryTab(tab)}
                        style={{
                          border: 'none',
                          background: active ? 'var(--accent)' : 'transparent',
                          color: active ? '#fff' : 'var(--muted)',
                          borderRadius: 999,
                          padding: '6px 12px',
                          fontSize: 11.5,
                          fontWeight: 700,
                          fontFamily: 'inherit',
                          textTransform: 'capitalize',
                          cursor: 'pointer',
                        }}
                      >
                        {tab}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {visibleCategorySummaries.map((group) => {
                  const visual = categoryVisual(group.name);
                  return (
                    <div
                      key={group.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        border: '1px solid var(--line)',
                        borderRadius: 18,
                        background: 'var(--surface-2)',
                        padding: '12px 14px',
                      }}
                    >
                      <span style={{
                        width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                        background: visual.soft, color: visual.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 800,
                      }}>
                        {group.name.trim()[0]?.toUpperCase() ?? 'T'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {group.name}
                        </div>
                      </div>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: group.type === 'income' ? 'var(--income)' : 'var(--expense)', whiteSpace: 'nowrap' }}>
                        {group.type === 'income' ? '+' : '−'}{idr.format(group.total)}
                      </span>
                    </div>
                  );
                })}
                {visibleCategorySummaries.length === 0 && (
                  <p style={{ margin: 0, padding: '12px 2px 2px', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5 }}>
                    No {categoryTab} categories this month.
                  </p>
                )}
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
                const [yearValue, monthValue] = monthKey.split('-').map(Number);
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
                    {monthLabel(yearValue, monthValue)}
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
