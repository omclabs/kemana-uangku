import { useEffect, useState } from 'react';
import Calculator from '../../components/Calculator';
import { ApiError, apiFetch } from '../../lib/api';
import type { CategoryBudgetYear as CategoryBudgetYearData, CategoryBudgetYearMonth } from '../../lib/types';

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

const SEED_ALL = 'ALL' as const;

export default function CategoryBudgetYear({
  categoryId,
  categoryName,
  year,
  onClose,
}: {
  categoryId: string;
  categoryName: string;
  year: string;
  onClose: () => void;
}) {
  const [months, setMonths] = useState<CategoryBudgetYearMonth[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMonthKey, setActiveMonthKey] = useState<string | typeof SEED_ALL | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<CategoryBudgetYearData>(`/budgets/category/${categoryId}/year/${year}`)
      .then((data) => {
        if (!cancelled) setMonths(data.months);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load year budget');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [categoryId, year]);

  async function handleConfirm(value: number) {
    if (activeMonthKey === null) return;

    try {
      if (activeMonthKey === SEED_ALL) {
        const data = await apiFetch<CategoryBudgetYearData>(`/budgets/category/${categoryId}/year/${year}`, {
          method: 'PUT',
          body: JSON.stringify({ amount: value }),
        });
        setMonths(data.months);
      } else {
        await apiFetch(`/budgets/${activeMonthKey}`, {
          method: 'PUT',
          body: JSON.stringify({ items: [{ category_id: categoryId, amount: value }] }),
        });
        setMonths((current) =>
          (current ?? []).map((month) =>
            month.month_key === activeMonthKey ? { ...month, amount: value, is_saved: true } : month
          )
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save budget');
    } finally {
      setActiveMonthKey(null);
    }
  }

  const allUnsaved = months !== null && months.every((month) => !month.is_saved);
  const activeAmount = activeMonthKey === null
    ? undefined
    : activeMonthKey === SEED_ALL
      ? undefined
      : months?.find((month) => month.month_key === activeMonthKey)?.amount || undefined;

  return (
    <>
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.32)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        zIndex: 40, padding: 0,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto',
          borderRadius: '24px 24px 0 0', border: '1px solid var(--line)',
          background: 'var(--surface)', padding: 18,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{categoryName}</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>Budget by month · {year}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 999, border: 'none',
              background: 'var(--surface-2)', color: 'var(--muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <XIcon />
          </button>
        </div>

        {loading && <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0' }}>Loading…</p>}
        {error && <p style={{ textAlign: 'center', color: 'var(--expense)', padding: '12px 0', fontSize: 13 }}>{error}</p>}

        {!loading && months && (
          allUnsaved ? (
            <button
              type="button"
              onClick={() => setActiveMonthKey(SEED_ALL)}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                borderRadius: 16, border: '1.5px dashed var(--line)', background: 'var(--surface-2)',
                padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                  Set budget for the year
                </span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: 'var(--muted)' }}>
                  Applies to all 12 months — you can adjust any month later
                </span>
              </span>
              <span style={{ color: 'var(--accent)', fontSize: 20, fontWeight: 800 }}>+</span>
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {months.map((month, index) => (
                <button
                  key={month.month_key}
                  type="button"
                  onClick={() => setActiveMonthKey(month.month_key)}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                    borderRadius: 12, border: '1px solid var(--line)',
                    background: month.is_saved ? 'var(--surface-2)' : 'var(--surface)',
                    padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    {MONTH_LABELS[index]}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: month.is_saved ? 'var(--ink)' : 'var(--muted)' }}>
                      {new Intl.NumberFormat('id-ID').format(month.amount)}
                    </span>
                    {!month.is_saved && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: 'var(--muted)',
                        background: 'var(--line)', padding: '1px 6px', borderRadius: 999,
                      }}>
                        default
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )
        )}
      </div>
    </div>

    {activeMonthKey !== null && (
      <Calculator
        initialValue={activeAmount}
        onConfirm={handleConfirm}
        onClose={() => setActiveMonthKey(null)}
      />
    )}
    </>
  );
}
