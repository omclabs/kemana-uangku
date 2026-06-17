import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiFetch, clearSession, getUser } from '../lib/api';
import type { Config as ConfigType } from '../lib/types';
import PageContainer from '../components/PageContainer';
import PageHeader from '../components/PageHeader';

function WalletIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 11h3v4h-3a2 2 0 0 1 0-4z"/></svg>;
}
function LockIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
}
function TagIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3z"/><path d="M7.25 6h.008v.008H7.25V6z"/></svg>;
}
function BudgetIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2.5" width="16" height="19" rx="2.5"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0"/></svg>;
}
function LogoutIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
}
function UserIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
}
function ChevronRight() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>;
}

const cardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  borderRadius: 20, border: '1px solid var(--line)',
  background: 'var(--surface)', padding: '14px 16px',
  boxShadow: '0 2px 12px rgba(0,0,0,.04)', textDecoration: 'none',
};

export default function Config() {
  const navigate = useNavigate();
  const user = getUser();
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
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function handleLogout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <PageContainer>
      <PageHeader title="Config" subtitle="App settings, access, and session controls" />

      {error && (
        <p style={{ marginBottom: 16, fontSize: 13, color: 'var(--expense)' }}>{error}</p>
      )}

      {loading ? (
        <p style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)' }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link to="/config/preferences" style={cardStyle}>
            <span style={{
              width: 44, height: 44, borderRadius: 13, flexShrink: 0,
              background: 'var(--income-soft)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <WalletIcon />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>General Settings</span>
              <span style={{
                display: 'block', fontSize: 12.5, color: 'var(--muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {currency} · {timezone}
              </span>
            </span>
            <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRight /></span>
          </Link>

          <Link to="/config/categories" style={cardStyle}>
            <span style={{
              width: 44, height: 44, borderRadius: 13, flexShrink: 0,
              background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <TagIcon />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>Categories</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                Manage income and expense categories
              </span>
            </span>
            <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRight /></span>
          </Link>

          <Link to="/config/budgets" style={cardStyle}>
            <span style={{
              width: 44, height: 44, borderRadius: 13, flexShrink: 0,
              background: 'color-mix(in srgb, var(--accent-2) 10%, transparent)', color: 'var(--accent-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BudgetIcon />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>Budgets</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                Manage month-specific budget targets
              </span>
            </span>
            <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRight /></span>
          </Link>

          <Link to="/config/change-password" style={cardStyle}>
            <span style={{
              width: 44, height: 44, borderRadius: 13, flexShrink: 0,
              background: 'var(--expense-soft)', color: 'var(--expense)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <LockIcon />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>Change Password</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                Update your login credentials
              </span>
            </span>
            <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRight /></span>
          </Link>

          {user?.role === 'admin' && (
            <Link to="/config/users" style={cardStyle}>
              <span style={{
                width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                background: 'color-mix(in srgb, var(--accent-2) 14%, transparent)', color: 'var(--accent-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <UserIcon />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>Users</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                  Manage user access and roles
                </span>
              </span>
              <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRight /></span>
            </Link>
          )}

          <button
            type="button"
            onClick={handleLogout}
            style={{ ...cardStyle, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span style={{
              width: 44, height: 44, borderRadius: 13, flexShrink: 0,
              background: 'var(--expense-soft)', color: 'var(--expense)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <LogoutIcon />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>Log Out</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                End this session on the device
              </span>
            </span>
            <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRight /></span>
          </button>
        </div>
      )}

      {!loading && (
        <p style={{ marginTop: 24, fontSize: 11.5, color: 'var(--muted)' }}>Schema version: {version}</p>
      )}
    </PageContainer>
  );
}
