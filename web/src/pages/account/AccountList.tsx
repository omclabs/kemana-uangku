import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';
import { categoryVisual, initial } from '../../lib/categories';
import { ACCOUNT_TYPES, type Account, type AccountType } from '../../lib/types';
import PageContainer from '../../components/PageContainer';

function PlusIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none"
      viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

const fmt = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
});

function trimCompactDecimals(value: number, digits: number): string {
  return value
    .toFixed(digits)
    .replace(/\.?0+$/, '')
    .replace('.', ',');
}

function shortFmt(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}Rp ${trimCompactDecimals(abs / 1_000_000, 2)} jt`;
  if (abs >= 1_000)     return `${sign}Rp ${Math.round(abs / 1_000)}rb`;
  return fmt.format(value);
}

const TYPE_META: Record<AccountType, { label: string; icon: ReactNode }> = {
  bank: {
    label: 'Bank',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10h16M5 10l7-5 7 5M6 10v8M10 10v8M14 10v8M18 10v8M4 18h16"/>
      </svg>
    ),
  },
  cash: {
    label: 'Cash',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2"/>
        <circle cx="12" cy="12" r="2.5"/>
      </svg>
    ),
  },
  autodebet: {
    label: 'Auto Debet',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8M3 12l3-2.7A9 9 0 0 0 21 12"/>
      </svg>
    ),
  },
  credit_card: {
    label: 'Credit Card',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <path d="M2 10h20"/>
      </svg>
    ),
  },
  prepaid: {
    label: 'Prepaid',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <path d="M12 10v4M10 12h4"/>
      </svg>
    ),
  },
  savings: {
    label: 'Savings',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a7 7 0 0 1 7 7c0 4.4-7 13-7 13S5 13.4 5 9a7 7 0 0 1 7-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
    ),
  },
  investment: {
    label: 'Investment',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
        <polyline points="16 7 22 7 22 13"/>
      </svg>
    ),
  },
  loan: {
    label: 'Loan',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
  },
};

function Chevron({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6"/>
    </svg>
  );
}

export default function AccountList() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Account[]>('/accounts')
      .then((list) => { if (!cancelled) setAccounts(list); })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load accounts'); })
      .finally(()  => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const childrenOf = (parentId: string) => accounts.filter((a) => a.parent_id === parentId);

  const topLevel = accounts.filter((a) => a.parent_id === null);
  const groups = ACCOUNT_TYPES
    .map((type) => ({ type, items: topLevel.filter((a) => a.type === type) }))
    .filter((g) => g.items.length > 0);

  const included = topLevel.filter((a) => a.include_in_total === 1);
  const totalAssets = included
    .filter((a) => a.type !== 'credit_card' && a.type !== 'loan')
    .reduce((sum, a) => sum + a.computed_balance, 0);
  const totalLiabilities = included.reduce((sum, a) => {
    if (a.type === 'credit_card') return sum + ((a.credit_limit ?? 0) - a.computed_balance);
    if (a.type === 'loan')        return sum + Math.abs(a.computed_balance);
    return sum;
  }, 0);

  return (
    <PageContainer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
          Accounts
        </h1>
        <Link
          to="/accounts/new"
          aria-label="Add account"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 40, height: 40, borderRadius: 13,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            color: '#fff', boxShadow: '0 8px 16px -6px var(--accent)',
          }}
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
      </div>

      {!loading && !error && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div style={{
            flex: 1, background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 18, padding: '13px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 30, height: 30, borderRadius: 10,
                background: 'var(--income-soft)', color: 'var(--income)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M12 5l-7 7M12 5l7 7"/>
                </svg>
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>Assets</span>
            </div>
            <p style={{ margin: '9px 0 0', fontSize: 15.5, fontWeight: 800, color: 'var(--ink)' }}>
              {fmt.format(totalAssets)}
            </p>
          </div>
          <div style={{
            flex: 1, background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 18, padding: '13px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 30, height: 30, borderRadius: 10,
                background: 'var(--expense-soft)', color: 'var(--expense)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M12 19l-7-7M12 19l7-7"/>
                </svg>
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>Liabilities</span>
            </div>
            <p style={{ margin: '9px 0 0', fontSize: 15.5, fontWeight: 800, color: 'var(--ink)' }}>
              {fmt.format(totalLiabilities)}
            </p>
          </div>
        </div>
      )}

      {loading && <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>Loading…</p>}
      {error   && <p style={{ textAlign: 'center', color: 'var(--expense)', padding: '32px 0' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {groups.map(({ type, items }) => {
            const meta = TYPE_META[type];
            return (
              <section key={type}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  marginBottom: 10, color: 'var(--muted)',
                }}>
                  <span style={{ opacity: .7 }}>{meta.icon}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  }}>
                    {meta.label}
                  </span>
                  <span style={{
                    marginLeft: 4, fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                    background: 'var(--line)', padding: '1px 7px', borderRadius: 999,
                  }}>
                    {items.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {items.map((account) => {
                    const children  = childrenOf(account.id);
                    const hasKids   = children.length > 0;
                    const totalBal  = account.computed_balance +
                      children.reduce((s, c) => s + c.computed_balance, 0);
                    const visual    = categoryVisual(account.name);
                    const isNeg     = totalBal < 0;

                    return (
                      <div key={account.id} style={{
                        background: 'var(--surface)', border: '1px solid var(--line)',
                        borderRadius: 20, overflow: 'hidden',
                        boxShadow: '0 2px 12px rgba(0,0,0,.04)',
                      }}>
                        <Link
                          to={`/accounts/${account.id}/edit`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '14px 16px', textDecoration: 'none',
                          }}
                        >
                          <span style={{
                            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                            background: visual.soft, color: visual.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 15, fontWeight: 800,
                          }}>
                            {initial(account.name)}
                          </span>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                              <span style={{
                                fontSize: 15, fontWeight: 700, color: 'var(--ink)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {account.name}
                              </span>
                              {hasKids && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700,
                                  color: 'var(--accent)',
                                  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                                  padding: '2px 7px', borderRadius: 999, flexShrink: 0,
                                }}>
                                  {children.length} sub
                                </span>
                              )}
                              {!account.include_in_total && (
                                <span style={{
                                  fontSize: 10, fontWeight: 600, color: 'var(--muted)',
                                  background: 'var(--line)', padding: '2px 7px', borderRadius: 999, flexShrink: 0,
                                }}>
                                  excluded
                                </span>
                              )}
                            </div>
                            {(account.type === 'credit_card' || hasKids) && (
                              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>
                                {account.type === 'credit_card' && account.credit_limit != null
                                  ? `avail. ${shortFmt(account.credit_limit + account.computed_balance)}`
                                  : `own ${shortFmt(account.computed_balance)}`}
                              </p>
                            )}
                          </div>

                          <span style={{
                            fontSize: 15, fontWeight: 800, flexShrink: 0,
                            color: (hasKids ? isNeg : account.computed_balance < 0) ? 'var(--expense)' : 'var(--ink)',
                          }}>
                            {shortFmt(hasKids ? totalBal : account.computed_balance)}
                          </span>

                          <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                            <Chevron />
                          </span>
                        </Link>

                        {hasKids && children.map((child, idx) => {
                          const isLast = idx === children.length - 1;
                          return (
                            <Link
                              key={child.id}
                              to={`/accounts/${child.id}/edit`}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '11px 16px 11px 20px',
                                borderTop: '1px solid var(--line)',
                                textDecoration: 'none',
                                background: 'var(--surface-2)',
                              }}
                            >
                              <div style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', width: 20, flexShrink: 0, alignSelf: 'stretch',
                              }}>
                                <div style={{
                                  width: 1.5, flex: 1,
                                  background: isLast ? 'transparent' : 'var(--line)',
                                }} />
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                  <path d="M2 0 L2 7 L12 7" stroke="var(--line)" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                                {!isLast && <div style={{ width: 1.5, flex: 1, background: 'var(--line)' }} />}
                              </div>

                              <span style={{
                                flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {child.name}
                              </span>

                              <span style={{
                                fontSize: 13.5, fontWeight: 700, flexShrink: 0,
                                color: child.computed_balance < 0 ? 'var(--expense)' : 'var(--ink)',
                              }}>
                                {fmt.format(child.computed_balance)}
                              </span>

                              <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                                <Chevron size={14} />
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {groups.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>
              No accounts yet.
            </p>
          )}
        </div>
      )}
    </PageContainer>
  );
}
