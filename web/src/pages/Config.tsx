import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiFetch, clearSession } from '../lib/api';
import type { Config as ConfigType } from '../lib/types';
import PageContainer from '../components/PageContainer';
import {
  ArrowRightOnRectangleIcon,
  ChevronRightIcon,
  LockClosedIcon,
  WalletIcon,
} from '../components/icons';

export default function Config() {
  const navigate = useNavigate();
  const [currency, setCurrency] = useState('');
  const [timezone, setTimezone] = useState('');
  const [version, setVersion] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  function handleLogout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  if (loading) {
    return <p className="p-4 text-center text-muted">Loading...</p>;
  }

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold text-ink">Config</h1>

      {error && <p className="mb-4 text-sm text-expense">{error}</p>}

      <div className="space-y-3">
        <Link
          to="/config/preferences"
          className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[0_4px_16px_-6px_rgba(60,45,110,.12)]"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-income-soft text-accent">
            <WalletIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink">General Settings</span>
            <span className="block truncate text-sm text-muted">
              {currency} · {timezone}
            </span>
          </span>
          <ChevronRightIcon className="h-4 w-4 text-muted" />
        </Link>

        <Link
          to="/config/change-password"
          className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[0_4px_16px_-6px_rgba(60,45,110,.12)]"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-expense-soft text-expense">
            <LockClosedIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink">Change Password</span>
            <span className="block truncate text-sm text-muted">Update your login credentials</span>
          </span>
          <ChevronRightIcon className="h-4 w-4 text-muted" />
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-[0_4px_16px_-6px_rgba(60,45,110,.12)]"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-expense-soft text-expense">
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink">Log Out</span>
            <span className="block truncate text-sm text-muted">End this session on the device</span>
          </span>
          <ChevronRightIcon className="h-4 w-4 text-muted" />
        </button>
      </div>

      <p className="mt-6 text-xs text-muted">Schema version: {version}</p>
    </PageContainer>
  );
}
