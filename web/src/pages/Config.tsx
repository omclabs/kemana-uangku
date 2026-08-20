import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiFetch, getUser, logout } from '../lib/api';
import type { Config as ConfigType } from '../lib/types';
import { WEB_BUILD } from '../lib/version';
import PageContainer from '../components/PageContainer';
import PageHeader from '../components/PageHeader';
import { BellIcon, ChevronRightIcon, LockIcon, LogoutIcon, TagIcon, WalletIcon } from '../components/compactIcons';

function BudgetIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2.5" width="16" height="19" rx="2.5"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0"/></svg>;
}
function UserIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
}
function TrashIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>;
}
function UploadIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4"/><path d="M6 10l6-6 6 6"/><path d="M4 20h16"/></svg>;
}
function DownloadIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12"/><path d="M6 10l6 6 6-6"/><path d="M4 20h16"/></svg>;
}
function downloadCsvTemplate() {
  const csv = 'amount,description\n45000,Lunch at warteg\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'transactions-import-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}
const cardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  borderRadius: 20, border: '1px solid var(--line)',
  background: 'var(--surface)', padding: '14px 16px',
  boxShadow: '0 2px 12px rgba(0,0,0,.04)', textDecoration: 'none',
};
const dangerCardStyle: React.CSSProperties = {
  ...cardStyle,
  border: '1px solid color-mix(in srgb, var(--expense) 35%, var(--line))',
  background: 'color-mix(in srgb, var(--expense) 6%, var(--surface))',
};
const sectionLabelStyle: React.CSSProperties = {
  margin: '0 2px 8px', fontSize: 10.5, fontWeight: 700, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.06em',
};

export default function Config() {
  const navigate = useNavigate();
  const user = getUser();
  const isReimbursement = user?.role === 'reimbursement';
  const [currency, setCurrency] = useState('');
  const [timezone, setTimezone] = useState('');
  const [version, setVersion] = useState('');
  const [apiBuildVersion, setApiBuildVersion] = useState('dev');
  const [apiCommitSha, setApiCommitSha] = useState('dev');
  const [apiDeployedAt, setApiDeployedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearValue, setClearValue] = useState('');
  const [clearPassword, setClearPassword] = useState('');
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ConfigType>('/config')
      .then((config) => {
        if (cancelled) return;
        setCurrency(config.currency);
        setTimezone(config.default_timezone);
        setVersion(config.version);
        setApiBuildVersion(config.api_build?.version ?? 'dev');
        setApiCommitSha(config.api_build?.commit_sha ?? 'dev');
        setApiDeployedAt(config.api_build?.deployed_at ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load config');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function handleClearData() {
    if (clearValue.trim().toLowerCase() !== 'confirm') {
      setClearError('Type confirm to continue.');
      return;
    }
    if (!clearPassword) {
      setClearError('Enter your current password to continue.');
      return;
    }

    setClearing(true);
    setClearError(null);

    try {
      const result = await apiFetch<{
        ok: boolean;
        cleared: { transactions: number; budgets: number; monthly_balances: number; accounts: number };
      }>('/config/clear-data', {
        method: 'POST',
        body: JSON.stringify({
          confirmation: 'CLEAR ALL DATA',
          current_password: clearPassword,
        }),
      });

      if (result.ok) {
        setClearMessage(
          `Data cleared: ${result.cleared.transactions} transactions, ${result.cleared.budgets} budgets, ${result.cleared.monthly_balances} monthly balances, ${result.cleared.accounts} accounts.`
        );
        setClearOpen(false);
        setClearValue('');
        setClearPassword('');
      }
    } catch (err) {
      setClearError(err instanceof ApiError ? err.message : 'Failed to clear data');
    } finally {
      setClearing(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader title="Config" backTo="/" info="App settings, access, and session controls." />

      {error && (
        <p style={{ marginBottom: 16, fontSize: 13, color: 'var(--expense)' }}>{error}</p>
      )}
      {clearMessage && (
        <p style={{ marginBottom: 16, fontSize: 13, color: 'var(--accent)' }}>{clearMessage}</p>
      )}

      {loading ? (
        <p style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)' }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {!isReimbursement && (
            <div>
              <p style={sectionLabelStyle}>Preferences</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Link to="/config/preferences" style={cardStyle}>
                  <span style={{
                    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                    background: 'var(--income-soft)', color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <WalletIcon size={20} />
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
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRightIcon size={16} strokeWidth={2} /></span>
                </Link>

                <Link to="/config/change-password" style={cardStyle}>
                  <span style={{
                    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                    background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <LockIcon size={20} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>Change Password</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                      Update your login credentials
                    </span>
                  </span>
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRightIcon size={16} strokeWidth={2} /></span>
                </Link>
              </div>
            </div>
          )}

          {!isReimbursement && (
            <div>
              <p style={sectionLabelStyle}>Data &amp; Planning</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Link to="/config/categories" style={cardStyle}>
                  <span style={{
                    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                    background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <TagIcon size={20} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>Categories</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                      Manage income and expense categories
                    </span>
                  </span>
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRightIcon size={16} strokeWidth={2} /></span>
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
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRightIcon size={16} strokeWidth={2} /></span>
                </Link>

                <Link to="/config/tracked-items" style={cardStyle}>
                  <span style={{
                    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                    background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <BellIcon />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>Tracked Items</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                      Manage stock forecasts and alerts
                    </span>
                  </span>
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRightIcon size={16} strokeWidth={2} /></span>
                </Link>
              </div>
            </div>
          )}

          {!isReimbursement && (
            <div>
              <p style={sectionLabelStyle}>Import</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Link to="/transactions/import-csv" style={cardStyle}>
                  <span style={{
                    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                    background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <UploadIcon />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>Import Transactions (CSV)</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                      Bulk-import expenses from a CSV file
                    </span>
                  </span>
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRightIcon size={16} strokeWidth={2} /></span>
                </Link>

                <button
                  type="button"
                  onClick={downloadCsvTemplate}
                  style={{
                    ...cardStyle,
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{
                    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                    background: 'color-mix(in srgb, var(--accent-2) 10%, transparent)', color: 'var(--accent-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <DownloadIcon />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>Download CSV Template</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                      Get a blank template for bulk imports
                    </span>
                  </span>
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRightIcon size={16} strokeWidth={2} /></span>
                </button>
              </div>
            </div>
          )}

          {user?.role === 'admin' && (
            <div>
              <p style={sectionLabelStyle}>Admin</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRightIcon size={16} strokeWidth={2} /></span>
                </Link>
              </div>
            </div>
          )}

          {user?.role === 'admin' && (
            <div>
              <p style={{ ...sectionLabelStyle, color: 'var(--expense)' }}>Danger Zone</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setClearMessage(null);
                    setClearError(null);
                    setClearValue('');
                    setClearPassword('');
                    setClearOpen(true);
                  }}
                  style={{
                    ...dangerCardStyle,
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{
                    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                    background: 'var(--expense-soft)', color: 'var(--expense)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <TrashIcon />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--ink)' }}>Clear Data</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                      Delete transactions, budgets, monthly summaries, and accounts
                    </span>
                  </span>
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRightIcon size={16} strokeWidth={2} /></span>
                </button>
              </div>
            </div>
          )}

          <div>
            <p style={sectionLabelStyle}>Session</p>
            <button
              type="button"
              onClick={() => logout(navigate)}
              style={{ ...cardStyle, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <span style={{
                width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                background: 'var(--surface-2)', color: 'var(--muted)',
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
              <span style={{ color: 'var(--muted)', flexShrink: 0 }}><ChevronRightIcon size={16} strokeWidth={2} /></span>
            </button>
          </div>
        </div>
      )}

      {!loading && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)' }}>Schema version: {version}</p>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)' }}>
            Web build: {WEB_BUILD.version} ({WEB_BUILD.commitSha})
            {WEB_BUILD.builtAt ? ` · ${WEB_BUILD.builtAt}` : ''}
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)' }}>
            API build: {apiBuildVersion} ({apiCommitSha})
            {apiDeployedAt ? ` · ${apiDeployedAt}` : ''}
          </p>
        </div>
      )}

      {clearOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.32)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 30,
          }}
        >
          <div style={{
            width: '100%',
            maxWidth: 420,
            borderRadius: 24,
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            boxShadow: '0 20px 50px rgba(15, 23, 42, 0.18)',
            padding: 20,
          }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Clear Data</h2>
            <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              This removes all transactions, budgets, monthly balances, and every account.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              Type <strong>confirm</strong> to execute.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              Your current password is required for this action.
            </p>

            <input
              value={clearValue}
              onChange={(event) => {
                setClearValue(event.target.value);
                if (clearError) setClearError(null);
              }}
              placeholder="confirm"
              autoFocus
              style={{
                width: '100%',
                marginTop: 14,
                borderRadius: 14,
                border: '1px solid var(--line)',
                padding: '12px 14px',
                fontSize: 14,
                outline: 'none',
                background: 'var(--background)',
                color: 'var(--ink)',
              }}
            />

            <input
              type="password"
              value={clearPassword}
              onChange={(event) => {
                setClearPassword(event.target.value);
                if (clearError) setClearError(null);
              }}
              placeholder="Current password"
              style={{
                width: '100%',
                marginTop: 10,
                borderRadius: 14,
                border: '1px solid var(--line)',
                padding: '12px 14px',
                fontSize: 14,
                outline: 'none',
                background: 'var(--background)',
                color: 'var(--ink)',
              }}
            />

            {clearError && (
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--expense)' }}>{clearError}</p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                type="button"
                onClick={() => {
                  if (clearing) return;
                  setClearOpen(false);
                  setClearValue('');
                  setClearPassword('');
                  setClearError(null);
                }}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  padding: '12px 14px',
                  fontWeight: 600,
                  cursor: clearing ? 'default' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={handleClearData}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  border: '1px solid var(--expense)',
                  background: 'var(--expense)',
                  color: '#fff',
                  padding: '12px 14px',
                  fontWeight: 700,
                  cursor: clearing ? 'progress' : 'pointer',
                  opacity: clearing ? 0.7 : 1,
                }}
              >
                {clearing ? 'Clearing…' : 'Clear Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
