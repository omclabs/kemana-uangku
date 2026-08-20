import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { categoryVisual } from '../../lib/categories';
import { ApiError, apiFetch } from '../../lib/api';
import { statFmt, truncateNote } from '../../lib/format';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/compactIcons';
import type { Account, Category, Transaction } from '../../lib/types';

function chartLabel(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(abs / 1_000)}K`;
  return String(Math.round(abs));
}

interface MonthStat {
  year: number;
  month: number;
  label: string;
  total: number;
}

interface DayGroup {
  key: string;
  date: Date;
  day: number;
  dayLabel: string;
  dateStr: string;
  total: number;
  items: Transaction[];
}

const CHART_LEFT = 36;
const CHART_WIDTH = 264;
const CHART_HEIGHT = 82;
const CHART_BOTTOM = 26;
const MONTH_WINDOW = 5;

function niceScale(max: number): number {
  if (max <= 0) return 1_000_000;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

function CategoryBarChart({ stats, color }: { stats: MonthStat[]; color: string }) {
  if (stats.length === 0) return null;

  const selectedIndex = stats.length - 1;

  const maxValue = Math.max(...stats.map((stat) => stat.total), 0);
  const scale = niceScale(maxValue);
  const groupWidth = CHART_WIDTH / stats.length;
  const barWidth = Math.min(26, groupWidth * 0.56);
  const yTicks = [0, 0.5, 1];

  return (
    <svg viewBox={`0 0 ${CHART_LEFT + CHART_WIDTH} ${CHART_HEIGHT + CHART_BOTTOM}`} style={{ width: '100%', overflow: 'visible' }}>
      {yTicks.map((fraction, index) => (
        <g key={index}>
          <line
            x1={CHART_LEFT}
            y1={CHART_HEIGHT - fraction * CHART_HEIGHT}
            x2={CHART_LEFT + CHART_WIDTH}
            y2={CHART_HEIGHT - fraction * CHART_HEIGHT}
            stroke="var(--line)"
            strokeWidth="1"
          />
          <text
            x={CHART_LEFT - 4}
            y={CHART_HEIGHT - fraction * CHART_HEIGHT + 4}
            textAnchor="end"
            fontSize="9"
            fill="var(--muted)"
            fontFamily="inherit"
          >
            {chartLabel(scale * fraction)}
          </text>
        </g>
      ))}
      {stats.map((stat, index) => {
        const centerX = CHART_LEFT + index * groupWidth + groupWidth / 2;
        const barHeight = Math.max(0, (stat.total / scale) * CHART_HEIGHT);
        const active = index === selectedIndex;

        return (
          <g key={index}>
            <rect
              x={centerX - barWidth / 2}
              y={CHART_HEIGHT - barHeight}
              width={barWidth}
              height={barHeight}
              rx="6"
              fill={color}
              opacity={active ? 1 : 0.32}
            />
            <text
              x={centerX}
              y={CHART_HEIGHT + 15}
              textAnchor="middle"
              fontSize={active ? 10 : 9.5}
              fontWeight={active ? 800 : 600}
              fill={active ? 'var(--ink)' : 'var(--muted)'}
              fontFamily="inherit"
            >
              {stat.label}
            </text>
            {active && (
              <text x={centerX} y={CHART_HEIGHT - barHeight - 7} textAnchor="middle" fontSize="10.5" fill={color} fontFamily="inherit" fontWeight="800">
                {chartLabel(stat.total)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function CategoryTransactions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [category, setCategory] = useState<Category | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    Promise.all([
      apiFetch<Category>(`/categories/${id}`),
      apiFetch<Transaction[]>(`/transactions?category_id=${id}`),
      apiFetch<Account[]>('/accounts?include_inactive=true'),
    ])
      .then(([nextCategory, nextTransactions, nextAccounts]) => {
        if (cancelled) return;
        setCategory(nextCategory);
        setTransactions(nextTransactions);
        setAccounts(nextAccounts);
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof ApiError ? nextError.message : 'Failed to load');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const accountName = (accountId: string) => accounts.find((account) => account.id === accountId)?.name ?? 'Unknown';

  const monthTxs = useMemo(
    () =>
      transactions
        .filter((transaction) => {
          const date = new Date(transaction.date * 1000);
          return date.getFullYear() === selectedMonth.getFullYear()
            && date.getMonth() === selectedMonth.getMonth();
        })
        .sort((left, right) => right.date - left.date),
    [transactions, selectedMonth],
  );

  const monthStats = useMemo<MonthStat[]>(() => {
    const slots: MonthStat[] = Array.from({ length: MONTH_WINDOW }, (_, index) => {
      const date = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - (MONTH_WINDOW - 1 - index), 1);
      return {
        year: date.getFullYear(),
        month: date.getMonth(),
        label: date.toLocaleString('en', { month: 'short' }),
        total: 0,
      };
    });

    for (const transaction of transactions) {
      const date = new Date(transaction.date * 1000);
      const slot = slots.find((item) => item.year === date.getFullYear() && item.month === date.getMonth());
      if (!slot) continue;
      slot.total += transaction.amount;
    }

    return slots;
  }, [transactions, selectedMonth]);

  const selectedMonthTotal = monthStats[MONTH_WINDOW - 1]?.total ?? 0;
  const previousMonthTotal = monthStats[MONTH_WINDOW - 2]?.total ?? 0;
  const hasPreviousBaseline = previousMonthTotal !== 0;
  const trendPct = hasPreviousBaseline
    ? ((selectedMonthTotal - previousMonthTotal) / Math.abs(previousMonthTotal)) * 100
    : 0;
  const trendUp = trendPct > 0;
  const trendFlat = !hasPreviousBaseline || trendPct === 0;

  const dayGroups = useMemo<DayGroup[]>(() => {
    const groups = new Map<string, DayGroup>();
    for (const transaction of monthTxs) {
      const date = new Date(transaction.date * 1000);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          date,
          day: date.getDate(),
          dayLabel: date.toLocaleString('en', { weekday: 'short' }),
          dateStr: `${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`,
          total: 0,
          items: [],
        });
      }

      const group = groups.get(key)!;
      group.total += transaction.amount;
      group.items.push(transaction);
    }

    return [...groups.values()].sort((left, right) => right.date.getTime() - left.date.getTime());
  }, [monthTxs]);

  const periodTitle = selectedMonth.toLocaleString('en', { month: 'short', year: 'numeric' });
  const visual = categoryVisual(category?.name);
  const trendColor = category?.type === 'income' ? 'var(--income)' : 'var(--expense)';

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '60vh', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (error || !category) {
    return (
      <div style={{ display: 'flex', minHeight: '60vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <p style={{ color: 'var(--expense)', fontSize: 14, textAlign: 'center' }}>{error ?? 'Category not found'}</p>
        <button
          onClick={() => navigate(-1)}
          style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ← Go back
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      <div style={{ margin: '0 auto', width: '100%', maxWidth: 768, display: 'flex', minHeight: '100%', flexDirection: 'column', position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 10,
            padding: '10px 16px 8px',
            background: 'color-mix(in srgb, var(--bg) 84%, transparent)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderBottom: '1px solid color-mix(in srgb, var(--line) 75%, transparent)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <button
            onClick={() => navigate(-1)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              color: 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <ChevronLeftIcon size={20} />
          </button>

          <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 16, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em', textAlign: 'left' }}>
            {category.name}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: 'auto' }}>
            <button
              onClick={() => setSelectedMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
              style={{ width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 8 }}
            >
              <ChevronLeftIcon />
            </button>
            <span style={{ minWidth: 76, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{periodTitle}</span>
            <button
              onClick={() => setSelectedMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
              style={{ width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 8 }}
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 32 }}>
          <div style={{ padding: '12px 14px 6px' }}>
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 18,
              padding: '12px 14px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Monthly Trend
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 4 }}>
                <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>
                  Rp {statFmt(selectedMonthTotal)}
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  background: trendFlat ? 'var(--surface-2)' : trendUp ? 'var(--income-soft)' : 'var(--expense-soft)',
                  color: trendFlat ? 'var(--muted)' : trendUp ? 'var(--income)' : 'var(--expense)',
                  padding: '3px 8px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                }}>
                  {trendFlat ? '—' : `${trendUp ? '+' : '−'}${Math.round(Math.abs(trendPct))}%`}
                </span>
              </div>
              <div style={{ marginTop: 1, fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>vs last month</div>

              <div style={{ marginTop: 10 }}>
                <CategoryBarChart stats={monthStats} color={trendColor} />
              </div>
            </div>
          </div>

          <div>
            {dayGroups.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 56, color: 'var(--muted)', fontSize: 14 }}>
                No transactions this month
              </div>
            ) : (
              dayGroups.map((group) => (
                <div key={group.key}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '11px 16px 9px',
                      background: 'var(--surface-2)',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <span style={{ minWidth: 22, fontSize: 15, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>
                      {String(group.day).padStart(2, '0')}
                    </span>
                    <span style={{ flexShrink: 0, borderRadius: 5, background: 'var(--accent)', color: '#fff', padding: '2px 6px', fontSize: 9, fontWeight: 700 }}>
                      {group.dayLabel}
                    </span>
                    <span style={{ flex: 1, fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{group.dateStr}</span>
                    <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: trendColor }}>
                      {category.type === 'income' ? '+' : '−'}Rp {statFmt(group.total)}
                    </span>
                  </div>

                  {group.items.map((transaction) => {
                    const label = truncateNote(transaction.note) || transaction.merchant || category.name;
                    const sublabel = accountName(transaction.account_id);

                    return (
                      <div
                        key={transaction.id}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 16px', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
                        onClick={() => navigate(`/transactions/${transaction.id}/edit`)}
                      >
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 11,
                            background: visual.soft,
                            color: visual.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            fontWeight: 700,
                            fontSize: 14,
                          }}
                        >
                          {category.name.trim()[0]?.toUpperCase() ?? 'T'}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {label}
                          </div>
                          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>{sublabel}</div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: trendColor }}>
                            {category.type === 'income' ? '+' : '−'}Rp {statFmt(transaction.amount)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
