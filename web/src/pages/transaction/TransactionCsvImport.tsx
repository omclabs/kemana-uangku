import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../../components/PageContainer';
import PageHeader from '../../components/PageHeader';
import FieldRow from '../../components/FieldRow';
import TileLookup from '../../components/TileLookup';
import { ApiError, apiFetch } from '../../lib/api';
import { byName } from '../../lib/transaction-import-helpers';
import { toDatetimeLocal, fromDatetimeLocal } from '../../lib/date';
import { WalletIcon, TagIcon } from '../../components/compactIcons';
import { statFmt } from '../../lib/format';
import type { Account, Category, CsvImportCommitInput, CsvImportDraft, CsvImportDraftItem } from '../../lib/types';

function CalendarIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
}

function StoreIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5M4 9v11h16V9M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0"/></svg>;
}

function rowIsValid(row: CsvImportDraftItem): boolean {
  if (!row.included) return true;
  return Boolean(row.description.trim()) && Number.isFinite(row.amount) && row.amount !== 0 && Boolean(row.category_id);
}

export default function TransactionCsvImport() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountId, setAccountId] = useState('');
  const [defaultCategoryId, setDefaultCategoryId] = useState('');
  const [defaultMerchant, setDefaultMerchant] = useState('');
  const [datetimeInput, setDatetimeInput] = useState(() => toDatetimeLocal(Math.floor(Date.now() / 1000)));
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<CsvImportDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLookup, setActiveLookup] = useState<string | null>(null);

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

  const sortedAccounts = useMemo(() => [...accounts].sort(byName), [accounts]);
  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === 'expense' && category.is_active === 1).sort(byName),
    [categories]
  );
  const includedTotal = (draft?.draft_items ?? [])
    .filter((row) => row.included)
    .reduce((sum, row) => sum + row.amount, 0);
  const hasInvalidIncludedRow = (draft?.draft_items ?? []).some((row) => !rowIsValid(row));
  const includedCount = (draft?.draft_items ?? []).filter((row) => row.included).length;

  function updateRow(rowId: string, patch: Partial<CsvImportDraftItem>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        draft_items: current.draft_items.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
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
    if (!defaultCategoryId) {
      setError('Select a category first.');
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
      form.set('date', String(fromDatetimeLocal(datetimeInput)));
      form.set('file', csvFile);
      const result = await apiFetch<CsvImportDraft>('/transactions/import-csv/parse', {
        method: 'POST',
        body: form,
      });
      const trimmedDefaultMerchant = defaultMerchant.trim();
      setDraft({
        ...result,
        draft_items: result.draft_items.map((item) => ({
          ...item,
          category_id: defaultCategoryId,
          merchant: trimmedDefaultMerchant ? trimmedDefaultMerchant : item.merchant,
        })),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to parse CSV');
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
      const body: CsvImportCommitInput = {
        account_id: draft.account_id,
        date: draft.date,
        file_hash: draft.file_hash,
        file_name: draft.file_name,
        draft_items: draft.draft_items,
      };
      await apiFetch('/transactions/import-csv/commit', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      navigate('/transactions');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import transactions');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="p-4 text-center text-muted">Loading...</p>;
  }

  return (
    <PageContainer>
      <PageHeader
        title="Import Transactions (CSV)"
        backTo="/transactions"
        info="Upload one CSV file, review the rows, then commit the final expenses."
      />

      <form onSubmit={handleParse} className="space-y-3">
        <FieldRow icon={<CalendarIcon />} label="Date">
          <input
            type="datetime-local"
            value={datetimeInput}
            onChange={(event) => setDatetimeInput(event.target.value)}
            required
            style={{
              width: '100%', background: 'none', border: 'none', padding: 0,
              fontSize: 14, fontWeight: 600, color: 'var(--ink)', fontFamily: 'inherit',
              outline: 'none',
            }}
          />
        </FieldRow>

        <FieldRow icon={<WalletIcon />} label="Account">
          <button type="button" onClick={() => setActiveLookup('account')} style={{
            width: '100%', background: 'none', border: 'none', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
          }}>
            <span style={{ color: accountId ? 'var(--ink)' : 'var(--muted)' }}>
              {accountId ? sortedAccounts.find(a => a.id === accountId)?.name : 'Select account'}
            </span>
          </button>
        </FieldRow>

        <FieldRow icon={<TagIcon />} label="Category">
          <button type="button" onClick={() => setActiveLookup('defaultCategory')} style={{
            width: '100%', background: 'none', border: 'none', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
          }}>
            <span style={{ color: defaultCategoryId ? 'var(--ink)' : 'var(--muted)' }}>
              {defaultCategoryId ? expenseCategories.find(c => c.id === defaultCategoryId)?.name : 'Select category'}
            </span>
          </button>
        </FieldRow>

        <FieldRow icon={<StoreIcon />} label="Merchant">
          <input
            value={defaultMerchant}
            onChange={(event) => setDefaultMerchant(event.target.value)}
            placeholder="Optional, applies to every row"
            maxLength={200}
            style={{
              width: '100%', background: 'none', border: 'none', padding: 0,
              fontSize: 14, fontWeight: 600, color: 'var(--ink)', fontFamily: 'inherit',
              outline: 'none',
            }}
          />
        </FieldRow>

        <div>
          <label className="mb-1 block text-sm font-medium text-muted" htmlFor="csv">
            CSV file
          </label>
          <input
            id="csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(event: ChangeEvent<HTMLInputElement>) => setCsvFile(event.target.files?.[0] ?? null)}
            className="block w-full rounded-2xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink file:mr-3 file:rounded-xl file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
        </div>

        <div>
          <p className="text-sm font-medium text-ink">CSV format</p>
          <pre className="mt-2 overflow-x-auto rounded-2xl border border-line bg-surface-2 p-3 text-xs text-ink">{`amount,description
45000,Lunch at warteg`}</pre>
          <p className="mt-1 text-xs text-muted">
            Required columns: `amount`, `description`. The account and date above apply to every row.
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
          <div className="rounded-[20px] border border-line bg-surface overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-line">
              <div className="p-3">
                <p className="text-[10.5px] font-semibold text-muted">Included</p>
                <p className="mt-1 text-sm font-extrabold text-ink">{includedCount} rows</p>
              </div>
              <div className="p-3">
                <p className="text-[10.5px] font-semibold text-muted">Total</p>
                <p className="mt-1 text-sm font-extrabold text-expense">Rp {statFmt(includedTotal)}</p>
              </div>
            </div>
            <div className="border-t border-line p-3">
              <p className="text-[10.5px] font-semibold text-muted">Status</p>
              <p className={`mt-1 text-sm font-extrabold ${hasInvalidIncludedRow ? 'text-expense' : 'text-income'}`}>
                {hasInvalidIncludedRow ? 'Needs attention' : 'Ready to review'}
              </p>
            </div>
          </div>

          {draft.already_imported && (
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              This file has already been imported. Submitting again will be rejected.
            </div>
          )}

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

          <div>
            <h2 className="text-base font-semibold text-ink">Review Table</h2>
            <p className="text-sm text-muted">Edit rows or exclude anything that should not be committed.</p>
          </div>

          <div className="overflow-x-auto rounded-[24px] border border-line bg-surface shadow-[0_8px_26px_-18px_rgba(43,39,51,.35)]">
            <table className="w-full border-collapse">
              <thead className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="px-3 py-3">Include</th>
                  <th className="px-3 py-3">Description</th>
                  <th className="px-3 py-3">Amount</th>
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
                    <td className="px-3 py-3">
                      <p className={`text-sm ${row.included && !row.description.trim() ? 'text-expense' : 'text-ink'}`}>
                        {row.description}
                      </p>
                      {row.warnings.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {row.warnings.map((warning, index) => (
                            <p key={`${warning.code}-${index}`} className="text-xs text-amber-700">
                              {warning.message}
                            </p>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        step="1"
                        value={row.amount}
                        onChange={(event) => updateRow(row.id, { amount: Number(event.target.value) })}
                        className={`w-32 rounded-xl border px-3 py-2 text-right text-sm text-ink ${row.included && row.amount === 0 ? 'border-expense bg-expense-soft/20' : 'border-line bg-surface-2'}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`text-sm ${hasInvalidIncludedRow ? 'text-expense' : 'text-muted'}`}>
              {hasInvalidIncludedRow
                ? 'Submit is blocked until every included row has description and amount.'
                : 'All included rows are valid.'}
            </p>
            <button
              type="button"
              disabled={saving || includedCount === 0 || hasInvalidIncludedRow}
              onClick={handleCommit}
              className="rounded-2xl bg-gradient-to-br from-accent to-accent-2 px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_18px_-10px_var(--accent)] disabled:opacity-50"
            >
              {saving ? 'Importing...' : 'Import Transactions'}
            </button>
          </div>
        </section>
      )}

      {activeLookup === 'account' && (
        <TileLookup
          items={sortedAccounts}
          value={accountId}
          onSelect={(id) => { setAccountId(id); setActiveLookup(null); }}
          onClose={() => setActiveLookup(null)}
          title="Account"
          allowParentSelection
        />
      )}

      {activeLookup === 'defaultCategory' && (
        <TileLookup
          items={expenseCategories}
          value={defaultCategoryId}
          onSelect={(id) => { setDefaultCategoryId(id); setActiveLookup(null); }}
          onClose={() => setActiveLookup(null)}
          title="Category"
          allowParentSelection={false}
        />
      )}
    </PageContainer>
  );
}
