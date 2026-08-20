import { useEffect, useMemo, useState } from 'react';
import PageContainer from '../../components/PageContainer';
import PageHeader from '../../components/PageHeader';
import CategoryBudgetYear from './CategoryBudgetYear';
import { PlusIcon } from '../../components/icons';
import { ApiError, apiFetch } from '../../lib/api';
import { categoryVisual, initial } from '../../lib/categories';
import type { BudgetItem, BudgetMonth } from '../../lib/types';

function CalcIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 6h8M8 10h8M8 14h4M8 18h2" />
    </svg>
  );
}

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
  const [activeBudgetCategoryId, setActiveBudgetCategoryId] = useState<string | null>(null);

  function reloadItems() {
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
  }

  useEffect(reloadItems, [selectedMonth]);

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
          gap: 10,
          marginBottom: 16,
          padding: '13px 14px',
          borderRadius: 16,
          border: '1px solid var(--line)',
          background: 'var(--surface)',
          boxShadow: '0 2px 12px rgba(0,0,0,.04)',
        }}
      >
        <div style={{ flex: 1 }}>
          <label
            htmlFor="budget-month"
            style={{ display: 'block', marginBottom: 5, fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase' }}
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
              borderRadius: 12,
              border: '1px solid var(--line)',
              background: 'var(--surface-2)',
              padding: '10px 12px',
              color: 'var(--ink)',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          />
        </div>

        <div style={{ minWidth: 108, marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>Overall budget</div>
          <div style={{ marginTop: 5, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
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
                  borderRadius: 16,
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  boxShadow: '0 2px 12px rgba(0,0,0,.04)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 9, padding: '10px 12px' }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      flexShrink: 0,
                      background: visual.soft,
                      color: visual.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12.5,
                      fontWeight: 800,
                    }}
                  >
                    {initial(item.name)}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{item.name}</div>
                    <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--muted)' }}>
                      Total {idr.format(totalAmount)}
                    </div>
                  </div>

                  <div style={{ width: '100%', maxWidth: 116, marginLeft: 'auto' }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 9.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      Own budget
                    </label>
                    <button
                      type="button"
                      onClick={() => setActiveBudgetCategoryId(item.category_id)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        borderRadius: 12,
                        border: '1px solid var(--line)',
                        background: 'var(--surface-2)',
                        padding: '8px 10px',
                        color: 'var(--ink)',
                        fontFamily: 'inherit',
                        fontSize: 13,
                        fontWeight: 600,
                        textAlign: 'right',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 6,
                      }}
                    >
                      <span style={{ color: 'var(--muted)', flexShrink: 0 }}><CalcIcon /></span>
                      {new Intl.NumberFormat('id-ID').format(item.own_amount)}
                    </button>
                  </div>
                </div>

                {children.map((child) => (
                  <div
                    key={child.category_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 9,
                      padding: '8px 12px 8px 20px',
                      borderTop: '1px solid var(--line)',
                      background: 'var(--surface-2)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{child.name}</div>
                      <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--muted)' }}>
                        Template {idr.format(child.template_amount)}
                      </div>
                    </div>

                    <div style={{ width: '100%', maxWidth: 116, marginLeft: 'auto' }}>
                      <button
                        type="button"
                        onClick={() => setActiveBudgetCategoryId(child.category_id)}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          borderRadius: 12,
                          border: '1px solid var(--line)',
                          background: '#fff',
                          padding: '8px 10px',
                          color: 'var(--ink)',
                          fontFamily: 'inherit',
                          fontSize: 13,
                          fontWeight: 600,
                          textAlign: 'right',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 6,
                        }}
                      >
                        <span style={{ color: 'var(--muted)', flexShrink: 0 }}><CalcIcon /></span>
                        {new Intl.NumberFormat('id-ID').format(child.own_amount)}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {activeBudgetCategoryId !== null && (
        <CategoryBudgetYear
          categoryId={activeBudgetCategoryId}
          categoryName={items.find((item) => item.category_id === activeBudgetCategoryId)?.name ?? ''}
          year={selectedMonth.slice(0, 4)}
          onClose={() => {
            setActiveBudgetCategoryId(null);
            reloadItems();
          }}
        />
      )}
    </PageContainer>
  );
}
