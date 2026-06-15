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
    return <p className="p-4 text-center text-gray-500">Loading...</p>;
  }

  function accountName(value: string): string {
    return accounts.find((a) => a.id === value)?.name ?? '';
  }

  function categoryName(value: string): string {
    return categories.find((c) => c.id === value)?.name ?? '';
  }

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">
        {isEdit ? 'Edit Transaction' : 'Add Transaction'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit ? (
          <div className="grid grid-cols-3 gap-2">
            {TRANSACTION_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeChange(t)}
                className={`rounded-md py-2 text-sm font-medium capitalize ${
                  type === t ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-700 ring-1 ring-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Type: <span className="font-medium capitalize text-gray-900">{type}</span>
          </p>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="date">
            Date
          </label>
          <input
            id="date"
            type="datetime-local"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {type === 'transfer' ? 'From' : 'Account'}
          </label>
          {isEdit ? (
            <p className="rounded-md bg-gray-50 px-3 py-2 text-base text-gray-700 ring-1 ring-gray-200">
              {accountName(accountId)}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setActiveLookup('account')}
              className="flex w-full items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-left text-base"
            >
              <span className={accountId ? 'text-gray-900' : 'text-gray-400'}>
                {accountId ? accountName(accountId) : 'Select account'}
              </span>
              <WalletIcon className="h-5 w-5 text-gray-400" />
            </button>
          )}
        </div>

        {showTransferTo && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">To</label>
            {isEdit ? (
              <p className="rounded-md bg-gray-50 px-3 py-2 text-base text-gray-700 ring-1 ring-gray-200">
                {accountName(transferTo)}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setActiveLookup('transferTo')}
                className="flex w-full items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-left text-base"
              >
                <span className={transferTo ? 'text-gray-900' : 'text-gray-400'}>
                  {transferTo ? accountName(transferTo) : 'Select account'}
                </span>
                <WalletIcon className="h-5 w-5 text-gray-400" />
              </button>
            )}
          </div>
        )}

        {type !== 'transfer' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
            {categoryLocked ? (
              <p className="rounded-md bg-gray-50 px-3 py-2 text-base text-gray-700 ring-1 ring-gray-200">
                {categoryName(categoryId)}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setActiveLookup('category')}
                className="flex w-full items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-left text-base"
              >
                <span className={categoryId ? 'text-gray-900' : 'text-gray-400'}>
                  {categoryId ? categoryName(categoryId) : 'Select category'}
                </span>
                <TagIcon className="h-5 w-5 text-gray-400" />
              </button>
            )}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Amount</label>
          <button
            type="button"
            onClick={() => setActiveCalculator('amount')}
            className="flex w-full items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-left text-base"
          >
            <span className={amount > 0 ? 'text-gray-900' : 'text-gray-400'}>
              {amount > 0 ? formatter.format(amount) : 'Enter amount'}
            </span>
            <CalculatorIcon className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="note">
            Note
          </label>
          <input
            id="note"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {showFee && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Fee (optional)</label>
            {isEdit ? (
              <p className="rounded-md bg-gray-50 px-3 py-2 text-base text-gray-700 ring-1 ring-gray-200">
                {formatter.format(fee ?? 0)}
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveCalculator('fee')}
                  className="flex w-full items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-left text-base"
                >
                  <span className={fee !== null ? 'text-gray-900' : 'text-gray-400'}>
                    {fee !== null ? formatter.format(fee) : 'No fee'}
                  </span>
                  <CalculatorIcon className="h-5 w-5 text-gray-400" />
                </button>
                {fee !== null && (
                  <button
                    type="button"
                    onClick={() => setFee(null)}
                    className="mt-1 text-xs text-gray-500"
                  >
                    Clear fee
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {!isEdit && (
          <div className="rounded-lg bg-gray-50 p-3 ring-1 ring-gray-200">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
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
                <div className="grid grid-cols-2 gap-2">
                  {RECURRING_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setRecurringMode(mode)}
                      className={`rounded-md py-2 text-sm font-medium capitalize ${
                        recurringMode === mode
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 ring-1 ring-gray-200'
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
                      className={`rounded-md py-2 text-sm font-medium ${
                        recurringTotal === n && customTotal === ''
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 ring-1 ring-gray-200'
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
                    className="rounded-md border border-gray-300 px-2 py-2 text-center text-sm"
                  />
                </div>

                <p className="text-xs text-gray-500">
                  {recurringMode === 'recurring'
                    ? `Repeats ${formatter.format(amount)} every month for ${recurringTotal} months, same date.`
                    : `Splits ${formatter.format(amount)} into ${recurringTotal} monthly payments of ${formatter.format(installmentBase)} (last payment ${formatter.format(amount - installmentBase * (recurringTotal - 1))}).`}
                </p>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            aria-label={saving ? 'Saving...' : 'Save'}
            className="flex flex-1 items-center justify-center rounded-md bg-blue-600 px-4 py-3 text-white disabled:opacity-50"
          >
            <CheckIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/transactions')}
            aria-label="Cancel"
            className="flex flex-1 items-center justify-center rounded-md border border-gray-300 px-4 py-3 text-gray-700"
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
