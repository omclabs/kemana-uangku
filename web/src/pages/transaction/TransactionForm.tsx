import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, apiFetch, getUser } from '../../lib/api';
import {
  INSTALLMENT_OPTIONS, RECURRING_MODES, TRANSACTION_TYPES,
  type Account, type Category, type RecurringMode, type TrackedItem,
  type Transaction, type TransactionInput, type TransactionType,
} from '../../lib/types';
import PageContainer from '../../components/PageContainer';
import TileLookup from '../../components/TileLookup';
import Calculator from '../../components/Calculator';
import StyledSelect from '../../components/StyledSelect';
import ToggleSwitch from '../../components/ToggleSwitch';
import FieldRow from '../../components/FieldRow';
import { ChevronRightIcon, TagIcon, WalletIcon } from '../../components/compactIcons';
import { toDatetimePreset as toDatetimeLocal } from '../../lib/dateUtils';

// ── Inlined icons ──────────────────────────────────────────────────
function CalcIcon()       { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h4M8 18h2"/></svg>; }
function CalendarIcon()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function NoteIcon()       { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>; }
function StoreIcon()      { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5M4 9v11h16V9M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0"/></svg>; }

function RequiredLabel({ text }: { text: string }) {
  return (
    <span>
      {text}
      <span style={{ color: 'var(--expense)' }}> *</span>
    </span>
  );
}

// ── Formatter ─────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
});

function normalizeDatePreset(value: string | null): string | null {
  if (!value) return null;
  const dateOnlyMatch = /^(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (dateOnlyMatch) return `${dateOnlyMatch[1]}T00:00`;
  const datetimeMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (datetimeMatch) return value;
  return null;
}

function fromDatetimeLocal(v: string): number {
  return Math.floor(new Date(v).getTime() / 1000);
}

type LookupTarget    = 'account' | 'transferTo' | 'category';
type CalculatorTarget = 'amount' | 'fee';

export default function TransactionForm() {
  const { id }   = useParams<{ id: string }>();
  const isEdit   = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetAccountId = searchParams.get('account_id');
  const presetDate = normalizeDatePreset(searchParams.get('date'));
  const presetCategoryId = searchParams.get('category_id');
  const presetTrackedItemId = searchParams.get('tracked_item_id');
  const continueMode = !isEdit && (presetDate !== null || presetAccountId !== null);
  const user = getUser();
  const assignedAccountIds = user?.assigned_account_ids ?? [];
  const lockedAssignedAccountId = user?.role === 'reimbursement' && assignedAccountIds.length === 1
    ? assignedAccountIds[0]
    : null;

  const [type,       setType]       = useState<TransactionType>('expense');
  const [date,       setDate]       = useState(() => presetDate ?? toDatetimeLocal(Math.floor(Date.now() / 1000)));
  const [accountId,  setAccountId]  = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount,     setAmount]     = useState(0);
  const [note,       setNote]       = useState('');
  const [merchant,   setMerchant]   = useState('');
  const [merchantSuggestions, setMerchantSuggestions] = useState<string[]>([]);
  const [merchantOpen, setMerchantOpen] = useState(false);
  const merchantRootRef = useRef<HTMLDivElement | null>(null);
  const [fee,        setFee]        = useState<number | null>(null);
  const [parentTxId, setParentTxId] = useState<string | null>(null);
  const [paymentTransactionId, setPaymentTransactionId] = useState<string | null>(null);
  const [trackedItemId, setTrackedItemId] = useState('');
  const [refillQuantity, setRefillQuantity] = useState('');
  const [remainingQtyBeforeRefill, setRemainingQtyBeforeRefill] = useState('');

  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringMode,    setRecurringMode]    = useState<RecurringMode>('recurring');
  const [recurringTotal,   setRecurringTotal]   = useState<number>(INSTALLMENT_OPTIONS[0]);
  const [customTotal,      setCustomTotal]      = useState('');

  const [accounts,   setAccounts]   = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [trackedItems, setTrackedItems] = useState<TrackedItem[]>([]);
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
        const [accts, cats, items, merchants] = await Promise.all([
          apiFetch<Account[]>('/accounts?include_inactive=true'),
          apiFetch<Category[]>('/categories?include_inactive=true'),
          apiFetch<TrackedItem[]>('/tracked-items?include_inactive=true'),
          apiFetch<string[]>('/transactions/merchants'),
        ]);
        if (cancelled) return;
        setAccounts(accts); setCategories(cats); setTrackedItems(items);
        setMerchantSuggestions(merchants);
        if (id) {
          const tx = await apiFetch<Transaction>(`/transactions/${id}`);
          if (cancelled) return;
          setType(tx.type); setDate(toDatetimeLocal(tx.date));
          setAccountId(tx.account_id); setTransferTo(tx.transfer_to ?? '');
          setCategoryId(tx.category_id ?? ''); setAmount(tx.amount);
          setNote(tx.note ?? ''); setMerchant(tx.merchant ?? ''); setFee(tx.fee);
          setParentTxId(tx.parent_transaction_id);
          setPaymentTransactionId(tx.payment_transaction_id);
          setTrackedItemId(tx.tracked_item_id ?? '');
          setRefillQuantity(tx.refill_quantity != null ? String(tx.refill_quantity) : '');
          setRemainingQtyBeforeRefill(
            tx.remaining_qty_before_refill != null ? String(tx.remaining_qty_before_refill) : ''
          );
        } else {
          if (lockedAssignedAccountId && accts.some((account) => account.id === lockedAssignedAccountId)) {
            setAccountId(lockedAssignedAccountId);
          } else if (presetAccountId && accts.some((account) => account.id === presetAccountId)) {
            setAccountId(presetAccountId);
          }
          if (presetDate) {
            setDate(presetDate);
          }
          const presetTrackedItem = presetTrackedItemId
            ? items.find((item) => item.id === presetTrackedItemId) ?? null
            : null;
          if (presetTrackedItem) {
            setType('expense');
            setCategoryId(presetTrackedItem.category_id);
            setTrackedItemId(presetTrackedItem.id);
          } else if (presetCategoryId && cats.some((category) => category.id === presetCategoryId)) {
            setType('expense');
            setCategoryId(presetCategoryId);
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
  }, [id, lockedAssignedAccountId, presetAccountId, presetCategoryId, presetDate, presetTrackedItemId]);

  useEffect(() => {
    if (!merchantOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!merchantRootRef.current?.contains(event.target as Node)) {
        setMerchantOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMerchantOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [merchantOpen]);

  const filteredMerchantSuggestions = useMemo(() => {
    const query = merchant.trim().toLowerCase();
    const base = query
      ? merchantSuggestions.filter((m) => m.toLowerCase().includes(query))
      : merchantSuggestions;
    return base.filter((m) => m !== merchant).slice(0, 8);
  }, [merchant, merchantSuggestions]);

  function handleTypeChange(t: TransactionType) {
    setType(t); setCategoryId('');
    if (t !== 'transfer') { setTransferTo(''); setFee(null); }
    if (t !== 'expense') {
      setTrackedItemId('');
      setRefillQuantity('');
      setRemainingQtyBeforeRefill('');
    }
  }

  function handleAccountSelect(nextAccountId: string) {
    setAccountId(nextAccountId);
    if (isEdit) return;
    const nextAccount = accounts.find((account) => account.id === nextAccountId) ?? null;
    if (type === 'transfer' && nextAccount?.type === 'credit_card') {
      setType('expense');
      setTransferTo('');
      setFee(null);
      window.setTimeout(() => setActiveLookup('category'), 0);
      return;
    }
    if (type === 'transfer') {
      window.setTimeout(() => setActiveLookup('transferTo'), 0);
      return;
    }
    window.setTimeout(() => setActiveLookup('category'), 0);
  }

  function handleCategorySelect(nextCategoryId: string) {
    const selectedTrackedItem = trackedItems.find((item) => item.id === trackedItemId) ?? null;
    if (selectedTrackedItem && selectedTrackedItem.category_id !== nextCategoryId) {
      setTrackedItemId('');
      setRefillQuantity('');
      setRemainingQtyBeforeRefill('');
    }
    setCategoryId(nextCategoryId);
    if (!isEdit) {
      setActiveLookup(null);
      setActiveCalculator('amount');
    }
  }

  const sourceAccount = accounts.find((account) => account.id === accountId) ?? null;
  const transferLike = transferTo !== '';
  const displayType: TransactionType = transferLike ? 'transfer' : type;
  const categoryLocked  = isEdit && (transferLike || parentTxId !== null);
  const showTransferTo  = displayType === 'transfer';
  const showFee         = displayType === 'transfer' && (!isEdit || fee !== null);
  const categoryItems   = categories.filter((c) => c.type === type);
  const trackedItemOptions = trackedItems.filter(
    (item) => item.category_id === categoryId && (item.is_active === 1 || item.id === trackedItemId)
  );
  const installmentBase = recurringTotal > 0 ? Math.floor(amount / recurringTotal) : 0;

  const accountName  = (v: string) => accounts.find((a) => a.id === v)?.name ?? '';
  const categoryName = (v: string) => categories.find((c) => c.id === v)?.name ?? '';
  const hasAmount = amount !== 0;
  const transferTypeOptions = !isEdit && sourceAccount?.type === 'credit_card'
    ? TRANSACTION_TYPES.filter((transactionType) => transactionType !== 'transfer')
    : TRANSACTION_TYPES;

  function resetForContinue() {
    setAmount(0);
    setNote('');
    setMerchant('');
    setCategoryId('');
    setTrackedItemId('');
    setRefillQuantity('');
    setRemainingQtyBeforeRefill('');
    if (presetDate !== null) {
      setDate(date);
    }
    if (presetAccountId !== null) {
      setAccountId(accountId || presetAccountId);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isEdit) {
      if (!accountId) { setError(type === 'transfer' ? 'Select a from account' : 'Select an account'); return; }
      if (type === 'transfer') {
        if (sourceAccount?.type === 'credit_card') { setError('Credit card account cannot be a transfer source'); return; }
        if (!transferTo) { setError('Select a to account'); return; }
        if (transferTo === accountId) { setError('From and To accounts must differ'); return; }
      } else if (!categoryId) { setError('Select a category'); return; }
    }
    if (amount === 0) { setError('Enter an amount'); return; }
    if (type === 'expense' && trackedItemId && !refillQuantity) {
      setError('Enter refill quantity'); return;
    }
    if (!isEdit && trackedItemId && recurringEnabled) {
      setError('Tracked item refill is not available for recurring transactions'); return;
    }
    if (!isEdit && recurringEnabled && recurringMode === 'installment' && Math.abs(amount) < recurringTotal) {
      setError(`Amount must be at least ${recurringTotal} for installment`); return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const body: Record<string, unknown> = { date: fromDatetimeLocal(date), amount, note, merchant: merchant || null };
        if (!categoryLocked) body.category_id = categoryId;
        if (displayType !== 'transfer' && type === 'expense') {
          body.tracked_item_id = trackedItemId || null;
          if (trackedItemId) {
            body.refill_quantity = Number(refillQuantity);
            body.remaining_qty_before_refill = remainingQtyBeforeRefill ? Number(remainingQtyBeforeRefill) : null;
          }
        }
        await apiFetch(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        const body: TransactionInput = {
          date: fromDatetimeLocal(date), account_id: accountId,
          amount, note: note || undefined, merchant: merchant || undefined, type,
        };
        if (type === 'transfer') {
          body.transfer_to = transferTo;
          if (fee !== null) body.fee = fee;
        } else {
          body.category_id = categoryId;
          if (trackedItemId) {
            body.tracked_item_id = trackedItemId;
            body.refill_quantity = Number(refillQuantity);
            body.remaining_qty_before_refill = remainingQtyBeforeRefill ? Number(remainingQtyBeforeRefill) : null;
          }
        }
        if (recurringEnabled) body.recurring = { mode: recurringMode, total: recurringTotal };
        await apiFetch('/transactions', { method: 'POST', body: JSON.stringify(body) });
      }
      if (continueMode && !isEdit) {
        const nextSearchParams = new URLSearchParams();
        if (presetDate) {
          nextSearchParams.set('date', date);
        }
        if (presetAccountId) {
          nextSearchParams.set('account_id', accountId || presetAccountId);
        }
        resetForContinue();
        navigate(`/transactions/new?${nextSearchParams.toString()}`, { replace: true });
        return;
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
        gap: 10,
        marginBottom: 18,
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
          width: 34, height: 34, borderRadius: 11, flexShrink: 0,
          border: '1px solid var(--line)', background: 'var(--surface)',
          color: 'var(--muted)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
          {isEdit ? 'Edit Transaction' : 'Add Transaction'}
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

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

          {/* ── Type segmented ───────────────────────────────────── */}
          {!isEdit ? (
            <div style={{
              display: 'flex', background: 'var(--surface-2)',
              border: '1px solid var(--line)', borderRadius: 16, padding: 4, gap: 4,
            }}>
              {transferTypeOptions.map((t) => (
                <button key={t} type="button" onClick={() => handleTypeChange(t)} style={{
                  flex: 1, border: 'none', borderRadius: 12, padding: '9px 0',
                  fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
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
              Type: <span style={{ color: 'var(--ink)', textTransform: 'capitalize', fontWeight: 700 }}>{displayType}</span>
            </div>
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
                fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </FieldRow>

          {/* ── Account ──────────────────────────────────────────── */}
          <FieldRow icon={<WalletIcon />} label={<RequiredLabel text={displayType === 'transfer' ? 'From' : 'Account'} />}>
            {isEdit || lockedAssignedAccountId ? (
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{accountName(accountId)}</span>
            ) : (
              <button type="button" onClick={() => setActiveLookup('account')} style={{
                width: '100%', background: 'none', border: 'none', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: accountId ? 'var(--ink)' : 'var(--muted)' }}>
                  {accountId ? accountName(accountId) : 'Select account'}
                </span>
                <span style={{ color: 'var(--muted)' }}><ChevronRightIcon size={16} strokeWidth={2} /></span>
              </button>
            )}
          </FieldRow>

          {/* ── Transfer To ──────────────────────────────────────── */}
          {showTransferTo && (
            <FieldRow icon={<WalletIcon />} label={<RequiredLabel text="To" />}>
              {isEdit ? (
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{accountName(transferTo)}</span>
              ) : (
                <button type="button" onClick={() => setActiveLookup('transferTo')} style={{
                  width: '100%', background: 'none', border: 'none', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: transferTo ? 'var(--ink)' : 'var(--muted)' }}>
                    {transferTo ? accountName(transferTo) : 'Select account'}
                  </span>
                  <span style={{ color: 'var(--muted)' }}><ChevronRightIcon size={16} strokeWidth={2} /></span>
                </button>
              )}
            </FieldRow>
          )}

          {/* ── Category ─────────────────────────────────────────── */}
          {displayType !== 'transfer' && (
            <FieldRow icon={<TagIcon />} label={<RequiredLabel text="Category" />}>
              {categoryLocked ? (
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{categoryName(categoryId)}</span>
              ) : (
                <button type="button" onClick={() => setActiveLookup('category')} style={{
                  width: '100%', background: 'none', border: 'none', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: categoryId ? 'var(--ink)' : 'var(--muted)' }}>
                    {categoryId ? categoryName(categoryId) : 'Select category'}
                  </span>
                  <span style={{ color: 'var(--muted)' }}><ChevronRightIcon size={16} strokeWidth={2} /></span>
                </button>
              )}
            </FieldRow>
          )}

          {paymentTransactionId && (
            <FieldRow icon={<WalletIcon />} label="Paid by">
              <button
                type="button"
                onClick={() => navigate(`/transactions/${paymentTransactionId}/edit`)}
                style={{
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  color: 'var(--accent)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {paymentTransactionId}
              </button>
            </FieldRow>
          )}

          {/* ── Amount hero ──────────────────────────────────────── */}
          <button type="button" onClick={() => setActiveCalculator('amount')} style={{
            background: 'var(--surface)', border: `1.5px solid ${hasAmount ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: 16, padding: '15px 17px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: hasAmount ? '0 4px 16px -6px var(--accent)' : 'none',
            transition: 'all .15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Rp</span>
              <span style={{
                fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em',
                color: hasAmount ? 'var(--ink)' : 'var(--muted)',
              }}>
                {hasAmount ? new Intl.NumberFormat('id-ID').format(amount) : '0'}
              </span>
            </div>
            <span style={{ color: 'var(--muted)' }}><CalcIcon /></span>
          </button>

          {/* ── Transfer fee ─────────────────────────────────────── */}
          {showFee && (
            <FieldRow icon={<CalcIcon />} label="Fee">
              {isEdit ? (
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{fmt.format(fee ?? 0)}</span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button type="button" onClick={() => setActiveCalculator('fee')} style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: fee !== null ? 'var(--ink)' : 'var(--muted)' }}>
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

          {/* ── Note ─────────────────────────────────────────────── */}
          <FieldRow icon={<NoteIcon />} label="Note">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              rows={2}
              style={{
                width: '100%', background: 'none', border: 'none', padding: 0,
                fontSize: 13, fontWeight: 500, color: 'var(--ink)', fontFamily: 'inherit',
                outline: 'none', resize: 'vertical', lineHeight: 1.4,
              }}
            />
          </FieldRow>

          {/* ── Merchant ─────────────────────────────────────────── */}
          <FieldRow icon={<StoreIcon />} label="Merchant">
            <div ref={merchantRootRef} style={{ position: 'relative' }}>
              <input
                value={merchant}
                onChange={(e) => { setMerchant(e.target.value); setMerchantOpen(true); }}
                onFocus={() => setMerchantOpen(true)}
                placeholder="Optional"
                maxLength={200}
                autoComplete="off"
                role="combobox"
                aria-expanded={merchantOpen && filteredMerchantSuggestions.length > 0}
                style={{
                  width: '100%', background: 'none', border: 'none', padding: 0,
                  fontSize: 13, fontWeight: 500, color: 'var(--ink)', fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              {merchantOpen && filteredMerchantSuggestions.length > 0 && (
                <div
                  role="listbox"
                  style={{
                    position: 'absolute',
                    left: -14,
                    right: -14,
                    top: 'calc(100% + 12px)',
                    zIndex: 30,
                    borderRadius: 22,
                    border: '1px solid var(--line)',
                    background: 'color-mix(in srgb, var(--surface) 92%, white)',
                    boxShadow: '0 24px 44px -24px rgba(16,18,32,.28)',
                    padding: 8,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                    {filteredMerchantSuggestions.map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="option"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setMerchant(m); setMerchantOpen(false); }}
                        style={{
                          width: '100%',
                          border: '1px solid transparent',
                          borderRadius: 16,
                          padding: '11px 12px',
                          background: 'transparent',
                          color: 'var(--ink)',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                          transition: 'background .15s, border-color .15s, color .15s',
                        }}
                      >
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{m}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </FieldRow>

          {displayType === 'expense' && (
            <>
              <FieldRow icon={<TagIcon />} label="Tracked">
                <StyledSelect
                  value={trackedItemId}
                  onChange={setTrackedItemId}
                  placeholder={categoryId ? 'Optional tracked item' : 'Select category first'}
                  disabled={!categoryId || recurringEnabled}
                  options={[
                    { value: '', label: 'None', hint: 'Do not create refill history' },
                    ...trackedItemOptions.map((item) => ({
                      value: item.id,
                      label: item.name,
                      hint: `${item.category_name} · ${item.unit}`,
                    })),
                  ]}
                />
              </FieldRow>

              {trackedItemId && (
                <>
                  <FieldRow icon={<CalcIcon />} label="Refill Qty">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={refillQuantity}
                      onChange={(e) => setRefillQuantity(e.target.value)}
                      required
                      style={{
                        width: '100%', background: 'none', border: 'none', padding: 0,
                        fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />
                  </FieldRow>

                  <FieldRow icon={<CalcIcon />} label="Remaining">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={remainingQtyBeforeRefill}
                      onChange={(e) => setRemainingQtyBeforeRefill(e.target.value)}
                      placeholder="Optional for better forecast"
                      style={{
                        width: '100%', background: 'none', border: 'none', padding: 0,
                        fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />
                  </FieldRow>
                </>
              )}
            </>
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
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    Recurring / Installment
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                    Repeat or split this transaction
                  </p>
                </div>
                <ToggleSwitch checked={recurringEnabled} onChange={setRecurringEnabled} />
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

          {/* ── Save / Cancel ─────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button type="button" disabled={saving || deleting} onClick={() => navigate('/transactions')} style={{
              flex: 1, borderRadius: 16, padding: '13px 0',
              border: '1.5px solid var(--line)', background: 'var(--surface)',
              color: 'var(--muted)', fontSize: 14, fontWeight: 700,
              fontFamily: 'inherit', cursor: saving || deleting ? 'wait' : 'pointer',
              opacity: saving || deleting ? 0.7 : 1,
            }}>
              Cancel
            </button>
            <div style={{ flex: 1, position: 'relative' }}>
              <div style={{
                position: 'absolute', inset: 4, borderRadius: 14,
                background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                filter: 'blur(12px)', opacity: saving || deleting ? 0.3 : 0.5, transition: 'opacity .2s',
              }} />
              <button type="submit" disabled={saving || deleting} style={{
                position: 'relative', width: '100%', border: 'none', borderRadius: 16, padding: '13px 0',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                color: '#fff', fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
                cursor: saving || deleting ? 'wait' : 'pointer', opacity: saving || deleting ? 0.7 : 1,
                boxShadow: '0 8px 20px -6px var(--accent)', transition: 'opacity .2s',
              }}>
                {saving ? 'Saving…' : isEdit ? 'Save changes' : continueMode ? 'Continue' : 'Add transaction'}
              </button>
            </div>
          </div>

          {isEdit && (
            <button type="button" disabled={saving || deleting} onClick={() => setDeleteOpen(true)} style={{
              width: '100%',
              borderRadius: 16,
              padding: '13px 0',
              border: '1px solid color-mix(in srgb, var(--expense) 28%, transparent)',
              background: 'var(--expense-soft)',
              color: 'var(--expense)',
              fontSize: 13,
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
        <TileLookup items={accounts} value={accountId} onSelect={handleAccountSelect}
          onClose={() => setActiveLookup(null)} allowParentSelection
          title={type === 'transfer' ? 'From Account' : 'Account'} />
      )}
      {activeLookup === 'transferTo' && (
        <TileLookup items={accounts} value={transferTo} onSelect={setTransferTo}
          onClose={() => setActiveLookup(null)} allowParentSelection title="To Account" />
      )}
      {activeLookup === 'category' && (
        <TileLookup items={categoryItems} value={categoryId} onSelect={handleCategorySelect}
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
