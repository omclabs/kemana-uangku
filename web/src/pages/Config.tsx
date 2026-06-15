import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../lib/api';
import type { Config as ConfigType } from '../lib/types';
import PageContainer from '../components/PageContainer';
import { ChevronRightIcon, LockClosedIcon } from '../components/icons';

export default function Config() {
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
    return <p className="p-4 text-center text-gray-500">Loading...</p>;
  }

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Config</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="currency">
            Currency
          </label>
          <input
            id="currency"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="timezone">
            Default timezone
          </label>
          <input
            id="timezone"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            required
          />
        </div>

        <p className="text-xs text-gray-500">Schema version: {version}</p>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">Saved.</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>

      <Link
        to="/config/change-password"
        className="mt-6 flex items-center gap-1.5 rounded-lg bg-white p-3 font-medium text-gray-900 shadow-sm"
      >
        <LockClosedIcon className="h-5 w-5 text-gray-400" />
        <span className="flex-1">Change Password</span>
        <ChevronRightIcon className="h-4 w-4 text-gray-400" />
      </Link>
    </PageContainer>
  );
}
