import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, apiFetch } from '../lib/api';
import type { Config as ConfigType } from '../lib/types';
import PageContainer from '../components/PageContainer';
import PageHeader from '../components/PageHeader';

function CurrencyIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.5 8.5a3 3 0 0 0-5 2.5c0 3 5 3 5 6a3 3 0 0 1-5 0M12 6v2M12 16v2"/></svg>;
}
function ClockIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>;
}

function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 16, padding: '12px 14px',
    }}>
      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', minWidth: 80, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

export default function ConfigPreferences() {
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
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
    return <p style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>Loading…</p>;
  }

  return (
    <PageContainer>
      <PageHeader
        title="General Settings"
        backTo="/config"
        info="Currency and default timezone preferences."
        marginBottom={22}
      />

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FieldRow icon={<CurrencyIcon />} label="Currency">
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              required
              style={{
                width: '100%', background: 'none', border: 'none', padding: 0,
                fontSize: 14, fontWeight: 600, color: 'var(--ink)', fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </FieldRow>

          <FieldRow icon={<ClockIcon />} label="Timezone">
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              required
              style={{
                width: '100%', background: 'none', border: 'none', padding: 0,
                fontSize: 14, fontWeight: 600, color: 'var(--ink)', fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </FieldRow>

          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)' }}>Schema version: {version}</p>

          {error && (
            <div style={{
              padding: '10px 14px', background: 'var(--expense-soft)',
              border: '1px solid color-mix(in srgb, var(--expense) 25%, transparent)',
              borderRadius: 12, fontSize: 13, color: 'var(--expense)', fontWeight: 500,
            }}>
              {error}
            </div>
          )}
          {saved && (
            <div style={{
              padding: '10px 14px', background: 'var(--income-soft)',
              border: '1px solid color-mix(in srgb, var(--income) 25%, transparent)',
              borderRadius: 12, fontSize: 13, color: 'var(--income)', fontWeight: 500,
            }}>
              Saved.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <div style={{
                position: 'absolute', inset: 4, borderRadius: 14,
                background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                filter: 'blur(12px)', opacity: saving ? 0.3 : 0.5, transition: 'opacity .2s',
              }} />
              <button type="submit" disabled={saving} style={{
                position: 'relative', width: '100%', border: 'none', borderRadius: 16, padding: '14px 0',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                color: '#fff', fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
                cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
                boxShadow: '0 8px 20px -6px var(--accent)', transition: 'opacity .2s',
              }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            <button type="button" onClick={() => window.history.back()} style={{
              flex: 1, borderRadius: 16, padding: '14px 0',
              border: '1.5px solid var(--line)', background: 'var(--surface)',
              color: 'var(--muted)', fontSize: 15, fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
