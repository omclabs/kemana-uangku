import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';
import { ACCOUNT_TYPES, type Account, type AccountInput, type AccountType } from '../../lib/types';
import PageContainer from '../../components/PageContainer';

const formatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

// Displays a raw numeric string (e.g. "1500000.5", JS Number()-compatible) as
// id-ID grouped input text (e.g. "1.500.000,5").
function formatNumberInput(raw: string): string {
  if (raw === '' || raw === '-') return raw;
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [intPart, decPart] = unsigned.split('.');
  const cleanInt = (intPart || '0').replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '') || '0';
  const grouped = cleanInt.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const display = decPart !== undefined ? `${grouped},${decPart.replace(/[^0-9]/g, '')}` : grouped;
  return negative ? `-${display}` : display;
}

// Inverse of formatNumberInput: turns id-ID grouped input text back into a
// raw numeric string suitable for Number().
function unformatNumberInput(display: string): string {
  if (display === '' || display === '-') return display;
  const negative = display.startsWith('-');
  const unsigned = negative ? display.slice(1) : display;
  const [intPart, decPart] = unsigned.split(',');
  const cleanInt = intPart.replace(/[^0-9]/g, '');
  const raw = decPart !== undefined ? `${cleanInt}.${decPart.replace(/[^0-9]/g, '')}` : cleanInt;
  return negative ? `-${raw}` : raw;
}

export default function AccountForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [balance, setBalance] = useState('0');
  const [parentId, setParentId] = useState('');
  const [includeInTotal, setIncludeInTotal] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [creditLimit, setCreditLimit] = useState('');
  const [billingDate, setBillingDate] = useState('');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const accountList = await apiFetch<Account[]>('/accounts?include_inactive=true');
        if (cancelled) return;
        setAccounts(accountList);

        if (id) {
          const account = await apiFetch<Account>(`/accounts/${id}`);
          if (cancelled) return;
          setName(account.name);
          setType(account.type);
          setBalance(String(account.balance));
          setParentId(account.parent_id ?? '');
          setIncludeInTotal(account.include_in_total === 1);
          setIsActive(account.is_active === 1);
          setCreditLimit(account.credit_limit !== null ? String(account.credit_limit) : '');
          setBillingDate(account.billing_date !== null ? String(account.billing_date) : '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load account');
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const body: AccountInput = {
      name,
      type,
      balance: Number(balance),
      parent_id: parentId || null,
      include_in_total: includeInTotal,
      is_active: isActive,
      credit_limit: type === 'credit_card' ? Number(creditLimit) : null,
      billing_date: type === 'credit_card' ? Number(billingDate) : null,
    };

    try {
      if (isEdit) {
        await apiFetch(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/accounts', { method: 'POST', body: JSON.stringify(body) });
      }
      navigate('/accounts');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save account');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="p-4 text-center text-gray-500">Loading...</p>;
  }

  const topLevelAccounts = accounts.filter(
    (a) => a.parent_id === null && a.id !== id && a.is_active === 1
  );
  const parentOptions = topLevelAccounts.filter((a) => a.type === type);
  const children = accounts.filter((a) => a.parent_id === id);
  const hasActiveChildren = children.some((c) => c.is_active === 1);

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">
        {isEdit ? 'Edit Account' : 'Add Account'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="type">
            Type
          </label>
          <select
            id="type"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base disabled:bg-gray-100 disabled:text-gray-500"
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            disabled={Boolean(parentId)}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </select>
          {parentId && (
            <p className="mt-1 text-xs text-gray-500">Matches parent account&apos;s type.</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="balance">
            Balance
          </label>
          <input
            id="balance"
            type="text"
            inputMode="decimal"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
            value={formatNumberInput(balance)}
            onChange={(e) => setBalance(unformatNumberInput(e.target.value))}
            required
          />
          {(type === 'credit_card' || type === 'loan') && (
            <p className="mt-1 text-xs text-gray-500">Use a negative number for amount owed.</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="parent">
            Parent account (optional)
          </label>
          <select
            id="parent"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">None (top-level)</option>
            {parentOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {type === 'credit_card' && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="creditLimit">
                Credit limit
              </label>
              <input
                id="creditLimit"
                type="text"
                inputMode="decimal"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
                value={formatNumberInput(creditLimit)}
                onChange={(e) => setCreditLimit(unformatNumberInput(e.target.value))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="billingDate">
                Billing date (day of month, 1-28)
              </label>
              <input
                id="billingDate"
                type="number"
                min="1"
                max="28"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
                value={billingDate}
                onChange={(e) => setBillingDate(e.target.value)}
                required
              />
            </div>
          </>
        )}

        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={includeInTotal}
            onChange={(e) => setIncludeInTotal(e.target.checked)}
          />
          Include in net worth total
        </label>

        {isEdit && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={isActive}
                disabled={hasActiveChildren}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active
            </label>
            {hasActiveChildren && (
              <p className="mt-1 text-xs text-gray-500">
                Cannot change: account has active sub-accounts.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-md bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/accounts')}
            className="flex-1 rounded-md border border-gray-300 px-4 py-3 text-base font-medium text-gray-700"
          >
            Cancel
          </button>
        </div>
      </form>

      {isEdit && children.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Sub-accounts
          </h2>
          <ul className="space-y-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  to={`/accounts/${child.id}/edit`}
                  className="block rounded-lg bg-white p-3 shadow-sm hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{child.name}</p>
                      {child.is_active === 0 && (
                        <p className="text-xs text-gray-500">Inactive</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 text-sm font-medium ${
                        child.computed_balance < 0 ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      {formatter.format(child.computed_balance)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageContainer>
  );
}
