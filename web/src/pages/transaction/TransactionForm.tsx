import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';
import {
  INSTALLMENT_OPTIONS, RECURRING_MODES, TRANSACTION_TYPES,
  type Account, type Category, type RecurringMode,
  type Transaction, type TransactionInput, type TransactionType,
} from '../../lib/types';
import PageContainer from '../../components/PageContainer';
import TileLookup from '../../components/TileLookup';
import Calculator from '../../components/Calculator';

// ── Inlined icons ──────────────────────────────────────────────────
function WalletIcon()     { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 11h3v4h-3a2 2 0 0 1 0-4z"/></svg>; }
function TagIcon()        { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3zm-2.318 3h.008v.008H7.25V6z"/></svg>; }
function CalcIcon()       { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h4M8 18h2"/></svg>; }
function CalendarIcon()   { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function NoteIcon()       { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>; }
function ChevronRight()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>; }

// ── Formatter ─────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
});

function toDatetimeLocal(unix: number): string {
  const d = new Date(unix * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromDatetimeLocal(v: string): number {
  return Math.floor(new Date(v).getTime() / 1000);
}

// ── Toggle switch ─────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 26, borderRadius: 13, flexShrink: 0,
        border: 'none', cursor: 'pointer',
        background: checked ? 'var(--accent)' : 'var(--line)',
        position: 'relative', transition: 'background .2s',
      }}>
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 20, height: 20, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.22)',
        transition: 'left .2s',
      }} />
    </button>
  );
}

// ── Field row wrapper ─────────────────────────────────────────────
function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 16, padding: '12px 14px',
    }}>
      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', minWidth: 72, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

type LookupTarget    = 'account' | 'transferTo' | 'category';
type CalculatorTarget = 'amount' | 'fee';

export default function TransactionForm() {
  const { id }   = useParams<{ id: string }>();
  const isEdit   = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [type,       setType]       = useState<TransactionType>('expense');
  const [date,       setDate]       = useState(() => toDatetimeLocal(Math.floor(Date.now() / 1000)));
  const [accountId,  setAccountId]  = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount,     setAmount]     = useState(0);
  const [note,       setNote]       = useState('');
  const [fee,        setFee]        = useState<number | null>(null);
  const [parentTxId, setParentTxId] = useState<string | null>(null);

  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringMode,    setRecurringMode]    = useState<RecurringMode>('recurring');
  const [recurringTotal,   setRecurringTotal]   = useState<number>(INSTALLMENT_OPTIONS[0]);
  const [customTotal,      setCustomTotal]      = useState('');

  const [accounts,   setAccounts]   = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const [activeLookup,     setActiveLookup]     = useState<LookupTarget | null>(null);
  const [activeCalculator, setActiveCalculator] = useState<CalculatorTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [accts, cats] = await Promise.all([
          apiFetch<Account[]>('/accounts?include_inactive=true'),
          apiFetch<Category[]>('/categories?include_inactive=true'),
        ]);
        if (cancelled) return;
        setAccounts(accts); setCategories(cats);
        if (id) {
          const tx = await apiFetch<Transaction>(`/transactions/${id}`);
          if (cancelled) return;
          setType(tx.type); setDate(toDatetimeLocal(tx.date));
          setAccountId(tx.account_id); setTransferTo(tx.transfer_to ?? '');
          setCategoryId(tx.category_id ?? ''); setAmount(tx.amount);
          setNote(tx.note ?? ''); setFee(tx.fee);
          setParentTxId(tx.parent_transaction_id);
        } else {
          const presetAccountId = searchParams.get('account_id');
          if (presetAccountId && accts.some((account) => account.id === presetAccountId)) {
            setAccountId(presetAccountId);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, searchParams]);

  function handleTypeChange(t: TransactionType) {
    setType(t); setCategoryId('');
    if (t !== 'transfer') { setTransferTo(''); setFee(null); }
  }

  const categoryLocked  = isEdit && (transferTo !== '' || parentTxId !== null);
  const showTransferTo  = type === 'transfer' || (isEdit && transferTo !== '');
  const showFee         = type === 'transfer' && (!isEdit || fee !== null);
  const categoryItems   = categories.filter((c) => c.type === type);
  const installmentBase = recurringTotal > 0 ? Math.floor(amount / recurringTotal) : 0;

  const accountName  = (v: string) => accounts.find((a) => a.id === v)?.name ?? '';
  const categoryName = (v: string) => categories.find((c) => c.id === v)?.name ?? '';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isEdit) {
      if (!accountId) { setError(type === 'transfer' ? 'Select a from account' : 'Select an account'); return; }
      if (type === 'transfer') {
        if (!transferTo) { setError('Select a to account'); return; }
        if (transferTo === accountId) { setError('From and To accounts must differ'); return; }
      } else if (!categoryId) { setError('Select a category'); return; }
    }
    if (amount <= 0) { setError('Enter an amount'); return; }
    if (!isEdit && recurringEnabled && recurringMode === 'installment' && amount < recurringTotal) {
      setError(`Amount must be at least ${recurringTotal} for installment`); return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const body: Record<string, unknown> = { date: fromDatetimeLocal(date), amount, note };
        if (!categoryLocked) body.category_id = categoryId;
        await apiFetch(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        const body: TransactionInput = {
          date: fromDatetimeLocal(date), account_id: accountId,
          amount, note: note || undefined, type,
        };
        if (type === 'transfer') {
          body.transfer_to = transferTo;
          if (fee !== null) body.fee = fee;
        } else {
          body.category_id = categoryId;
        }
        if (recurringEnabled) body.recurring = { mode: recurringMode, total: recurringTotal };
        await apiFetch('/transactions', { method: 'POST', body: JSON.stringify(body) });
      }
      navigate('/transactions');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isEdit || !id) return;

    setError(null);
    setDeleting(true);
    try {
      await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
      navigate('/transactions');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete');
      setDeleting(false);
    }
  }

  if (loading) return <p style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>Loading…</p>;

  return (
    <PageContainer>

      {/* ── Back + title ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 22,
        position: 'sticky',
        top: 0,
        zIndex: 15,
        padding: '10px 0 12px',
        background: 'color-mix(in srgb, var(--bg) 84%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid color-mix(in srgb, var(--line) 75%, transparent)',
      }}>
        <button type="button" onClick={() => navigate('/transactions')} style={{
          width: 38, height: 38, borderRadius: 12, flexShrink: 0,
          border: '1px solid var(--line)', background: 'var(--surface)',
          color: 'var(--muted)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
          {isEdit ? 'Edit Transaction' : 'Add Transaction'}
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Type segmented ───────────────────────────────────── */}
          {!isEdit ? (
            <div style={{
              display: 'flex', background: 'var(--surface-2)',
              border: '1px solid var(--line)', borderRadius: 16, padding: 4, gap: 4,
            }}>
              {TRANSACTION_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => handleTypeChange(t)} style={{
                  flex: 1, border: 'none', borderRadius: 12, padding: '10px 0',
                  fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
                  textTransform: 'capitalize' as const, cursor: 'pointer',
                  background: type === t ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'transparent',
                  color: type === t ? '#fff' : 'var(--muted)',
                  boxShadow: type === t ? '0 4px 12px -4px var(--accent)' : 'none',
                  transition: 'all .15s',
                }}>
                  {t}
                </button>
              ))}
            </div>
          ) : (
            <div style={{
              background: 'var(--surface-2)', border: '1px solid var(--line)',
              borderRadius: 14, padding: '10px 14px',
              fontSize: 13.5, fontWeight: 600, color: 'var(--muted)',
            }}>
              Type: <span style={{ color: 'var(--ink)', textTransform: 'capitalize', fontWeight: 700 }}>{type}</span>
            </div>
          )}

          {/* ── Amount hero ──────────────────────────────────────── */}
          <button type="button" onClick={() => setActiveCalculator('amount')} style={{
            background: 'var(--surface)', border: `1.5px solid ${amount > 0 ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: 18, padding: '18px 20px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: amount > 0 ? '0 4px 16px -6px var(--accent)' : 'none',
            transition: 'all .15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>Rp</span>
              <span style={{
                fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em',
                color: amount > 0 ? 'var(--ink)' : 'var(--muted)',
              }}>
                {amount > 0 ? new Intl.NumberFormat('id-ID').format(amount) : '0'}
              </span>
            </div>
            <span style={{ color: 'var(--muted)' }}><CalcIcon /></span>
          </button>

          {/* ── Account ──────────────────────────────────────────── */}
          <FieldRow icon={<WalletIcon />} label={type === 'transfer' ? 'From' : 'Account'}>
            {isEdit ? (
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{accountName(accountId)}</span>
            ) : (
              <button type="button" onClick={() => setActiveLookup('account')} style={{
                width: '100%', background: 'none', border: 'none', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: accountId ? 'var(--ink)' : 'var(--muted)' }}>
                  {accountId ? accountName(accountId) : 'Select account'}
                </span>
                <span style={{ color: 'var(--muted)' }}><ChevronRight /></span>
              </button>
            )}
          </FieldRow>

          {/* ── Transfer To ──────────────────────────────────────── */}
          {showTransferTo && (
            <FieldRow icon={<WalletIcon />} label="To">
              {isEdit ? (
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{accountName(transferTo)}</span>
              ) : (
                <button type="button" onClick={() => setActiveLookup('transferTo')} style={{
                  width: '100%', background: 'none', border: 'none', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: transferTo ? 'var(--ink)' : 'var(--muted)' }}>
                    {transferTo ? accountName(transferTo) : 'Select account'}
                  </span>
                  <span style={{ color: 'var(--muted)' }}><ChevronRight /></span>
                </button>
              )}
            </FieldRow>
          )}

          {/* ── Category ─────────────────────────────────────────── */}
          {type !== 'transfer' && (
            <FieldRow icon={<TagIcon />} label="Category">
              {categoryLocked ? (
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{categoryName(categoryId)}</span>
              ) : (
                <button type="button" onClick={() => setActiveLookup('category')} style={{
                  width: '100%', background: 'none', border: 'none', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: categoryId ? 'var(--ink)' : 'var(--muted)' }}>
                    {categoryId ? categoryName(categoryId) : 'Select category'}
                  </span>
                  <span style={{ color: 'var(--muted)' }}><ChevronRight /></span>
                </button>
              )}
            </FieldRow>
          )}

          {/* ── Date ─────────────────────────────────────────────── */}
          <FieldRow icon={<CalendarIcon />} label="Date">
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              style={{
                width: '100%', background: 'none', border: 'none', padding: 0,
                fontSize: 14, fontWeight: 600, color: 'var(--ink)', fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </FieldRow>

          {/* ── Note ─────────────────────────────────────────────── */}
          <FieldRow icon={<NoteIcon />} label="Note">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              style={{
                width: '100%', background: 'none', border: 'none', padding: 0,
                fontSize: 14, fontWeight: 500, color: 'var(--ink)', fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </FieldRow>

          {/* ── Transfer fee ─────────────────────────────────────── */}
          {showFee && (
            <FieldRow icon={<CalcIcon />} label="Fee">
              {isEdit ? (
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{fmt.format(fee ?? 0)}</span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button type="button" onClick={() => setActiveCalculator('fee')} style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: fee !== null ? 'var(--ink)' : 'var(--muted)' }}>
                      {fee !== null ? fmt.format(fee) : 'No fee'}
                    </span>
                  </button>
                  {fee !== null && (
                    <button type="button" onClick={() => setFee(null)} style={{
                      background: 'none', border: 'none', fontSize: 11.5, fontWeight: 600,
                      color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      Clear
                    </button>
                  )}
                </div>
              )}
            </FieldRow>
          )}

          {/* ── Recurring ────────────────────────────────────────── */}
          {!isEdit && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 18, overflow: 'hidden',
            }}>
              {/* Toggle row */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '13px 16px',
                borderBottom: recurringEnabled ? '1px solid var(--line)' : 'none',
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                    Recurring / Installment
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                    Repeat or split this transaction
                  </p>
                </div>
                <Toggle checked={recurringEnabled} onChange={setRecurringEnabled} />
              </div>

              {recurringEnabled && (
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Mode picker */}
                  <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 3, gap: 3 }}>
                    {RECURRING_MODES.map((mode) => (
                      <button key={mode} type="button" onClick={() => setRecurringMode(mode)} style={{
                        flex: 1, border: 'none', borderRadius: 9, padding: '8px 0',
                        fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                        textTransform: 'capitalize' as const, cursor: 'pointer',
                        background: recurringMode === mode
                          ? 'linear-gradient(135deg, var(--accent), var(--accent-2))'
                          : 'transparent',
                        color: recurringMode === mode ? '#fff' : 'var(--muted)',
                        transition: 'all .15s',
                      }}>
                        {mode}
                      </button>
                    ))}
                  </div>

                  {/* Count picker */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
                    {INSTALLMENT_OPTIONS.map((n) => (
                      <button key={n} type="button"
                        onClick={() => { setRecurringTotal(n); setCustomTotal(''); }}
                        style={{
                          borderRadius: 12, padding: '9px 0',
                          fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                          background: recurringTotal === n && !customTotal
                            ? 'linear-gradient(135deg, var(--accent), var(--accent-2))'
                            : 'var(--surface-2)',
                          color: recurringTotal === n && !customTotal ? '#fff' : 'var(--ink)',
                          border: recurringTotal === n && !customTotal ? 'none' : '1px solid var(--line)',
                        } as React.CSSProperties}>
                        {n}×
                      </button>
                    ))}
                    <input type="number" min={2} max={60} placeholder="Custom"
                      value={customTotal}
                      onChange={(e) => {
                        setCustomTotal(e.target.value);
                        const n = Number(e.target.value);
                        if (n >= 2 && n <= 60) setRecurringTotal(n);
                      }}
                      style={{
                        border: '1px solid var(--line)', borderRadius: 12,
                        padding: '9px 6px', textAlign: 'center', fontSize: 13,
                        background: 'var(--surface)', color: 'var(--ink)',
                        fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                  </div>

                  <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    {recurringMode === 'recurring'
                      ? `Repeats ${fmt.format(amount)} every month for ${recurringTotal} months.`
                      : `Splits ${fmt.format(amount)} into ${recurringTotal}× of ${fmt.format(installmentBase)}.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Error ────────────────────────────────────────────── */}
          {error && (
            <div style={{
              padding: '10px 14px', background: 'var(--expense-soft)',
              border: '1px solid color-mix(in srgb, var(--expense) 25%, transparent)',
              borderRadius: 12, fontSize: 13, color: 'var(--expense)', fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          {/* ── Save / Cancel ─────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <div style={{
                position: 'absolute', inset: 4, borderRadius: 14,
                background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                filter: 'blur(12px)', opacity: saving || deleting ? 0.3 : 0.5, transition: 'opacity .2s',
              }} />
              <button type="submit" disabled={saving || deleting} style={{
                position: 'relative', width: '100%', border: 'none', borderRadius: 16, padding: '14px 0',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                color: '#fff', fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
                cursor: saving || deleting ? 'wait' : 'pointer', opacity: saving || deleting ? 0.7 : 1,
                boxShadow: '0 8px 20px -6px var(--accent)', transition: 'opacity .2s',
              }}>
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add transaction'}
              </button>
            </div>
            <button type="button" disabled={saving || deleting} onClick={() => navigate('/transactions')} style={{
              flex: 1, borderRadius: 16, padding: '14px 0',
              border: '1.5px solid var(--line)', background: 'var(--surface)',
              color: 'var(--muted)', fontSize: 15, fontWeight: 700,
              fontFamily: 'inherit', cursor: saving || deleting ? 'wait' : 'pointer',
              opacity: saving || deleting ? 0.7 : 1,
            }}>
              Cancel
            </button>
          </div>

          {isEdit && (
            <button type="button" disabled={saving || deleting} onClick={() => setDeleteOpen(true)} style={{
              width: '100%',
              borderRadius: 16,
              padding: '13px 0',
              border: '1px solid color-mix(in srgb, var(--expense) 28%, transparent)',
              background: 'var(--expense-soft)',
              color: 'var(--expense)',
              fontSize: 14,
              fontWeight: 800,
              fontFamily: 'inherit',
              cursor: saving || deleting ? 'wait' : 'pointer',
              opacity: saving || deleting ? 0.7 : 1,
            }}>
              {deleting ? 'Deleting…' : 'Delete transaction'}
            </button>
          )}

        </div>
      </form>

      {/* ── Lookup overlays ──────────────────────────────────────── */}
      {activeLookup === 'account' && (
        <TileLookup items={accounts} value={accountId} onSelect={setAccountId}
          onClose={() => setActiveLookup(null)} allowParentSelection
          title={type === 'transfer' ? 'From Account' : 'Account'} />
      )}
      {activeLookup === 'transferTo' && (
        <TileLookup items={accounts} value={transferTo} onSelect={setTransferTo}
          onClose={() => setActiveLookup(null)} allowParentSelection title="To Account" />
      )}
      {activeLookup === 'category' && (
        <TileLookup items={categoryItems} value={categoryId} onSelect={setCategoryId}
          onClose={() => setActiveLookup(null)} allowParentSelection={false} title="Category" />
      )}

      {/* ── Calculator overlays ──────────────────────────────────── */}
      {activeCalculator === 'amount' && (
        <Calculator initialValue={amount || undefined}
          onConfirm={(v) => { setAmount(v); setActiveCalculator(null); }}
          onClose={() => setActiveCalculator(null)} />
      )}
      {activeCalculator === 'fee' && (
        <Calculator initialValue={fee ?? undefined}
          onConfirm={(v) => { setFee(v); setActiveCalculator(null); }}
          onClose={() => setActiveCalculator(null)} />
      )}

      {deleteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.32)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 30,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: 24,
              border: '1px solid var(--line)',
              background: 'var(--surface)',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.18)',
              padding: 20,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
              Delete Transaction
            </h2>
            <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              This will remove the transaction from the active ledger and automatically update the account balance and monthly summaries.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              This action can be reversed later from the database only, not from the current app UI.
            </p>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                type="button"
                onClick={() => {
                  if (deleting) return;
                  setDeleteOpen(false);
                }}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  padding: '12px 14px',
                  fontWeight: 600,
                  cursor: deleting ? 'default' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  border: '1px solid var(--expense)',
                  background: 'var(--expense)',
                  color: '#fff',
                  padding: '12px 14px',
                  fontWeight: 700,
                  cursor: deleting ? 'progress' : 'pointer',
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
