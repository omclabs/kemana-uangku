import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../components/PageContainer';
import { ApiError, apiFetch, getUser } from '../lib/api';
import { categoryVisual, initial } from '../lib/categories';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/compactIcons';
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

function ChartSeriesPoint({
  x, y, xAnchor, anchorAbove, color, value, isSelected,
}: {
  x: number; y: number; xAnchor: number; anchorAbove: boolean;
  color: string; value: number; isSelected: boolean;
}) {
  return (
    <>
      <span style={{
        position: 'absolute', left: `${x}%`, top: `${y}%`,
        transform: anchorAbove ? `translate(${xAnchor}%, calc(-100% - 5px))` : `translate(${xAnchor}%, 5px)`,
        fontSize: 8.5, fontWeight: 700, color, whiteSpace: 'nowrap',
      }}>
        {shortCurrency(value)}
      </span>
      <span style={{
        position: 'absolute', left: `${x}%`, top: `${y}%`,
        transform: 'translate(-50%, -50%)', width: isSelected ? 8 : 6, height: isSelected ? 8 : 6,
        borderRadius: '50%', background: color, border: '2px solid var(--surface)',
      }} />
    </>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [budgetMonth, setBudgetMonth] = useState<BudgetMonth | null>(null);
  const [monthlyBalances, setMonthlyBalances] = useState<MonthlyBalance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [accounts,     setAccounts]     = useState<Account[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState('');
  const [categoryTab, setCategoryTab] = useState<'income' | 'expense'>('expense');
  const [alertCount, setAlertCount] = useState(0);

  const user = getUser();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<MonthlyBalance[]>('/balances?limit=24'),
      apiFetch<Transaction[]>('/transactions'),
      apiFetch<Category[]>('/categories?include_inactive=true'),
      apiFetch<Account[]>('/accounts?include_inactive=true'),
    ])
      .then(([monthlyBalanceList, transactionList, categoryList, accountList]) => {
        if (cancelled) return;
        setMonthlyBalances(monthlyBalanceList);
        setTransactions(transactionList);
        setCategories(categoryList);
        setAccounts(accountList);
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

  const now = new Date();
  const fallbackMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const availableMonthKeys = monthlyBalances.map((row) => row.month_key);
  const selectedMonthKeyValue = availableMonthKeys.includes(selectedMonthKey) ? selectedMonthKey : '';
  const effectiveMonthKey = selectedMonthKeyValue || availableMonthKeys[0] || fallbackMonthKey;
  const [selectedYear, selectedMonthNumber] = effectiveMonthKey.split('-').map(Number);
  const selectedMonth = selectedMonthNumber - 1;
  const effectiveMonthIndex = availableMonthKeys.indexOf(effectiveMonthKey);
  const canGoOlderMonth = effectiveMonthIndex >= 0 && effectiveMonthIndex < availableMonthKeys.length - 1;
  const canGoNewerMonth = effectiveMonthIndex > 0;

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

  const flaggedAccountIds = useMemo(
    () => new Set(accounts.filter((a) => a.count_transfer_as_expense === 1).map((a) => a.id)),
    [accounts],
  );

  const monthTx = transactions.filter((t) => {
    const d = new Date(t.date * 1000);
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  });
  const selectedMonthlyBalance = monthlyBalances.find((row) => row.month_key === effectiveMonthKey) ?? null;
  const income = selectedMonthlyBalance?.income
    ?? monthTx.filter((t) => t.type === 'income' && t.transfer_to === null).reduce((s, t) => s + t.amount, 0);
  const expense = selectedMonthlyBalance?.expense
    ?? monthTx.filter((t) => t.type === 'expense' && (t.transfer_to === null || flaggedAccountIds.has(t.transfer_to))).reduce((s, t) => s + t.amount, 0);

  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? 'Other';

  const categoryTransactions = monthTx.filter(
    (transaction): transaction is Transaction & { type: 'income' | 'expense' } =>
      (transaction.type === 'income' || transaction.type === 'expense')
      && (transaction.transfer_to === null || flaggedAccountIds.has(transaction.transfer_to)),
  );
  const incomeByCategory = new Map<string, number>();
  const expenseByCategory = new Map<string, number>();
  categoryTransactions.forEach((transaction) => {
    const name = categoryName(transaction.category_id);
    const target = transaction.type === 'income' ? incomeByCategory : expenseByCategory;
    target.set(name, (target.get(name) ?? 0) + transaction.amount);
  });

  const donutSource = categoryTab === 'income' ? incomeByCategory : expenseByCategory;
  const donutOwnTotal = [...donutSource.values()].reduce((sum, amount) => sum + amount, 0);
  const donutTotal = user?.role === 'reimbursement'
    ? donutOwnTotal
    : (categoryTab === 'income' ? income : expense);
  const donutTitle = categoryTab === 'income' ? 'Incoming' : 'Spending';
  const DONUT_TOP_N = DONUT_COLORS.length - 1;
  const sortedDonutEntries = [...donutSource.entries()].sort(([, left], [, right]) => right - left);
  const topDonutEntries = sortedDonutEntries.slice(0, DONUT_TOP_N);
  const otherDonutTotal = sortedDonutEntries.slice(DONUT_TOP_N).reduce((sum, [, amount]) => sum + amount, 0);
  const donutCategories = [
    ...topDonutEntries.map(([name, amount], index) => ({
      name,
      amount,
      pct: donutTotal > 0 ? (amount / donutTotal) * 100 : 0,
      color: DONUT_COLORS[index],
    })),
    ...(otherDonutTotal > 0 ? [{
      name: 'Others',
      amount: otherDonutTotal,
      pct: donutTotal > 0 ? (otherDonutTotal / donutTotal) * 100 : 0,
      color: DONUT_COLORS[DONUT_COLORS.length - 1],
    }] : []),
  ];
  const totalBudget = budgetMonth?.total_budget ?? categories
    .filter((category) => category.type === 'expense' && category.is_active === 1)
    .reduce((sum, category) => sum + category.budget_monthly, 0);
  const budgetUsagePct = totalBudget > 0 ? Math.min((expense / totalBudget) * 100, 100) : 0;
  const budgetDelta = totalBudget - expense;
  const categorySummaries = categoryTransactions
    .reduce<Array<{ key: string; id: string | null; name: string; total: number; type: 'income' | 'expense' }>>((groups, transaction) => {
      const groupKey = transaction.category_id ?? 'uncategorized';
      const groupName = categoryName(transaction.category_id);
      const existing = groups.find((group) => group.key === groupKey);
      const delta = transaction.amount;
      if (existing) {
        existing.total += delta;
        return groups;
      }
      return [...groups, { key: groupKey, id: transaction.category_id, name: groupName, total: delta, type: transaction.type }];
    }, [])
    .sort((left, right) => right.total - left.total);
  const visibleCategorySummaries = categorySummaries.filter((group) => group.type === categoryTab);
  const categoryBudgetMap = new Map(
    (budgetMonth?.items ?? []).map((item) => [item.category_id, item.effective_amount])
  );

  const chartMonths = useMemo(
    () => [...monthlyBalances].sort((a, b) => a.month_start - b.month_start).slice(-6),
    [monthlyBalances],
  );
  const chartMax = Math.max(1, ...chartMonths.flatMap((m) => [m.income, m.expense]));
  const chartMonthLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('id-ID', { month: 'short' });
  };
  const CHART_TOP_MARGIN = 18;
  const CHART_BOTTOM_MARGIN = 40;
  const chartValueY = (value: number) =>
    100 - CHART_BOTTOM_MARGIN - (value / chartMax) * (100 - CHART_TOP_MARGIN - CHART_BOTTOM_MARGIN);
  const chartLinePoints = (accessor: (m: MonthlyBalance) => number) =>
    chartMonths
      .map((m, i) => {
        const x = chartMonths.length > 1 ? (i / (chartMonths.length - 1)) * 100 : 50;
        return `${x},${chartValueY(accessor(m))}`;
      })
      .join(' ');

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
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
              {user?.username ?? 'there'}
            </h1>
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => canGoOlderMonth && setSelectedMonthKey(availableMonthKeys[effectiveMonthIndex + 1])}
          disabled={!canGoOlderMonth}
          style={{
            width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--muted)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: canGoOlderMonth ? 'pointer' : 'not-allowed', opacity: canGoOlderMonth ? 1 : 0.35, borderRadius: 8,
          }}
        >
          <ChevronLeftIcon />
        </button>
        <span style={{ minWidth: 130, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
          {monthLabel(selectedYear, selectedMonthNumber)}
        </span>
        <button
          type="button"
          onClick={() => canGoNewerMonth && setSelectedMonthKey(availableMonthKeys[effectiveMonthIndex - 1])}
          disabled={!canGoNewerMonth}
          style={{
            width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--muted)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: canGoNewerMonth ? 'pointer' : 'not-allowed', opacity: canGoNewerMonth ? 1 : 0.35, borderRadius: 8,
          }}
        >
          <ChevronRightIcon />
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
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 22, padding: 18,
          }}>
            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 26, height: 26, borderRadius: 8, background: 'var(--income-soft)', color: 'var(--income)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M12 5l-7 7M12 5l7 7"/>
                  </svg>
                </span>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>Income</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{idr.format(income)}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 26, height: 26, borderRadius: 8, background: 'var(--expense-soft)', color: 'var(--expense)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M12 19l-7-7M12 19l7-7"/>
                  </svg>
                </span>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>Expenses</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{idr.format(expense)}</div>
                </div>
              </div>
            </div>

            {chartMonths.length > 0 && (
              <>
                <div style={{ position: 'relative', height: 132, marginTop: 20, padding: '0 10px' }}>
                  {chartMonths.length > 1 && (
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                    >
                      <polyline
                        points={chartLinePoints((m) => m.income)}
                        fill="none" stroke="var(--income)" strokeWidth="2"
                        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
                      />
                      <polyline
                        points={chartLinePoints((m) => m.expense)}
                        fill="none" stroke="var(--expense)" strokeWidth="2"
                        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  )}

                  <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
                    {chartMonths.map((m, i) => {
                      const isSelected = m.month_key === effectiveMonthKey;
                      const x = chartMonths.length > 1 ? (i / (chartMonths.length - 1)) * 100 : 50;
                      const incomeIsHigher = m.income >= m.expense;
                      const xAnchor = i === 0 ? 0 : i === chartMonths.length - 1 ? -100 : -50;
                      return (
                        <button
                          key={m.month_key}
                          type="button"
                          onClick={() => setSelectedMonthKey(m.month_key)}
                          style={{
                            flex: 1, height: '100%', position: 'relative',
                            border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                            opacity: isSelected ? 1 : 0.55,
                          }}
                        >
                          <ChartSeriesPoint
                            x={x} y={chartValueY(m.income)} xAnchor={xAnchor}
                            anchorAbove={incomeIsHigher} color="var(--income)"
                            value={m.income} isSelected={isSelected}
                          />
                          <ChartSeriesPoint
                            x={x} y={chartValueY(m.expense)} xAnchor={xAnchor}
                            anchorAbove={!incomeIsHigher} color="var(--expense)"
                            value={m.expense} isSelected={isSelected}
                          />
                          <span style={{
                            position: 'absolute', left: `${x}%`, bottom: 0, transform: `translateX(${xAnchor}%)`,
                            fontSize: 9.5, fontWeight: isSelected ? 800 : 600,
                            color: isSelected ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'nowrap',
                          }}>
                            {chartMonthLabel(m.month_key)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--income)' }} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>Income</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--expense)' }} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>Expenses</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {(donutCategories.length > 0 || (categoryTab === 'expense' && (totalBudget > 0 || expense > 0))) && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 22, padding: 18,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{donutTitle}</span>
                <span style={{
                  fontSize: 11.5, fontWeight: 700, color: 'var(--accent)',
                  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  padding: '4px 10px',
                  borderRadius: 999,
                }}>
                  {monthLabel(selectedYear, selectedMonthNumber)}
                </span>
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
                          padding: '0 16px',
                          minHeight: 40,
                          fontSize: 12,
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

              <div style={{ display: 'grid', gap: 8 }}>
                {visibleCategorySummaries.map((group) => {
                  const visual = categoryVisual(group.name);
                  const clickable = group.id !== null;
                  const categoryBudget = group.id ? categoryBudgetMap.get(group.id) ?? 0 : 0;
                  const hasBudget = group.type === 'expense' && categoryBudget > 0;
                  const overBudget = hasBudget && group.total > categoryBudget;
                  const barColor = hasBudget
                    ? (overBudget ? 'var(--expense)' : 'var(--income)')
                    : group.type === 'income' ? 'var(--income)' : 'var(--expense)';
                  const barPct = hasBudget ? Math.min((group.total / categoryBudget) * 100, 100) : 0;
                  return (
                    <div
                      key={group.key}
                      onClick={clickable ? () => navigate(`/categories/${group.id}/transactions`) : undefined}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        border: '1px solid var(--line)',
                        borderRadius: 15,
                        background: 'var(--surface-2)',
                        padding: '9px 11px',
                        cursor: clickable ? 'pointer' : 'default',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                          background: visual.soft, color: visual.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11.5, fontWeight: 800,
                        }}>
                          {group.name.trim()[0]?.toUpperCase() ?? 'T'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {group.name}
                          </div>
                          {hasBudget && (
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>
                              of {shortCurrency(categoryBudget)} budget
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: barColor, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {group.type === 'income' ? '+' : '−'}{idr.format(group.total)}
                        </span>
                        {clickable && (
                          <span style={{ color: 'var(--muted)', display: 'flex', flexShrink: 0 }}>
                            <ChevronRightIcon size={14} />
                          </span>
                        )}
                      </div>
                      <div style={{ marginLeft: 38, height: 4, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                        <div style={{ width: `${barPct}%`, height: '100%', borderRadius: 999, background: barColor, opacity: 0.75 }} />
                      </div>
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

    </PageContainer>
  );
}
