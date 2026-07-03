import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StyledSelect from '../../components/StyledSelect';
import PageContainer from '../../components/PageContainer';
import PageHeader from '../../components/PageHeader';
import { ApiError, apiFetch } from '../../lib/api';
import { categoryVisual, initial } from '../../lib/categories';
import type { Category, TrackedItem, TrackedItemInput, TrackedItemRefill } from '../../lib/types';

const UNIT_SUGGESTIONS = ['kWh', 'bottle', 'kg', 'pack', 'gallon', 'tabung'];

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 14,
  padding: '12px 14px',
  fontSize: 15,
  color: 'var(--ink)',
  fontFamily: 'inherit',
  outline: 'none',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--muted)',
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  marginBottom: 7,
};

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <p style={{ margin: '7px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>{hint}</p>}
    </div>
  );
}

export default function TrackedItemForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unit, setUnit] = useState('');
  const [warningDays, setWarningDays] = useState('3');
  const [isActive, setIsActive] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [refills, setRefills] = useState<TrackedItemRefill[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const categoryList = await apiFetch<Category[]>('/categories?type=expense&include_inactive=true');
        if (cancelled) return;
        setCategories(categoryList.filter((category) => category.parent_id !== null));

        if (id) {
          const [item, refillList] = await Promise.all([
            apiFetch<TrackedItem>(`/tracked-items/${id}`),
            apiFetch<TrackedItemRefill[]>(`/tracked-items/${id}/refills`),
          ]);
          if (cancelled) return;
          setName(item.name);
          setCategoryId(item.category_id);
          setUnit(item.unit);
          setWarningDays(String(item.warning_days));
          setIsActive(item.is_active === 1);
          setRefills(refillList);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load tracked item');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function stepWarning(delta: number) {
    setWarningDays((prev) => String(Math.max(1, (Number(prev) || 0) + delta)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const body: TrackedItemInput = {
      name,
      category_id: categoryId,
      unit,
      warning_days: Number(warningDays),
      is_active: isActive,
    };

    try {
      if (isEdit) {
        await apiFetch(`/tracked-items/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/tracked-items', { method: 'POST', body: JSON.stringify(body) });
      }
      navigate('/config/tracked-items');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save tracked item');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>Loading…</p>;
  }

  const activeCategory = categories.find((category) => category.id === categoryId) ?? null;
  const previewVisual = categoryVisual(activeCategory?.name || name || unit || 'Tracked');
  const categoryOptions = categories.map((category) => ({
    value: category.id,
    label: category.name,
    hint: category.parent_id ? 'Sub-category' : 'Top-level',
  }));
  const visibleRefills = refills.slice(0, 5);
  return (
    <PageContainer>
      <PageHeader
        title={isEdit ? 'Edit Tracked Item' : 'Add Tracked Item'}
        backTo="/config/tracked-items"
        info={isEdit ? 'Update the item settings and forecast rules.' : 'Create an item to forecast refill reminders.'}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderRadius: 18,
          border: '1px solid var(--line)',
          background: 'var(--surface)',
          padding: '13px 14px',
          boxShadow: '0 4px 16px -6px rgba(60,45,110,.12)',
          marginBottom: 18,
        }}
      >
        <span style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, background: previewVisual.soft, color: previewVisual.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800 }}>
          {initial(name || unit || 'Tracked')}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name || 'New tracked item'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {activeCategory?.name ?? 'Choose category'}{unit ? ` · ${unit}` : ''}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Name">
            <input
              id="tracked-item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={inputStyle}
              onFocus={(event) => { event.currentTarget.style.borderColor = 'var(--accent)'; event.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent)'; }}
              onBlur={(event) => { event.currentTarget.style.borderColor = 'var(--line)'; event.currentTarget.style.boxShadow = 'none'; }}
            />
          </Field>

          <Field label="Category">
            <StyledSelect
              value={categoryId}
              onChange={setCategoryId}
              placeholder="Select expense category"
              options={categoryOptions}
            />
          </Field>

          <Field label="Unit">
            <input
              id="tracked-item-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="kWh, bottle, kg"
              required
              style={inputStyle}
              onFocus={(event) => { event.currentTarget.style.borderColor = 'var(--accent)'; event.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent)'; }}
              onBlur={(event) => { event.currentTarget.style.borderColor = 'var(--line)'; event.currentTarget.style.boxShadow = 'none'; }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {UNIT_SUGGESTIONS.map((suggestion) => {
                const active = unit === suggestion;
                return (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setUnit(suggestion)}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      color: active ? 'var(--accent)' : 'var(--muted)',
                      background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface-2)',
                      border: active ? '1px solid transparent' : '1px solid var(--line)',
                      padding: '4px 10px',
                      borderRadius: 999,
                    }}
                  >
                    {suggestion}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Warning Days" hint="Remind this many days before the estimated run-out date.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '8px 10px 8px 14px' }}>
              <input
                id="tracked-item-warning"
                type="number"
                min="1"
                value={warningDays}
                onChange={(e) => setWarningDays(e.target.value)}
                required
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 700, color: 'var(--ink)', fontFamily: 'inherit' }}
              />
              <button type="button" onClick={() => stepWarning(-1)} aria-label="Decrease" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: 'inherit' }}>−</button>
              <button type="button" onClick={() => stepWarning(1)} aria-label="Increase" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: 'inherit' }}>+</button>
            </div>
          </Field>

          {isEdit && (
            <button
              type="button"
              onClick={() => setIsActive((value) => !value)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '13px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Active</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>Include in forecasts and alerts.</div>
              </div>
              <span style={{ width: 46, height: 27, borderRadius: 999, background: isActive ? 'var(--accent)' : 'var(--line)', display: 'flex', alignItems: 'center', padding: 3, justifyContent: isActive ? 'flex-end' : 'flex-start', flexShrink: 0, transition: 'background .15s' }}>
                <span style={{ width: 21, height: 21, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
              </span>
            </button>
          )}

          {error && <p style={{ fontSize: 13, color: 'var(--expense)', margin: 0 }}>{error}</p>}

          <div style={{ paddingTop: 2 }}>
            <button
              type="submit"
              disabled={saving}
              style={{ width: '100%', padding: 15, border: 'none', borderRadius: 16, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#fff', fontSize: 15, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 12px 22px -10px var(--accent)', opacity: saving ? 0.5 : 1 }}
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add tracked item'}
            </button>
          </div>
        </div>
      </form>

      {isEdit && (
        <section style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
            Refill History
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleRefills.map((refill) => (
              <div
                key={refill.id}
                style={{
                  borderRadius: 16,
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  padding: '12px 14px',
                  boxShadow: '0 4px 16px -6px rgba(60,45,110,.12)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>
                    {new Date(refill.date * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--income)' }}>
                    +{refill.quantity_added} {unit}
                  </div>
                </div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--muted)' }}>
                  Remaining before refill: {refill.remaining_qty_before_refill ?? 'n/a'}
                </div>
                {refill.transaction_id && (
                  <Link
                    to={`/transactions/${refill.transaction_id}/edit`}
                    style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--accent)' }}
                  >
                    Open linked transaction
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>
                  </Link>
                )}
              </div>
            ))}
            {refills.length > 5 && (
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                Showing latest 5 refills.
              </p>
            )}
            {refills.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>No refills yet.</p>
            )}
          </div>
        </section>
      )}
    </PageContainer>
  );
}
