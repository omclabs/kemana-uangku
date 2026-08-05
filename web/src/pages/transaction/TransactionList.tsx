import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { categoryVisual } from '../../lib/categories';
import { ApiError, apiFetch, getUser } from '../../lib/api';
import { statFmt, signedFmt, cellFmt } from '../../lib/format';
import type { Account, Category, Transaction } from '../../lib/types';
import PageContainer from '../../components/PageContainer';
import {
  DAY_MS, WEEKDAYS, startOfDay, sameDay, weekStart,
  fmtMD, toDatetimePreset, dateKey,
} from '../../lib/dateUtils';

// ── Inlined icons ──────────────────────────────────────────────────
function PlusIcon()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4.5v15m7.5-7.5h-15"/></svg>; }
function CheckIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.75l6 6 9-13.5"/></svg>; }
function ChevronLeft()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.75 19.5 8.25 12l7.5-7.5"/></svg>; }
function ChevronRight() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>; }

// ── Formatters ─────────────────────────────────────────────────────
const monthFmt = new Intl.DateTimeFormat('id-ID', {
  month: 'long', year: 'numeric',
});

function toMonthPreset(unix: number): string {
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

function summarizeTransactions(transactions: Transaction[]) {
  return transactions.reduce(
    (acc, transaction) => {
      acc.income += txIncome(transaction);
      acc.expense += txExpense(transaction);
      acc.total = acc.income - acc.expense;
      return acc;
    },
    { income: 0, expense: 0, total: 0 },
  );
}

type Tab = 'daily' | 'calendar' | 'monthly';

interface DayCell {
  date: Date;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  income: number;
  expense: number;
}

interface WeekRange {
  key: string;
  label: string;
  start: Date;
  end: Date;
  income: number;
  expense: number;
}

interface YearMonth {
  year: number;
  month: number;
  label: string;
  range: string;
  income: number;
  expense: number;
  weeks: WeekRange[];
}

const LONG_PRESS_MS = 420;

function txIncome(transaction: Transaction): number {
  return transaction.type === 'income' && transaction.transfer_to === null ? transaction.amount : 0;
}

function txExpense(transaction: Transaction): number {
  return transaction.type === 'expense' && transaction.transfer_to === null ? transaction.amount : 0;
}

function CalendarView({
  cells,
  summary,
}: {
  cells: DayCell[];
  summary: { income: number; expense: number };
}) {
  const total = summary.income - summary.expense;
  const weeks: DayCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', padding: '10px 16px 9px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <div style={{ fontSize: 8.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Income</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--income)', letterSpacing: '-.025em', marginTop: 2 }}>{statFmt(summary.income)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 8.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Expenses</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--expense)', letterSpacing: '-.025em', marginTop: 2 }}>{statFmt(summary.expense)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 8.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Total</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: total >= 0 ? 'var(--income)' : 'var(--muted)', letterSpacing: '-.025em', marginTop: 2 }}>
            {signedFmt(total).replace('Rp ', '')}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
        {WEEKDAYS.map((weekday, index) => (
          <div key={weekday} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, fontWeight: 700, color: index === 6 ? 'var(--accent)' : 'var(--muted)', padding: '5px 0' }}>
            {weekday}
          </div>
        ))}
      </div>

      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
          {week.map((cell, cellIndex) => {
            const net = cell.income - cell.expense;
            return (
              <div
                key={cellIndex}
                style={{
                  flex: 1,
                  padding: '3px 2px',
                  minHeight: 70,
                  overflow: 'hidden',
                  borderRight: cellIndex < 6 ? '1px solid var(--line)' : 'none',
                  opacity: cell.inMonth ? 1 : 0.42,
                  background: cell.isToday ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : 'transparent',
                }}
              >
                {cell.isToday ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, background: 'var(--accent)', borderRadius: 4, fontSize: 11, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                    {cell.day}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, fontWeight: cell.inMonth ? 700 : 500, color: cellIndex === 6 ? 'var(--accent)' : cell.inMonth ? 'var(--ink)' : 'var(--muted)' }}>
                    {cell.day}
                  </div>
                )}
                {cell.income > 0 && (
                  <div style={{ fontSize: 6, fontWeight: 700, color: 'var(--income)', textAlign: 'right', marginTop: 2, lineHeight: 1.4 }}>
                    {cellFmt(cell.income)}
                  </div>
                )}
                {cell.expense > 0 && (
                  <div style={{ fontSize: 6, fontWeight: 700, color: 'var(--expense)', textAlign: 'right', lineHeight: 1.4 }}>
                    {cellFmt(cell.expense)}
                  </div>
                )}
                {cell.income > 0 && cell.expense > 0 && (
                  <div style={{ fontSize: 5.5, color: 'var(--muted)', textAlign: 'right', lineHeight: 1.4 }}>
                    {signedFmt(net).replace('Rp ', '')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MonthlyView({
  months,
  expandedMonth,
}: {
  months: YearMonth[];
  expandedMonth: number;
}) {
  const totalIncome = months.reduce((sum, month) => sum + month.income, 0);
  const totalExpenses = months.reduce((sum, month) => sum + month.expense, 0);
  const totalNet = totalIncome - totalExpenses;
  const today = new Date();

  const monthRow = (month: YearMonth, expanded: boolean) => {
    const net = month.income - month.expense;
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', padding: '10px 14px', borderBottom: '1px solid var(--line)', background: expanded ? 'var(--surface-2)' : 'transparent' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: expanded ? 800 : 700, color: 'var(--ink)' }}>{month.label}</div>
          {expanded && <div style={{ fontSize: 8.5, color: 'var(--muted)', marginTop: 1 }}>{month.range}</div>}
        </div>
        <div style={{ width: 105, textAlign: 'right', fontSize: 10, fontWeight: 700, color: month.income > 0 ? 'var(--income)' : 'var(--muted)' }}>
          Rp {statFmt(month.income)}
        </div>
        <div style={{ width: 105, textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: month.expense > 0 ? 'var(--expense)' : 'var(--muted)' }}>Rp {statFmt(month.expense)}</div>
          <div style={{ fontSize: 8.5, fontWeight: 600, color: net >= 0 && net !== 0 ? 'var(--income)' : 'var(--muted)' }}>{signedFmt(net)}</div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', padding: '10px 14px 9px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <div style={{ fontSize: 8.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Income</div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--income)', letterSpacing: '-.025em', marginTop: 2 }}>{statFmt(totalIncome)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 8.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Expenses</div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--expense)', letterSpacing: '-.025em', marginTop: 2 }}>{statFmt(totalExpenses)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 8.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Total</div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: totalNet >= 0 ? 'var(--income)' : 'var(--expense)', letterSpacing: '-.025em', marginTop: 2 }}>{statFmt(totalNet)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', padding: '5px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ flex: 1 }} />
        <div style={{ width: 105, textAlign: 'right', fontSize: 8.5, fontWeight: 700, color: 'var(--muted)' }}>Income</div>
        <div style={{ width: 105, textAlign: 'right', fontSize: 8.5, fontWeight: 700, color: 'var(--muted)' }}>Expenses · Total</div>
      </div>

      {months.map((month) => {
        const expanded = month.month === expandedMonth;
        if (!expanded) {
          return <div key={month.month}>{monthRow(month, false)}</div>;
        }
        return (
          <div key={month.month}>
            {monthRow(month, true)}
            {month.weeks.map((week) => {
              const net = week.income - week.expense;
              const current = today >= week.start && today <= week.end;
              return (
                <div
                  key={week.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 14px 8px 22px',
                    borderBottom: '1px solid var(--line)',
                    background: current ? 'color-mix(in srgb, var(--expense) 13%, var(--bg))' : 'transparent',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, fontSize: 10, fontWeight: current ? 700 : 600, color: current ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {week.label}
                  </div>
                  <div style={{ width: 105, textAlign: 'right', fontSize: 10, fontWeight: 700, color: week.income > 0 ? 'var(--income)' : 'var(--muted)' }}>
                    Rp {statFmt(week.income)}
                  </div>
                  <div style={{ width: 105, textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: week.expense > 0 ? 'var(--expense)' : 'var(--ink)' }}>Rp {statFmt(week.expense)}</div>
                    <div style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--muted)' }}>{signedFmt(net)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function TransactionList() {
  const navigate = useNavigate();
  const user = getUser();
  const isReimbursement = user?.role === 'reimbursement';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts,     setAccounts]     = useState<Account[]>([]);
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [tab, setTab] = useState<Tab>('daily');
  const [selection, setSelection] = useState<{ groupKey: string | null; ids: string[] }>({
    groupKey: null,
    ids: [],
  });
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

  function markPaid(transaction: Transaction) {
    if (isReimbursement) return;
    navigate(`/account/${transaction.account_id}/payment?month=${encodeURIComponent(toMonthPreset(transaction.date))}`);
  }

  function clearSelection() {
    setSelection({ groupKey: null, ids: [] });
  }

  function setTabAndReset(nextTab: Tab) {
    clearSelection();
    setTab(nextTab);
  }

  function setSelectedMonthAndReset(nextMonth: Date) {
    clearSelection();
    setSelectedMonth(nextMonth);
  }

  function startSelection(groupKey: string, transactionId: string) {
    setSelection({ groupKey, ids: [transactionId] });
  }

  function toggleTransactionSelection(groupKey: string, transactionId: string) {
    setSelection((current) => {
      if (current.groupKey && current.groupKey !== groupKey) return current;

      const exists = current.ids.includes(transactionId);
      const nextIds = exists
        ? current.ids.filter((item) => item !== transactionId)
        : [...current.ids, transactionId];

      return {
        groupKey: nextIds.length > 0 ? groupKey : null,
        ids: nextIds,
      };
    });
  }

  // ── Derived ──────────────────────────────────────────────────────
  const visible = useMemo(() => transactions.filter((t) => {
    const d = new Date(t.date * 1000);
    return d.getMonth() === selectedMonth.getMonth() && d.getFullYear() === selectedMonth.getFullYear();
  }), [transactions, selectedMonth]);
  const groups = useMemo(() => groupByDate(visible), [visible]);
  const normalizedSelection = useMemo(() => {
    if (tab !== 'daily' || selection.groupKey === null || selection.ids.length === 0) {
      return { groupKey: null, ids: [] as string[] };
    }

    const validIds = selection.ids.filter((transactionId) => {
      const transaction = visible.find((item) => item.id === transactionId);
      return transaction && dateKey(transaction.date) === selection.groupKey;
    });

    return {
      groupKey: validIds.length > 0 ? selection.groupKey : null,
      ids: validIds,
    };
  }, [selection, tab, visible]);
  const selectedIds = normalizedSelection.ids;
  const selectedGroupKey = normalizedSelection.groupKey;
  const selectionMode = tab === 'daily' && selectedIds.length > 0 && selectedGroupKey !== null;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedRows = useMemo(() => {
    if (!selectionMode) return [];
    const rowMap = new Map(visible.map((transaction) => [transaction.id, transaction]));
    return selectedIds
      .map((transactionId) => rowMap.get(transactionId))
      .filter((transaction): transaction is Transaction => Boolean(transaction));
  }, [selectionMode, selectedIds, visible]);
  const visibleSummary = useMemo(() => summarizeTransactions(visible), [visible]);
  const summary = selectionMode ? summarizeTransactions(selectedRows) : visibleSummary;
  const now          = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const canGoNext = tab === 'monthly'
    ? selectedMonth.getFullYear() < currentMonth.getFullYear()
    : selectedMonth.getTime() < currentMonth.getTime();
  const calendar = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const today = new Date();
    const dayMap = new Map<string, { income: number; expense: number }>();
    let income = 0;
    let expense = 0;

    for (const transaction of visible) {
      const date = new Date(transaction.date * 1000);
      const key = String(date.getDate());
      const entry = dayMap.get(key) ?? { income: 0, expense: 0 };
      entry.income += txIncome(transaction);
      entry.expense += txExpense(transaction);
      income += txIncome(transaction);
      expense += txExpense(transaction);
      dayMap.set(key, entry);
    }

    const first = weekStart(new Date(year, month, 1));
    const cells: DayCell[] = [];
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(first.getTime() + index * DAY_MS);
      const inMonth = date.getMonth() === month && date.getFullYear() === year;
      const entry = inMonth ? dayMap.get(String(date.getDate())) ?? { income: 0, expense: 0 } : { income: 0, expense: 0 };
      cells.push({
        date,
        day: date.getDate(),
        inMonth,
        isToday: sameDay(date, today),
        income: entry.income,
        expense: entry.expense,
      });
    }

    const trimmed = cells.length === 42 && cells.slice(35).every((cell) => !cell.inMonth) ? cells.slice(0, 35) : cells;
    return { cells: trimmed, summary: { income, expense } };
  }, [visible, selectedMonth]);
  const yearMonths = useMemo<YearMonth[]>(() => {
    const year = selectedMonth.getFullYear();
    const buckets: YearMonth[] = Array.from({ length: 12 }, (_, month) => ({
      year,
      month,
      label: new Date(year, month, 1).toLocaleString('en', { month: 'short' }),
      range: `${month + 1}.1 ~ ${month + 1}.${new Date(year, month + 1, 0).getDate()}`,
      income: 0,
      expense: 0,
      weeks: [],
    }));

    for (const transaction of transactions) {
      const date = new Date(transaction.date * 1000);
      if (date.getFullYear() !== year) continue;
      const bucket = buckets[date.getMonth()];
      bucket.income += txIncome(transaction);
      bucket.expense += txExpense(transaction);
    }

    const month = selectedMonth.getMonth();
    const monthStartDate = new Date(year, month, 1);
    const monthEndDate = new Date(year, month + 1, 0);
    const weeks: WeekRange[] = [];
    let cursor = weekStart(monthStartDate);
    while (cursor <= monthEndDate) {
      const end = new Date(cursor.getTime() + 6 * DAY_MS);
      weeks.push({
        key: cursor.toISOString(),
        label: `${fmtMD(cursor)} ~ ${fmtMD(end)}`,
        start: startOfDay(cursor),
        end: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59),
        income: 0,
        expense: 0,
      });
      cursor = new Date(cursor.getTime() + 7 * DAY_MS);
    }

    for (const transaction of transactions) {
      const date = new Date(transaction.date * 1000);
      const week = weeks.find((entry) => date >= entry.start && date <= entry.end);
      if (!week || date.getFullYear() !== year) continue;
      week.income += txIncome(transaction);
      week.expense += txExpense(transaction);
    }

    buckets[month].weeks = weeks.reverse();
    return buckets
      .filter((bucket) => bucket.month <= month || bucket.income > 0 || bucket.expense > 0)
      .sort((left, right) => right.month - left.month);
  }, [transactions, selectedMonth]);
  const statementLabel = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const yearShort = String(year).slice(2);
    const monthPadded = String(month + 1).padStart(2, '0');
    const lastDay = new Date(year, month + 1, 0).getDate();
    if (tab === 'daily' || tab === 'calendar') return `${monthPadded}.1.${yearShort} ~ ${monthPadded}.${lastDay}.${yearShort}`;
    return String(year);
  }, [selectedMonth, tab]);
  const periodTitle = tab === 'monthly'
    ? String(selectedMonth.getFullYear())
    : monthFmt.format(selectedMonth);
  const summaryItems = [
    { label: 'Income', value: summary.income, color: 'var(--income)' },
    { label: 'Expense', value: summary.expense, color: 'var(--expense)' },
    { label: 'Total', value: summary.total, color: 'var(--ink)' },
  ] as const;
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

  return (
    <PageContainer>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
        position: 'sticky',
        top: 0,
        zIndex: 15,
        padding: '10px 0 12px',
        background: 'color-mix(in srgb, var(--bg) 84%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid color-mix(in srgb, var(--line) 75%, transparent)',
      }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
          Transactions
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <button type="button" onClick={() => setSelectedMonthAndReset(tab === 'monthly' ? new Date(selectedMonth.getFullYear() - 1, selectedMonth.getMonth(), 1) : new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1))} style={{
            width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--muted)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 8,
          }}>
            <ChevronLeft />
          </button>
          <span style={{ minWidth: 76, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
            {periodTitle}
          </span>
          <button type="button" onClick={() => setSelectedMonthAndReset(tab === 'monthly' ? new Date(selectedMonth.getFullYear() + 1, selectedMonth.getMonth(), 1) : new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1))} disabled={!canGoNext}
            style={{
              width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--muted)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: canGoNext ? 'pointer' : 'not-allowed', opacity: canGoNext ? 1 : 0.35, borderRadius: 8,
            }}>
            <ChevronRight />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', padding: '0 6px', borderBottom: '1px solid var(--line)', background: 'transparent', flexShrink: 0, marginBottom: 14 }}>
        <button style={tabStyle(tab === 'daily')} onClick={() => setTabAndReset('daily')}>Daily</button>
        <button style={tabStyle(tab === 'calendar')} onClick={() => setTabAndReset('calendar')}>Calendar</button>
        <button style={tabStyle(tab === 'monthly')} onClick={() => setTabAndReset('monthly')}>Monthly</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 8px', background: 'transparent', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Statement</div>
          <div style={{ marginTop: 1, fontSize: 17, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>{statementLabel}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isReimbursement && (
            <Link to="/transactions/import" style={{
              display: 'inline-flex', alignItems: 'center',
              borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)',
              padding: '8px 12px', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)',
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}>
              Import
            </Link>
          )}
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

      {!loading && !error && tab === 'daily' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map((group) => {
            const groupDate = new Date(group.date * 1000);
            const latestGroupDate = group.items.reduce(
              (latest, transaction) => Math.max(latest, transaction.date),
              group.date
            );
            const selectableGroup = !selectionMode || selectedGroupKey === group.key;
            const selectedGroupItems = selectionMode && selectedGroupKey === group.key
              ? group.items.filter((transaction) => selectedIdSet.has(transaction.id))
              : group.items;
            const totalsSource = selectionMode && selectedGroupKey === group.key
              ? selectedGroupItems
              : group.items;
            const depositTotal = totalsSource.reduce((sum, transaction) => {
              if (transaction.type === 'income') return sum + transaction.amount;
              return sum;
            }, 0);
            const withdrawalTotal = totalsSource.reduce((sum, transaction) => {
              if (transaction.type === 'expense' || transaction.type === 'transfer') {
                return sum + transaction.amount;
              }
              return sum;
            }, 0);
            return (
              <section key={group.key}>
                <button
                  type="button"
                  onClick={() => navigate(`/transactions/new?date=${encodeURIComponent(toDatetimePreset(latestGroupDate))}`)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '11px 16px 9px',
                    background: 'var(--surface-2)',
                    border: 'none',
                    borderBottom: '1px solid var(--line)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
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
                </button>
                <div>
                  {group.items.map((t) => (
                    <TransactionRow
                      key={t.id}
                      transaction={t}
                      accountName={accountName}
                      categoryName={categoryName}
                      selected={selectedIdSet.has(t.id)}
                      selectionMode={selectionMode}
                      selectable={selectableGroup}
                      onOpen={() => navigate(`/transactions/${t.id}/edit`)}
                      onLongPress={() => startSelection(group.key, t.id)}
                      onToggleSelect={() => toggleTransactionSelection(group.key, t.id)}
                      onMarkPaid={markPaid}
                      showPaymentAction={!isReimbursement}
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
      {!loading && !error && tab === 'calendar' && <CalendarView cells={calendar.cells} summary={calendar.summary} />}
      {!loading && !error && tab === 'monthly' && <MonthlyView months={yearMonths} expandedMonth={selectedMonth.getMonth()} />}
    </PageContainer>
  );
}

function TransactionRow({
  transaction: t, accountName, categoryName, onMarkPaid,
  selected,
  selectionMode,
  selectable,
  onOpen,
  onLongPress,
  onToggleSelect,
  showPaymentAction,
}: {
  transaction: Transaction;
  accountName: (id: string | null) => string;
  categoryName: (id: string | null) => string;
  selected: boolean;
  selectionMode: boolean;
  selectable: boolean;
  onOpen: () => void;
  onLongPress: () => void;
  onToggleSelect: () => void;
  onMarkPaid: (transaction: Transaction) => void;
  showPaymentAction: boolean;
}) {
  const isTransfer = t.transfer_to !== null;
  const isDeposit = t.type === 'income';
  const categoryLabel = categoryName(t.category_id);
  const visual = categoryVisual(isTransfer ? 'transfer' : categoryLabel);
  const noteLines = (t.note ?? '').split('\n');
  const label = noteLines.length > 1 ? `${noteLines[0]}…` : noteLines[0];
  const sublabel = isTransfer
    ? `Transfer - ${accountName(t.account_id)}`
    : `${categoryLabel} - ${accountName(t.account_id)}`;
  const timerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (selectionMode || !selectable || event.button !== 0) return;

    suppressClickRef.current = false;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      suppressClickRef.current = true;
      onLongPress();
      clearTimer();
    }, LONG_PRESS_MS);
  }

  function handlePointerEnd() {
    clearTimer();
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (selectionMode) {
      if (selectable) onToggleSelect();
      return;
    }

    onOpen();
  }

  useEffect(() => () => {
    clearTimer();
  }, []);

  const selectionAffordance = selectionMode && selectable;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        padding: '11px 16px',
        borderBottom: '1px solid var(--line)',
        cursor: selectable || !selectionMode ? 'pointer' : 'default',
        background: selected
          ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))'
          : selectionAffordance
            ? 'color-mix(in srgb, var(--accent) 3%, var(--surface))'
            : 'transparent',
        opacity: !selectionMode || selectable ? 1 : 0.66,
      }}
      onClick={handleClick}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            flexShrink: 0,
            border: selectionAffordance ? `1px solid ${selected ? 'var(--accent)' : 'var(--line)'}` : 'none',
            background: selectionAffordance
              ? selected
                ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
                : 'var(--surface-2)'
              : visual.soft,
            color: selectionAffordance
              ? selected
                ? 'var(--accent)'
                : 'var(--muted)'
              : visual.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          {selectionAffordance ? (
            selected ? <CheckIcon /> : ''
          ) : isTransfer ? (
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
          {showPaymentAction && t.paid_status === 'settle' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMarkPaid(t);
              }}
              onPointerDown={(e) => e.stopPropagation()}
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
              <CheckIcon /> Payment
            </button>
          )}
        </div>
    </div>
  );
}
