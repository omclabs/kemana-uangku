import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';
import {
  INSTALLMENT_OPTIONS,
  RECURRING_MODES,
  TRANSACTION_TYPES,
  type Account,
  type Category,
  type RecurringMode,
  type Transaction,
  type TransactionInput,
  type TransactionType,
} from '../../lib/types';
import PageContainer from '../../components/PageContainer';
import TileLookup from '../../components/TileLookup';
import Calculator from '../../components/Calculator';
import { CalculatorIcon, CheckIcon, TagIcon, WalletIcon, XMarkIcon } from '../../components/icons';

const formatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function toDatetimeLocal(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

type LookupTarget = 'account' | 'transferTo' | 'category';
type CalculatorTarget = 'amount' | 'fee';
const inputClass = 'w-full rounded-2xl border border-line bg-surface px-3 py-2 text-base text-ink';
const pickerClass =
  'flex w-full items-center justify-between rounded-2xl border border-line bg-surface px-3 py-2 text-left text-base text-ink';
const readonlyClass = 'rounded-2xl border border-line bg-surface-2 px-3 py-2 text-base text-ink';

export default function TransactionForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [type, setType] = useState<TransactionType>('expense');
  const [date, setDate] = useState(() => toDatetimeLocal(Math.floor(Date.now() / 1000)));
  const [accountId, setAccountId] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [fee, setFee] = useState<number | null>(null);
  const [parentTransactionId, setParentTransactionId] = useState<string | null>(null);

  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringMode, setRecurringMode] = useState<RecurringMode>('recurring');
  const [recurringTotal, setRecurringTotal] = useState<number>(INSTALLMENT_OPTIONS[0]);
  const [customTotal, setCustomTotal] = useState('');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeLookup, setActiveLookup] = useState<LookupTarget | null>(null);
  const [activeCalculator, setActiveCalculator] = useState<CalculatorTarget | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [accountList, categoryList] = await Promise.all([
          apiFetch<Account[]>('/accounts?include_inactive=true'),
          apiFetch<Category[]>('/categories?include_inactive=true'),
        ]);
        if (cancelled) return;
        setAccounts(accountList);
        setCategories(categoryList);

        if (id) {
          const transaction = await apiFetch<Transaction>(`/transactions/${id}`);
          if (cancelled) return;
          setType(transaction.type);
          setDate(toDatetimeLocal(transaction.date));
          setAccountId(transaction.account_id);
          setTransferTo(transaction.transfer_to ?? '');
          setCategoryId(transaction.category_id ?? '');
          setAmount(transaction.amount);
          setNote(transaction.note ?? '');
          setFee(transaction.fee);
          setParentTransactionId(transaction.parent_transaction_id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load transaction');
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

  function handleTypeChange(newType: TransactionType) {
    setType(newType);
    setCategoryId('');
    if (newType !== 'transfer') {
      setTransferTo('');
      setFee(null);
    }
  }

  const categoryLocked = isEdit && (transferTo !== '' || parentTransactionId !== null);
  const showTransferTo = type === 'transfer' || (isEdit && transferTo !== '');
  const showFee = type === 'transfer' && (!isEdit || fee !== null);
  const categoryItems = categories.filter((c) => c.type === type);
  const installmentBase = recurringTotal > 0 ? Math.floor(amount / recurringTotal) : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEdit) {
      if (!accountId) {
        setError(type === 'transfer' ? 'Select a from account' : 'Select an account');
        return;
      }
      if (type === 'transfer') {
        if (!transferTo) {
          setError('Select a to account');
          return;
        }
        if (transferTo === accountId) {
          setError('From and To accounts must differ');
          return;
        }
      } else if (!categoryId) {
        setError('Select a category');
        return;
      }
    }

    if (amount <= 0) {
      setError('Enter an amount');
      return;
    }

    if (!isEdit && recurringEnabled && recurringMode === 'installment' && amount < recurringTotal) {
      setError(`Amount must be at least ${recurringTotal} for installment`);
      return;
    }

    setSaving(true);

    try {
      if (isEdit) {
        const body: Record<string, unknown> = {
          date: fromDatetimeLocal(date),
          amount,
          note,
        };
        if (!categoryLocked) {
          body.category_id = categoryId;
        }
        await apiFetch(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        const body: TransactionInput = {
          date: fromDatetimeLocal(date),
          account_id: accountId,
          amount,
          note: note || undefined,
          type,
        };
        if (type === 'transfer') {
          body.transfer_to = transferTo;
          if (fee !== null) body.fee = fee;
        } else {
          body.category_id = categoryId;
        }
        if (recurringEnabled) {
          body.recurring = { mode: recurringMode, total: recurringTotal };
        }
        await apiFetch('/transactions', { method: 'POST', body: JSON.stringify(body) });
      }
      navigate('/transactions');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="p-4 text-center text-muted">Loading...</p>;
  }

  function accountName(value: string): string {
    return accounts.find((a) => a.id === value)?.name ?? '';
  }

  function categoryName(value: string): string {
    return categories.find((c) => c.id === value)?.name ?? '';
  }

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold text-ink">
        {isEdit ? 'Edit Transaction' : 'Add Transaction'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit ? (
          <div className="flex gap-1 rounded-2xl border border-line bg-surface-2 p-1">
            {TRANSACTION_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeChange(t)}
                className={`flex-1 rounded-xl py-2 text-sm font-bold capitalize ${
                  type === t
                    ? 'bg-gradient-to-br from-accent to-accent-2 text-white'
                    : 'text-muted'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Type: <span className="font-medium capitalize text-ink">{type}</span>
          </p>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-muted" htmlFor="date">
            Date
          </label>
          <input
            id="date"
            type="datetime-local"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-muted">
            {type === 'transfer' ? 'From' : 'Account'}
          </label>
          {isEdit ? (
            <p className={readonlyClass}>
              {accountName(accountId)}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setActiveLookup('account')}
              className={pickerClass}
            >
              <span className={accountId ? 'text-ink' : 'text-muted'}>
                {accountId ? accountName(accountId) : 'Select account'}
              </span>
              <WalletIcon className="h-5 w-5 text-muted" />
            </button>
          )}
        </div>

        {showTransferTo && (
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">To</label>
            {isEdit ? (
              <p className={readonlyClass}>
                {accountName(transferTo)}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setActiveLookup('transferTo')}
                className={pickerClass}
              >
                <span className={transferTo ? 'text-ink' : 'text-muted'}>
                  {transferTo ? accountName(transferTo) : 'Select account'}
                </span>
                <WalletIcon className="h-5 w-5 text-muted" />
              </button>
            )}
          </div>
        )}

        {type !== 'transfer' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">Category</label>
            {categoryLocked ? (
              <p className={readonlyClass}>
                {categoryName(categoryId)}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setActiveLookup('category')}
                className={pickerClass}
              >
                <span className={categoryId ? 'text-ink' : 'text-muted'}>
                  {categoryId ? categoryName(categoryId) : 'Select category'}
                </span>
                <TagIcon className="h-5 w-5 text-muted" />
              </button>
            )}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-muted">Amount</label>
          <button
            type="button"
            onClick={() => setActiveCalculator('amount')}
            className={pickerClass}
          >
            <span className={amount > 0 ? 'text-ink' : 'text-muted'}>
              {amount > 0 ? formatter.format(amount) : 'Enter amount'}
            </span>
            <CalculatorIcon className="h-5 w-5 text-muted" />
          </button>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-muted" htmlFor="note">
            Note
          </label>
          <input
            id="note"
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {showFee && (
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">Fee (optional)</label>
            {isEdit ? (
              <p className={readonlyClass}>
                {formatter.format(fee ?? 0)}
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveCalculator('fee')}
                  className={pickerClass}
                >
                  <span className={fee !== null ? 'text-ink' : 'text-muted'}>
                    {fee !== null ? formatter.format(fee) : 'No fee'}
                  </span>
                  <CalculatorIcon className="h-5 w-5 text-muted" />
                </button>
                {fee !== null && (
                  <button
                    type="button"
                    onClick={() => setFee(null)}
                    className="mt-1 text-xs font-medium text-muted"
                  >
                    Clear fee
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {!isEdit && (
          <div className="rounded-2xl border border-line bg-surface-2 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={recurringEnabled}
                onChange={(e) => setRecurringEnabled(e.target.checked)}
              />
              Recurring / Installment
            </label>

            {recurringEnabled && (
              <div className="mt-3 space-y-3">
                <div className="flex gap-1 rounded-2xl border border-line bg-surface p-1">
                  {RECURRING_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setRecurringMode(mode)}
                      className={`flex-1 rounded-xl py-2 text-sm font-bold capitalize ${
                        recurringMode === mode
                          ? 'bg-gradient-to-br from-accent to-accent-2 text-white'
                          : 'text-muted'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {INSTALLMENT_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setRecurringTotal(n);
                        setCustomTotal('');
                      }}
                      className={`rounded-2xl border py-2 text-sm font-medium ${
                        recurringTotal === n && customTotal === ''
                          ? 'border-transparent bg-gradient-to-br from-accent to-accent-2 text-white'
                          : 'border-line bg-surface text-ink'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={2}
                    max={60}
                      placeholder="Custom"
                      value={customTotal}
                      onChange={(e) => {
                        setCustomTotal(e.target.value);
                        const n = Number(e.target.value);
                        if (n >= 2 && n <= 60) setRecurringTotal(n);
                      }}
                      className="rounded-2xl border border-line bg-surface px-2 py-2 text-center text-sm text-ink"
                  />
                </div>

                <p className="text-xs text-muted">
                  {recurringMode === 'recurring'
                    ? `Repeats ${formatter.format(amount)} every month for ${recurringTotal} months, same date.`
                    : `Splits ${formatter.format(amount)} into ${recurringTotal} monthly payments of ${formatter.format(installmentBase)} (last payment ${formatter.format(amount - installmentBase * (recurringTotal - 1))}).`}
                </p>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-expense">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            aria-label={saving ? 'Saving...' : 'Save'}
            className="flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 px-4 py-3 text-white shadow-[0_8px_16px_-6px_var(--accent)] disabled:opacity-50"
          >
            <CheckIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/transactions')}
            aria-label="Cancel"
            className="flex flex-1 items-center justify-center rounded-2xl border border-line px-4 py-3 text-muted"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </form>

      {activeLookup === 'account' && (
        <TileLookup
          items={accounts}
          value={accountId}
          onSelect={setAccountId}
          onClose={() => setActiveLookup(null)}
          allowParentSelection
          title={type === 'transfer' ? 'From Account' : 'Account'}
        />
      )}
      {activeLookup === 'transferTo' && (
        <TileLookup
          items={accounts}
          value={transferTo}
          onSelect={setTransferTo}
          onClose={() => setActiveLookup(null)}
          allowParentSelection
          title="To Account"
        />
      )}
      {activeLookup === 'category' && (
        <TileLookup
          items={categoryItems}
          value={categoryId}
          onSelect={setCategoryId}
          onClose={() => setActiveLookup(null)}
          allowParentSelection={false}
          title="Category"
        />
      )}

      {activeCalculator === 'amount' && (
        <Calculator
          initialValue={amount || undefined}
          onConfirm={(value) => {
            setAmount(value);
            setActiveCalculator(null);
          }}
          onClose={() => setActiveCalculator(null)}
        />
      )}
      {activeCalculator === 'fee' && (
        <Calculator
          initialValue={fee ?? undefined}
          onConfirm={(value) => {
            setFee(value);
            setActiveCalculator(null);
          }}
          onClose={() => setActiveCalculator(null)}
        />
      )}
    </PageContainer>
  );
}
