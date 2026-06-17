import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../../components/PageContainer';
import { ApiError, apiFetch } from '../../lib/api';
import type {
  Account,
  Category,
  ReceiptImportCommitInput,
  ReceiptImportDraft,
  ReceiptImportDraftItem,
} from '../../lib/types';

const formatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function toDateInput(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateInput(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, 0, 0, 0) / 1000);
}

function isLeafExpenseCategory(categories: Category[], candidate: Category): boolean {
  if (candidate.type !== 'expense' || candidate.is_active !== 1) return false;
  return !categories.some((category) => category.parent_id === candidate.id && category.is_active === 1);
}

function rowIsValid(row: ReceiptImportDraftItem): boolean {
  if (!row.included) return true;
  return Boolean(row.note.trim()) && Number.isFinite(row.amount) && row.amount !== 0 && Boolean(row.category_id) && row.date > 0;
}

export default function TransactionReceiptImport() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountId, setAccountId] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<ReceiptImportDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiFetch<Account[]>('/accounts?include_inactive=true'),
      apiFetch<Category[]>('/categories?include_inactive=true'),
    ])
      .then(([accountList, categoryList]) => {
        if (cancelled) return;
        setAccounts(accountList.filter((account) => account.is_active === 1));
        setCategories(categoryList);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load import form');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const expenseCategories = useMemo(
    () => categories.filter((category) => isLeafExpenseCategory(categories, category)),
    [categories]
  );
  const includedTotal = (draft?.draft_items ?? [])
    .filter((row) => row.included)
    .reduce((sum, row) => sum + row.amount, 0);
  const hasMismatch = draft?.receipt_total !== null && draft?.receipt_total !== includedTotal;
  const hasInvalidIncludedRow = (draft?.draft_items ?? []).some((row) => !rowIsValid(row));
  const includedCount = (draft?.draft_items ?? []).filter((row) => row.included).length;

  function updateRow(rowId: string, patch: Partial<ReceiptImportDraftItem>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        draft_items: current.draft_items.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
      };
    });
  }

  function removeRow(rowId: string) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        draft_items: current.draft_items.filter((row) => row.id !== rowId),
      };
    });
  }

  function addManualRow() {
    setDraft((current) => {
      if (!current) return current;
      const fallbackDate = current.detected_date ?? Math.floor(Date.now() / 1000);
      return {
        ...current,
        draft_items: [
          ...current.draft_items,
          {
            id: crypto.randomUUID(),
            kind: 'manual',
            note: '',
            amount: 0,
            date: fallbackDate,
            category_id: null,
            included: true,
            origin: 'manual',
            confidence: 1,
            warnings: [],
            raw_line: null,
          },
        ],
      };
    });
  }

  async function handleParse(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!accountId) {
      setError('Select an account first.');
      return;
    }
    if (!csvFile) {
      setError('Choose one CSV file.');
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.set('account_id', accountId);
      form.set('file', csvFile);
      const result = await apiFetch<ReceiptImportDraft>('/transactions/import-receipt/parse', {
        method: 'POST',
        body: form,
      });
      setDraft(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to parse receipt');
    } finally {
      setUploading(false);
    }
  }

  async function handleCommit() {
    if (!draft) return;
    setError(null);

    if (includedCount === 0) {
      setError('Include at least one row before submit.');
      return;
    }
    if (hasInvalidIncludedRow) {
      setError('Fix invalid included rows before submit.');
      return;
    }

    setSaving(true);
    try {
      const body: ReceiptImportCommitInput = {
        account_id: accountId,
        draft_items: draft.draft_items,
      };
      await apiFetch('/transactions/import-receipt/commit', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      navigate('/transactions');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import receipt');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="p-4 text-center text-muted">Loading...</p>;
  }

  return (
    <PageContainer>
      <div
        className="mb-5 flex items-center justify-between gap-3"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 15,
          padding: '10px 0 12px',
          background: 'color-mix(in srgb, var(--bg) 84%, transparent)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '1px solid color-mix(in srgb, var(--line) 75%, transparent)',
        }}
      >
        <div>
          <h1 className="text-xl font-semibold text-ink">Import Receipt</h1>
          <p className="text-sm text-muted">Upload one CSV file, review the rows, then commit the final expenses.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/transactions')}
          className="rounded-2xl border border-line px-3 py-2 text-sm font-medium text-muted"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleParse} className="space-y-4 rounded-[24px] border border-line bg-surface p-4 shadow-[0_8px_26px_-18px_rgba(43,39,51,.35)]">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted" htmlFor="account_id">
              Account
            </label>
            <select
              id="account_id"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              className="w-full rounded-2xl border border-line bg-surface-2 px-3 py-2 text-base text-ink"
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-muted" htmlFor="receipt">
              CSV file
            </label>
            <input
              id="receipt"
              type="file"
              accept=".csv,text/csv"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setCsvFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-2xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink file:mr-3 file:rounded-xl file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-ink">CSV format</p>
          <pre className="mt-2 overflow-x-auto rounded-2xl border border-line bg-surface-2 p-3 text-xs text-ink">{`note,amount,date,category_id,included,kind
Nasi goreng,30000,2026-06-16,,true,item
Voucher member,-5000,2026-06-16,,true,voucher`}</pre>
          <p className="mt-1 text-xs text-muted">
            Required columns: `note`, `amount`, `date`. Optional: `category_id`, `included`, `kind`.
            Date should be ISO-like, for example `2026-06-16`.
          </p>
        </div>

        <button
          type="submit"
          disabled={uploading}
          className="rounded-2xl bg-gradient-to-br from-accent to-accent-2 px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_18px_-10px_var(--accent)] disabled:opacity-50"
        >
          {uploading ? 'Parsing CSV...' : 'Preview CSV'}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-expense">{error}</p>}

      {draft && (
        <section className="mt-5 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[20px] border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Detected total</p>
              <p className="mt-2 text-lg font-semibold text-ink">
                {draft.receipt_total === null ? 'Not found' : formatter.format(draft.receipt_total)}
              </p>
            </div>
            <div className="rounded-[20px] border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Included rows</p>
              <p className="mt-2 text-lg font-semibold text-ink">{formatter.format(includedTotal)}</p>
            </div>
            <div className={`rounded-[20px] border p-4 ${hasMismatch ? 'border-expense bg-expense-soft/40' : 'border-line bg-surface'}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Status</p>
              <p className={`mt-2 text-lg font-semibold ${hasMismatch ? 'text-expense' : 'text-income'}`}>
                {hasMismatch ? 'Mismatch' : 'Ready to review'}
              </p>
            </div>
          </div>

          {draft.warnings.length > 0 && (
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">Warnings</p>
              <ul className="mt-2 list-disc pl-5">
                {draft.warnings.map((warning, index) => (
                  <li key={`${warning.code}-${index}`}>{warning.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Review Table</h2>
              <p className="text-sm text-muted">Edit rows, add missing ones, or exclude anything that should not be committed.</p>
            </div>
            <button
              type="button"
              onClick={addManualRow}
              className="rounded-2xl border border-line px-3 py-2 text-sm font-medium text-ink"
            >
              Add Manual Row
            </button>
          </div>

          <div className="overflow-x-auto rounded-[24px] border border-line bg-surface shadow-[0_8px_26px_-18px_rgba(43,39,51,.35)]">
            <table className="min-w-[980px] w-full border-collapse">
              <thead className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="px-3 py-3">Include</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Note</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Warnings</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {draft.draft_items.map((row) => (
                  <tr key={row.id} className="border-t border-line align-top">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={(event) => updateRow(row.id, { included: event.target.checked })}
                        className="mt-2 h-4 w-4"
                      />
                    </td>
                    <td className="px-3 py-3 text-sm font-medium text-ink capitalize">{row.kind}</td>
                    <td className="px-3 py-3">
                      <input
                        value={row.note}
                        onChange={(event) => updateRow(row.id, { note: event.target.value })}
                        className={`w-full rounded-xl border px-3 py-2 text-sm text-ink ${row.included && !row.note.trim() ? 'border-expense bg-expense-soft/20' : 'border-line bg-surface-2'}`}
                      />
                      {row.raw_line && <p className="mt-1 text-xs text-muted">OCR: {row.raw_line}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        step="1"
                        value={row.amount}
                        onChange={(event) => updateRow(row.id, { amount: Number(event.target.value) })}
                        className={`w-32 rounded-xl border px-3 py-2 text-sm text-ink ${row.included && row.amount === 0 ? 'border-expense bg-expense-soft/20' : 'border-line bg-surface-2'}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={row.category_id ?? ''}
                        onChange={(event) => updateRow(row.id, { category_id: event.target.value || null })}
                        className={`w-48 rounded-xl border px-3 py-2 text-sm text-ink ${row.included && !row.category_id ? 'border-expense bg-expense-soft/20' : 'border-line bg-surface-2'}`}
                      >
                        <option value="">Select category</option>
                        {expenseCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="date"
                        value={toDateInput(row.date)}
                        onChange={(event) => updateRow(row.id, { date: fromDateInput(event.target.value) })}
                        className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink"
                      />
                    </td>
                    <td className="px-3 py-3">
                      {row.warnings.length > 0 ? (
                        <div className="space-y-1">
                          {row.warnings.map((warning, index) => (
                            <p key={`${warning.code}-${index}`} className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">
                              {warning.message}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <span className="rounded-full bg-income-soft px-2 py-1 text-xs text-income">OK</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`text-sm ${hasInvalidIncludedRow || hasMismatch ? 'text-expense' : 'text-muted'}`}>
              {hasInvalidIncludedRow
                ? 'Submit is blocked until every included row has note, amount, category, and date.'
                : hasMismatch
                  ? 'Included total does not match the detected receipt total.'
                  : 'All included rows are valid.'}
            </p>
            <button
              type="button"
              disabled={saving || includedCount === 0 || hasInvalidIncludedRow}
              onClick={handleCommit}
              className="rounded-2xl bg-gradient-to-br from-accent to-accent-2 px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_18px_-10px_var(--accent)] disabled:opacity-50"
            >
              {saving ? 'Importing...' : 'Import Receipt'}
            </button>
          </div>
        </section>
      )}
    </PageContainer>
  );
}
