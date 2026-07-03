import { useEffect, useMemo, useState } from 'react';
import PageContainer from '../../components/PageContainer';
import PageHeader from '../../components/PageHeader';
import { PlusIcon } from '../../components/icons';
import { ApiError, apiFetch } from '../../lib/api';
import { categoryVisual, initial } from '../../lib/categories';
import type { BudgetItem, BudgetMonth } from '../../lib/types';

const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function monthInputValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildTotalAmounts(items: BudgetItem[]): Map<string, number> {
  const ownById = new Map(items.map((item) => [item.category_id, item.own_amount]));
  const childrenByParent = new Map<string, BudgetItem[]>();

  for (const item of items) {
    if (!item.parent_id) continue;
    const children = childrenByParent.get(item.parent_id) ?? [];
    children.push(item);
    childrenByParent.set(item.parent_id, children);
  }

  const totals = new Map<string, number>();
  for (const item of items) {
    const childTotal = (childrenByParent.get(item.category_id) ?? []).reduce(
      (sum, child) => sum + (ownById.get(child.category_id) ?? 0),
      0
    );
    totals.set(item.category_id, (ownById.get(item.category_id) ?? 0) + childTotal);
  }

  return totals;
}

export default function BudgetPage() {
  const [selectedMonth, setSelectedMonth] = useState(monthInputValue());
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<BudgetMonth>(`/budgets?month=${selectedMonth}`)
      .then((budgetMonth) => {
        if (cancelled) return;
        setItems(budgetMonth.items);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load budgets');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  const totalsById = useMemo(() => buildTotalAmounts(items), [items]);
  const topLevelItems = useMemo(
    () => items.filter((item) => item.parent_id === null),
    [items]
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, BudgetItem[]>();
    for (const item of items) {
      if (!item.parent_id) continue;
      const children = map.get(item.parent_id) ?? [];
      children.push(item);
      map.set(item.parent_id, children);
    }
    return map;
  }, [items]);

  const totalBudget = topLevelItems.reduce(
    (sum, item) => sum + (totalsById.get(item.category_id) ?? item.own_amount),
    0
  );

  function handleAmountChange(categoryId: string, nextValue: string) {
    const safeValue = nextValue === '' ? 0 : Math.max(0, Number(nextValue));
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.category_id === categoryId
          ? { ...item, own_amount: Number.isFinite(safeValue) ? safeValue : 0 }
          : item
      )
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const response = await apiFetch<BudgetMonth>(`/budgets/${selectedMonth}`, {
        method: 'PUT',
        body: JSON.stringify({
          items: items.map((item) => ({
            category_id: item.category_id,
            amount: item.own_amount,
          })),
        }),
      });
      setItems(response.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save budgets');
    } finally {
      setSaving(false);
    }
  }

  function handleMonthChange(nextMonth: string) {
    setLoading(true);
    setError(null);
    setSelectedMonth(nextMonth);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Budgets"
        backTo="/config"
        info="Set month-specific budget targets for expense categories."
        actions={(
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            aria-label={saving ? 'Saving budgets' : 'Save budgets'}
            style={{
              border: 'none',
              borderRadius: 13,
              width: 40,
              height: 40,
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: saving || loading ? 'wait' : 'pointer',
              boxShadow: '0 8px 16px -6px var(--accent)',
              opacity: saving || loading ? 0.7 : 1,
            }}
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        )}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 18,
          padding: '16px',
          borderRadius: 20,
          border: '1px solid var(--line)',
          background: 'var(--surface)',
          boxShadow: '0 2px 12px rgba(0,0,0,.04)',
        }}
      >
        <div style={{ flex: 1 }}>
          <label
            htmlFor="budget-month"
            style={{ display: 'block', marginBottom: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase' }}
          >
            Month
          </label>
          <input
            id="budget-month"
            type="month"
            value={selectedMonth}
            onChange={(event) => handleMonthChange(event.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 14,
              border: '1px solid var(--line)',
              background: 'var(--surface-2)',
              padding: '12px 14px',
              color: 'var(--ink)',
              fontFamily: 'inherit',
              fontSize: 14.5,
            }}
          />
        </div>

        <div style={{ minWidth: 120, marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>Overall budget</div>
          <div style={{ marginTop: 6, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>
            {idr.format(totalBudget)}
          </div>
        </div>
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>Loading…</p>}
      {error && <p style={{ textAlign: 'center', color: 'var(--expense)', padding: '20px 0' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {topLevelItems.map((item) => {
            const children = childrenByParent.get(item.category_id) ?? [];
            const visual = categoryVisual(item.name);
            const totalAmount = totalsById.get(item.category_id) ?? item.own_amount;

            return (
              <div
                key={item.category_id}
                style={{
                  borderRadius: 22,
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  boxShadow: '0 2px 12px rgba(0,0,0,.04)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '14px 16px' }}>
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 13,
                      flexShrink: 0,
                      background: visual.soft,
                      color: visual.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      fontWeight: 800,
                    }}
                  >
                    {initial(item.name)}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{item.name}</div>
                    <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--muted)' }}>
                      Total {idr.format(totalAmount)}
                    </div>
                  </div>

                  <div style={{ width: '100%', maxWidth: 132, marginLeft: 'auto' }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      Own budget
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={item.own_amount}
                      onChange={(event) => handleAmountChange(item.category_id, event.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        borderRadius: 14,
                        border: '1px solid var(--line)',
                        background: 'var(--surface-2)',
                        padding: '10px 12px',
                        color: 'var(--ink)',
                        fontFamily: 'inherit',
                        fontSize: 14,
                        textAlign: 'right',
                      }}
                    />
                  </div>
                </div>

                {children.map((child) => (
                  <div
                    key={child.category_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 12,
                      padding: '12px 16px 12px 28px',
                      borderTop: '1px solid var(--line)',
                      background: 'var(--surface-2)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{child.name}</div>
                      <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--muted)' }}>
                        Template {idr.format(child.template_amount)}
                      </div>
                    </div>

                    <div style={{ width: '100%', maxWidth: 132, marginLeft: 'auto' }}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={child.own_amount}
                        onChange={(event) => handleAmountChange(child.category_id, event.target.value)}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          borderRadius: 14,
                          border: '1px solid var(--line)',
                          background: '#fff',
                          padding: '10px 12px',
                          color: 'var(--ink)',
                          fontFamily: 'inherit',
                          fontSize: 14,
                          textAlign: 'right',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
