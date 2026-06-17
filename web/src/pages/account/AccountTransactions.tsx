import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { categoryVisual } from '../../lib/categories';
import { ApiError, apiFetch } from '../../lib/api';
import type { Account, Category, Transaction } from '../../lib/types';

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
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

function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function ChartBarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function statFmt(value: number): string {
  return new Intl.NumberFormat('id-ID').format(Math.round(Math.abs(value)));
}

function chartLabel(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(abs / 1_000)}K`;
  return String(Math.round(abs));
}

type Tab = 'daily' | 'monthly' | 'annually';
type View = 'chart' | 'list';

interface MonthStat {
  year: number;
  month: number;
  label: string;
  deposit: number;
  withdrawal: number;
  balance: number;
}

interface DayGroup {
  key: string;
  date: Date;
  day: number;
  dayLabel: string;
  dateStr: string;
  deposit: number;
  withdrawal: number;
  items: Transaction[];
}

function classifyTx(transaction: Transaction, accountId: string): 'deposit' | 'withdrawal' {
  if (
    (transaction.type === 'income' && transaction.account_id === accountId) ||
    (transaction.type === 'transfer' && transaction.transfer_to === accountId)
  ) {
    return 'deposit';
  }
  return 'withdrawal';
}

const CHART_LEFT = 36;
const CHART_WIDTH = 264;
const CHART_HEIGHT = 110;
const CHART_BOTTOM = 46;

function niceScale(max: number): number {
  if (max <= 0) return 1_000_000;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

function LineChart({ stats }: { stats: MonthStat[] }) {
  if (stats.length === 0) return null;

  const maxBalance = Math.max(...stats.map((stat) => stat.balance), 0);
  const scale = niceScale(maxBalance);
  const step = stats.length > 1 ? CHART_WIDTH / (stats.length - 1) : CHART_WIDTH;
  const points = stats.map((stat, index) => ({
    x: CHART_LEFT + index * step,
    y: CHART_HEIGHT - Math.max(0, stat.balance / scale) * CHART_HEIGHT,
    ...stat,
  }));
  const polyline = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const area = [
    ...points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`),
    `${(CHART_LEFT + CHART_WIDTH).toFixed(1)},${CHART_HEIGHT}`,
    `${CHART_LEFT},${CHART_HEIGHT}`,
  ].join(' ');
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

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
      <polygon points={area} fill="var(--accent)" opacity="0.1" />
      <polyline points={polyline} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={4}
          fill={index === points.length - 1 ? 'var(--accent)' : 'var(--bg)'}
          stroke="var(--accent)"
          strokeWidth="2"
        />
      ))}
      {points.map((point, index) => (
        <g key={`label-${index}`}>
          <text x={point.x} y={CHART_HEIGHT + 14} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="inherit">
            {point.label}
          </text>
          <text x={point.x} y={CHART_HEIGHT + 28} textAnchor="middle" fontSize="7.5" fill="var(--accent)" fontFamily="inherit" fontWeight="600">
            {chartLabel(point.balance)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function BarChart({ stats }: { stats: MonthStat[] }) {
  if (stats.length === 0) return null;

  const maxValue = Math.max(...stats.flatMap((stat) => [stat.deposit, stat.withdrawal]), 0);
  const scale = niceScale(maxValue);
  const groupWidth = CHART_WIDTH / stats.length;
  const barWidth = Math.min(11, groupWidth / 3);
  const gap = 3;
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

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
        const depositHeight = Math.max(0, (stat.deposit / scale) * CHART_HEIGHT);
        const withdrawalHeight = Math.max(0, (stat.withdrawal / scale) * CHART_HEIGHT);

        return (
          <g key={index}>
            <rect
              x={centerX - barWidth - gap / 2}
              y={CHART_HEIGHT - depositHeight}
              width={barWidth}
              height={depositHeight}
              rx="2"
              fill="var(--income)"
              opacity="0.85"
            />
            <rect
              x={centerX + gap / 2}
              y={CHART_HEIGHT - withdrawalHeight}
              width={barWidth}
              height={withdrawalHeight}
              rx="2"
              fill="var(--expense)"
              opacity="0.85"
            />
            <text x={centerX} y={CHART_HEIGHT + 14} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="inherit">
              {stat.label}
            </text>
            <text x={centerX} y={CHART_HEIGHT + 27} textAnchor="middle" fontSize="7" fill="var(--income)" fontFamily="inherit" fontWeight="600">
              {chartLabel(stat.deposit)}
            </text>
            <text x={centerX} y={CHART_HEIGHT + 38} textAnchor="middle" fontSize="7" fill="var(--expense)" fontFamily="inherit" fontWeight="600">
              {chartLabel(stat.withdrawal)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function AccountTransactions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('daily');
  const [view, setView] = useState<View>('list');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      apiFetch<Account[]>('/accounts?include_inactive=true'),
      apiFetch<Transaction[]>('/transactions'),
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

  const account = useMemo(() => accounts.find((item) => item.id === id) ?? null, [accounts, id]);

  const accountTxs = useMemo(() => {
    if (!id) return [];
    return transactions
      .filter((transaction) => transaction.account_id === id || transaction.transfer_to === id)
      .sort((left, right) => right.date - left.date);
  }, [transactions, id]);

  const monthTxs = useMemo(
    () =>
      accountTxs.filter((transaction) => {
        const date = new Date(transaction.date * 1000);
        return (
          date.getFullYear() === selectedMonth.getFullYear() &&
          date.getMonth() === selectedMonth.getMonth()
        );
      }),
    [accountTxs, selectedMonth],
  );

  const summary = useMemo(() => {
    if (!id) return { deposit: 0, withdrawal: 0, total: 0, balance: account?.computed_balance ?? 0 };

    let deposit = 0;
    let withdrawal = 0;
    for (const transaction of monthTxs) {
      if (classifyTx(transaction, id) === 'deposit') deposit += transaction.amount;
      else withdrawal += transaction.amount;
    }

    return {
      deposit,
      withdrawal,
      total: deposit - withdrawal,
      balance: account?.computed_balance ?? 0,
    };
  }, [monthTxs, account, id]);

  const monthStats = useMemo<MonthStat[]>(() => {
    const slots: MonthStat[] = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - (5 - index), 1);
      return {
        year: date.getFullYear(),
        month: date.getMonth(),
        label: date.toLocaleString('en', { month: 'short' }),
        deposit: 0,
        withdrawal: 0,
        balance: 0,
      };
    });

    if (!id) return slots;

    for (const transaction of accountTxs) {
      const date = new Date(transaction.date * 1000);
      const slot = slots.find((item) => item.year === date.getFullYear() && item.month === date.getMonth());
      if (!slot) continue;
      if (classifyTx(transaction, id) === 'deposit') slot.deposit += transaction.amount;
      else slot.withdrawal += transaction.amount;
    }

    let balance = account?.computed_balance ?? 0;
    for (let index = slots.length - 1; index >= 0; index -= 1) {
      slots[index].balance = balance;
      balance -= slots[index].deposit - slots[index].withdrawal;
    }

    return slots;
  }, [accountTxs, account, id, selectedMonth]);

  const dayGroups = useMemo<DayGroup[]>(() => {
    if (!id) return [];

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
          deposit: 0,
          withdrawal: 0,
          items: [],
        });
      }

      const group = groups.get(key)!;
      if (classifyTx(transaction, id) === 'deposit') group.deposit += transaction.amount;
      else group.withdrawal += transaction.amount;
      group.items.push(transaction);
    }

    return [...groups.values()].sort((left, right) => right.date.getTime() - left.date.getTime());
  }, [monthTxs, id]);

  const statementLabel = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const yearShort = String(year).slice(2);
    const monthPadded = String(month + 1).padStart(2, '0');
    const lastDay = new Date(year, month + 1, 0).getDate();

    if (tab === 'daily') return `${monthPadded}.1.${yearShort} ~ ${monthPadded}.${lastDay}.${yearShort}`;
    if (tab === 'monthly') return String(year);
    return 'All time';
  }, [selectedMonth, tab]);

  const monthTitle = selectedMonth.toLocaleString('en', { month: 'short', year: 'numeric' });
  const catMap = new Map(categories.map((category) => [category.id, category]));

  const tabStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    textAlign: 'center',
    padding: '11px 0',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? 'var(--ink)' : 'var(--muted)',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2.5px solid var(--accent)' : '2.5px solid transparent',
    marginBottom: -1,
    fontFamily: 'inherit',
    cursor: 'pointer',
  });

  const iconButtonStyle: CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '60vh', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (error || !account) {
    return (
      <div style={{ display: 'flex', minHeight: '60vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <p style={{ color: 'var(--expense)', fontSize: 14, textAlign: 'center' }}>{error ?? 'Account not found'}</p>
        <button
          onClick={() => navigate(-1)}
          style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ← Go back
        </button>
      </div>
    );
  }

  const summaryItems = [
    { label: 'Deposit', value: statFmt(summary.deposit), color: 'var(--income)' },
    { label: 'Withdrawal', value: statFmt(summary.withdrawal), color: 'var(--expense)' },
    { label: 'Total', value: statFmt(summary.total), color: 'var(--ink)' },
    { label: 'Balance', value: statFmt(summary.balance), color: 'var(--accent)' },
  ] as const;

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      <div style={{ margin: '0 auto', width: '100%', maxWidth: 768, display: 'flex', minHeight: '100%', flexDirection: 'column', position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px 8px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--line)',
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
            <BackIcon />
          </button>

          <span style={{ margin: '0 8px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 16, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>
            {account.name}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <button
              onClick={() => setSelectedMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
              style={{ width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 8 }}
            >
              <ChevronLeft />
            </button>
            <span style={{ minWidth: 76, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{monthTitle}</span>
            <button
              onClick={() => setSelectedMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
              style={{ width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 8 }}
            >
              <ChevronRight />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', padding: '0 6px', borderBottom: '1px solid var(--line)', background: 'var(--surface)', flexShrink: 0 }}>
          <button style={tabStyle(tab === 'daily')} onClick={() => setTab('daily')}>Daily</button>
          <button style={tabStyle(tab === 'monthly')} onClick={() => setTab('monthly')}>Monthly</button>
          <button style={tabStyle(tab === 'annually')} onClick={() => setTab('annually')}>Annually</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px', background: 'var(--surface)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Statement</div>
            <div style={{ marginTop: 1, fontSize: 17, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>{statementLabel}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setView((current) => (current === 'chart' ? 'list' : 'chart'))}
              style={{ ...iconButtonStyle, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
              title={view === 'chart' ? 'Switch to list' : 'Switch to chart'}
            >
              {view === 'chart' ? <ListIcon /> : <ChartBarIcon />}
            </button>
            <button
              onClick={() => navigate(`/accounts/${account.id}/edit`)}
              style={{ ...iconButtonStyle, background: 'transparent', color: 'var(--muted)' }}
              title="Edit account"
            >
              <PencilIcon />
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          {summaryItems.map((item, index) => (
            <div
              key={item.label}
              style={{
                padding: '9px 6px',
                paddingLeft: index === 0 ? 12 : 6,
                paddingRight: index === 3 ? 12 : 6,
                borderRight: index < 3 ? '1px solid var(--line)' : 'none',
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{item.label}</div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 11,
                  fontWeight: 800,
                  color: item.color,
                  letterSpacing: '-.03em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 84 }}>
          {view === 'chart' ? (
            <div style={{ padding: '16px 14px 32px' }}>
              <div style={{ marginBottom: 28 }}>
                <div style={{ marginBottom: 10, fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Balance Trend
                </div>
                <LineChart stats={monthStats} />
              </div>
              <div>
                <div style={{ marginBottom: 10, fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Deposit &amp; Withdrawal
                </div>
                <BarChart stats={monthStats} />
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--income)', opacity: 0.85 }} />
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>Deposit</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--expense)', opacity: 0.85 }} />
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>Withdrawal</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {dayGroups.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 56, color: 'var(--muted)', fontSize: 14 }}>
                  No transactions this month
                </div>
              ) : (
                dayGroups.map((group) => (
                  <div key={group.key}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 16px 9px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
                      <span style={{ minWidth: 30, fontSize: 22, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>
                        {String(group.day).padStart(2, '0')}
                      </span>
                      <span style={{ flexShrink: 0, borderRadius: 5, background: 'var(--accent)', color: '#fff', padding: '2px 6px', fontSize: 9.5, fontWeight: 700 }}>
                        {group.dayLabel}
                      </span>
                      <span style={{ flex: 1, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{group.dateStr}</span>
                      {group.deposit > 0 && <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: 'var(--income)' }}>Rp {statFmt(group.deposit)}</span>}
                      {group.withdrawal > 0 && (
                        <span style={{ whiteSpace: 'nowrap', marginLeft: group.deposit > 0 ? 6 : 0, fontSize: 11, fontWeight: 700, color: 'var(--expense)' }}>
                          Rp {statFmt(group.withdrawal)}
                        </span>
                      )}
                    </div>

                    {group.items.map((transaction) => {
                      const category = catMap.get(transaction.category_id ?? '');
                      const isDeposit = id ? classifyTx(transaction, id) === 'deposit' : false;
                      const visual = categoryVisual(transaction.type === 'transfer' ? 'transfer' : category?.name);
                      const label = transaction.note ?? '';
                      const sublabel = transaction.type === 'transfer'
                        ? 'Transfer'
                        : category?.name ?? '';

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
                              fontSize: 15,
                            }}
                          >
                            {transaction.type === 'transfer' ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d={isDeposit ? 'M5 12h14M15 6l6 6-6 6' : 'M19 12H5M9 6l-6 6 6 6'} />
                              </svg>
                            ) : (
                              (category?.name ?? 'T').trim()[0].toUpperCase()
                            )}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {label}
                            </div>
                            {sublabel && <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>{sublabel}</div>}
                          </div>

                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: isDeposit ? 'var(--income)' : 'var(--expense)' }}>
                              {isDeposit ? '+' : '−'}Rp {statFmt(transaction.amount)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => navigate(`/transactions/new?account_id=${id}`)}
          style={{
            position: 'fixed',
            right: 20,
            bottom: 76,
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: 'none',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 8px 20px -6px var(--accent)',
            zIndex: 20,
          }}
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}
