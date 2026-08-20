import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import StyledSelect from '../../components/StyledSelect';
import ToggleSwitch from '../../components/ToggleSwitch';
import { ApiError, apiFetch } from '../../lib/api';
import { ACCOUNT_TYPES, type Account, type AccountInput, type AccountType } from '../../lib/types';
import PageContainer from '../../components/PageContainer';

function formatNumberInput(raw: string): string {
  if (raw === '' || raw === '-') return raw;
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [intPart, decPart] = unsigned.split('.');
  const cleanInt = (intPart || '0').replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '') || '0';
  const grouped  = cleanInt.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const display  = decPart !== undefined ? `${grouped},${decPart.replace(/[^0-9]/g, '')}` : grouped;
  return negative ? `-${display}` : display;
}

function unformatNumberInput(display: string): string {
  if (display === '' || display === '-') return display;
  const negative = display.startsWith('-');
  const unsigned = negative ? display.slice(1) : display;
  const [intPart, decPart] = unsigned.split(',');
  const cleanInt = intPart.replace(/[^0-9]/g, '');
  const raw = decPart !== undefined ? `${cleanInt}.${decPart.replace(/[^0-9]/g, '')}` : cleanInt;
  return negative ? `-${raw}` : raw;
}

const TYPE_META: Record<AccountType, { label: string; color: string; bg: string; icon: ReactNode }> = {
  bank:        { label: 'Bank',        color: '#2563EB', bg: 'rgba(59,130,246,.12)',  icon: <path d="M4 10h16M5 10l7-5 7 5M6 10v8M10 10v8M14 10v8M18 10v8M4 18h16"/> },
  cash:        { label: 'Cash',        color: '#059669', bg: 'rgba(16,185,129,.12)',  icon: <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></> },
  autodebet:   { label: 'Auto Debet',  color: '#D97706', bg: 'rgba(245,158,11,.12)',  icon: <path d="M3 12a9 9 0 0 1 15-6.7L21 8M3 12l3-2.7A9 9 0 0 0 21 12"/> },
  credit_card: { label: 'Credit Card', color: '#7C3AED', bg: 'rgba(139,92,246,.12)', icon: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></> },
  prepaid:     { label: 'Prepaid',     color: '#0891B2', bg: 'rgba(14,165,233,.12)',  icon: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M12 10v4M10 12h4"/></> },
  savings:     { label: 'Savings',     color: '#059669', bg: 'rgba(16,185,129,.12)',  icon: <path d="M12 2a7 7 0 0 1 7 7c0 4.4-7 13-7 13S5 13.4 5 9a7 7 0 0 1 7-7z"/> },
  investment:  { label: 'Investment',  color: '#D97706', bg: 'rgba(245,158,11,.12)',  icon: <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></> },
  loan:        { label: 'Loan',        color: '#DC2626', bg: 'rgba(239,68,68,.12)',   icon: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/> },
};

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 11.5, fontWeight: 700,
        color: 'var(--muted)', letterSpacing: '.05em',
        textTransform: 'uppercase', marginBottom: 7,
      }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--muted)' }}>{hint}</p>}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--surface)', border: '1px solid var(--line)',
  borderRadius: 14, padding: '12px 14px',
  fontSize: 15, color: 'var(--ink)', fontFamily: 'inherit',
  outline: 'none', transition: 'border-color .15s',
};

export default function AccountForm() {
  const { id }   = useParams<{ id: string }>();
  const isEdit   = Boolean(id);
  const navigate = useNavigate();

  const [name,           setName]           = useState('');
  const [type,           setType]           = useState<AccountType>('bank');
  const [balance,        setBalance]        = useState('0');
  const [parentId,       setParentId]       = useState('');
  const [includeInTotal, setIncludeInTotal] = useState(true);
  const [countTransferAsExpense, setCountTransferAsExpense] = useState(false);
  const [isActive,       setIsActive]       = useState(true);
  const [creditLimit,    setCreditLimit]    = useState('');
  const [billingDate,    setBillingDate]    = useState('');
  const [accounts,       setAccounts]       = useState<Account[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await apiFetch<Account[]>('/accounts?include_inactive=true');
        if (cancelled) return;
        setAccounts(list);
        if (id) {
          const acct = await apiFetch<Account>(`/accounts/${id}`);
          if (cancelled) return;
          setName(acct.name);
          setType(acct.type);
          setBalance(String(acct.balance));
          setParentId(acct.parent_id ?? '');
          setIncludeInTotal(acct.include_in_total === 1);
          setCountTransferAsExpense(acct.count_transfer_as_expense === 1);
          setIsActive(acct.is_active === 1);
          setCreditLimit(acct.credit_limit !== null ? String(acct.credit_limit) : '');
          setBillingDate(acct.billing_date !== null ? String(acct.billing_date) : '');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const body: AccountInput = {
      name, type,
      balance: Number(balance),
      parent_id:       parentId || null,
      include_in_total: includeInTotal,
      count_transfer_as_expense: countTransferAsExpense,
      is_active:        isActive,
      credit_limit:     type === 'credit_card' ? Number(creditLimit) : null,
      billing_date:     type === 'credit_card' ? Number(billingDate) : null,
    };
    try {
      if (isEdit) {
        await apiFetch(`/accounts/${id}`, { method: 'PUT',  body: JSON.stringify(body) });
      } else {
        await apiFetch('/accounts',        { method: 'POST', body: JSON.stringify(body) });
      }
      navigate('/accounts');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>Loading…</p>;

  const byName = (left: Account, right: Account) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  const topLevelAccounts = accounts.filter(
    (a) => a.parent_id === null && a.id !== id && a.is_active === 1,
  ).sort(byName);
  const parentOptions   = topLevelAccounts.filter((a) => a.type === type).sort(byName);
  const parentSelectOptions = [
    { value: '', label: 'None (top-level)', hint: 'Create this as a main account' },
    ...parentOptions.map((account) => ({
      value: account.id,
      label: account.name,
      hint: TYPE_META[account.type].label,
    })),
  ];
  const children        = accounts.filter((a) => a.parent_id === id).sort(byName);
  const hasActiveKids   = children.some((c) => c.is_active === 1);

  return (
    <PageContainer>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 24,
        position: 'sticky',
        top: 0,
        zIndex: 15,
        padding: '10px 0 12px',
        background: 'color-mix(in srgb, var(--bg) 84%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid color-mix(in srgb, var(--line) 75%, transparent)',
      }}>
        <button
          type="button"
          onClick={() => navigate('/accounts')}
          style={{
            width: 38, height: 38, borderRadius: 12, flexShrink: 0,
            border: '1px solid var(--line)', background: 'var(--surface)',
            color: 'var(--muted)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
          {isEdit ? 'Edit Account' : 'Add Account'}
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Field label="Account Type">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {ACCOUNT_TYPES.map((t) => {
                const meta    = TYPE_META[t];
                const active  = type === t;
                const disabled = Boolean(parentId) && t !== type;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={disabled}
                    onClick={() => { if (!parentId) setType(t); }}
                    style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      gap: 5, padding: '10px 4px',
                      borderRadius: 14,
                      border: active ? `2px solid ${meta.color}` : '1.5px solid var(--line)',
                      background: active ? meta.bg : 'var(--surface)',
                      color: active ? meta.color : 'var(--muted)',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.4 : 1,
                      transition: 'all .15s',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {meta.icon}
                    </svg>
                    <span style={{ fontSize: 9.5, fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {parentId && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                Type matches parent account.
              </p>
            )}
          </Field>

          <Field label="Account Name">
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. BCA Tabungan"
              required
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--line)'; }}
            />
          </Field>

          <Field
            label="Balance"
            hint={(type === 'credit_card' || type === 'loan') ? 'Use a negative number for amount owed.' : undefined}
          >
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                fontSize: 15, fontWeight: 600, color: 'var(--muted)', pointerEvents: 'none',
              }}>Rp</span>
              <input
                id="balance"
                type="text"
                inputMode="decimal"
                value={formatNumberInput(balance)}
                onChange={(e) => setBalance(unformatNumberInput(e.target.value))}
                required
                style={{ ...inputStyle, paddingLeft: 38 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--line)'; }}
              />
            </div>
          </Field>

          <Field label="Parent Account (optional)">
            {parentOptions.length === 0 ? (
              <div style={{
                background: 'var(--surface-2)', border: '1px solid var(--line)',
                borderRadius: 14, padding: '12px 14px',
                fontSize: 14, color: 'var(--muted)',
              }}>
                No {TYPE_META[type].label.toLowerCase()} accounts available as parent.
              </div>
            ) : (
              <StyledSelect
                value={parentId}
                options={parentSelectOptions}
                onChange={(nextValue) => {
                  setParentId(nextValue);
                  if (nextValue) {
                    const parent = accounts.find((a) => a.id === nextValue);
                    if (parent) setType(parent.type);
                  }
                }}
              />
            )}
          </Field>

          {type === 'credit_card' && (
            <div style={{
              background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
              borderRadius: 18, padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                Credit Card Details
              </p>
              <Field label="Credit Limit">
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 15, fontWeight: 600, color: 'var(--muted)', pointerEvents: 'none' }}>Rp</span>
                  <input
                    id="creditLimit"
                    type="text"
                    inputMode="decimal"
                    value={formatNumberInput(creditLimit)}
                    onChange={(e) => setCreditLimit(unformatNumberInput(e.target.value))}
                    required
                    style={{ ...inputStyle, paddingLeft: 38 }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                    onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--line)'; }}
                  />
                </div>
              </Field>
              <Field label="Billing Date" hint="Day of month (1–28)">
                <input
                  id="billingDate"
                  type="number"
                  min="1" max="28"
                  value={billingDate}
                  onChange={(e) => setBillingDate(e.target.value)}
                  required
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--line)'; }}
                />
              </Field>
            </div>
          )}

          <div style={{
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 18, overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--line)',
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                  Include in net worth
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  Count this account in total balance
                </p>
              </div>
              <ToggleSwitch checked={includeInTotal} onChange={setIncludeInTotal} />
            </div>

            {(type === 'credit_card' || type === 'loan') && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--line)',
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                    Count payments as expense
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                    Transfers into this account count as an expense in totals (e.g. loan installments)
                  </p>
                </div>
                <ToggleSwitch checked={countTransferAsExpense} onChange={setCountTransferAsExpense} />
              </div>
            )}

            {isEdit && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, padding: '14px 16px',
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                    Active
                  </p>
                  {hasActiveKids && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                      Cannot deactivate: has active sub-accounts
                    </p>
                  )}
                </div>
                <ToggleSwitch checked={isActive} onChange={setIsActive} disabled={hasActiveKids} />
              </div>
            )}
          </div>

          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'var(--expense-soft)', border: '1px solid color-mix(in srgb, var(--expense) 25%, transparent)',
              borderRadius: 12, fontSize: 13, color: 'var(--expense)', fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              width: '100%', border: 'none', borderRadius: 16, padding: '14px 0',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              color: '#fff', fontSize: 15, fontWeight: 800,
              fontFamily: 'inherit', cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
              boxShadow: '0 8px 20px -6px var(--accent)',
              transition: 'opacity .2s',
            }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add account'}
          </button>
        </div>
      </form>
    </PageContainer>
  );
}
