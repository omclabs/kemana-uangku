import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../lib/api';
import type { Config as ConfigType } from '../lib/types';
import PageContainer from '../components/PageContainer';
import { CheckIcon, XMarkIcon } from '../components/icons';

export default function ConfigPreferences() {
  const navigate = useNavigate();
  const [currency, setCurrency] = useState('');
  const [timezone, setTimezone] = useState('');
  const [version, setVersion] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    apiFetch<ConfigType>('/config')
      .then((config) => {
        if (cancelled) return;
        setCurrency(config.currency);
        setTimezone(config.default_timezone);
        setVersion(config.version);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load config');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);

    try {
      await apiFetch<ConfigType>('/config', {
        method: 'PUT',
        body: JSON.stringify({ currency, default_timezone: timezone }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save config');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="p-4 text-center text-muted">Loading...</p>;
  }

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold text-ink">General Settings</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-muted" htmlFor="currency">
            Currency
          </label>
          <input
            id="currency"
            className="w-full rounded-2xl border border-line px-3 py-2 text-base"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-muted" htmlFor="timezone">
            Default timezone
          </label>
          <input
            id="timezone"
            className="w-full rounded-2xl border border-line px-3 py-2 text-base"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            required
          />
        </div>

        <p className="text-xs text-muted">Schema version: {version}</p>

        {error && <p className="text-sm text-expense">{error}</p>}
        {saved && <p className="text-sm text-income">Saved.</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            aria-label={saving ? 'Saving...' : 'Save'}
            className="flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 px-4 py-3 text-white disabled:opacity-50"
          >
            <CheckIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/config')}
            aria-label="Cancel"
            className="flex flex-1 items-center justify-center rounded-2xl border border-line px-4 py-3 text-muted"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </form>
    </PageContainer>
  );
}
