import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageContainer from '../../components/PageContainer';
import PageHeader from '../../components/PageHeader';
import { PlusIcon } from '../../components/icons';
import { ApiError, apiFetch } from '../../lib/api';
import type { User } from '../../lib/types';

function Chevron({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default function UserList() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<User[]>('/users?include_inactive=true')
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load users');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedUsers = [...users].sort((left, right) => {
    if (left.is_active !== right.is_active) return right.is_active - left.is_active;
    if (left.role !== right.role) return left.role === 'admin' ? -1 : 1;
    return left.username.localeCompare(right.username);
  });

  return (
    <PageContainer>
      <PageHeader
        title="Users"
        backTo="/config"
        subtitle="Manage app access and roles"
        actions={(
          <Link
            to="/config/users/new"
            aria-label="Add user"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 40, height: 40, borderRadius: 13,
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              color: '#fff', boxShadow: '0 8px 16px -6px var(--accent)',
            }}
          >
            <PlusIcon className="h-5 w-5" />
          </Link>
        )}
      />

      {loading && <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>Loading…</p>}
      {error && <p style={{ textAlign: 'center', color: 'var(--expense)', padding: '32px 0' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sortedUsers.map((user) => (
            <Link
              key={user.id}
              to={`/config/users/${user.id}/edit`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px',
                borderRadius: 20,
                border: '1px solid var(--line)',
                background: 'var(--surface)',
                boxShadow: '0 2px 12px rgba(0,0,0,.04)',
                textDecoration: 'none',
              }}
            >
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 13,
                  flexShrink: 0,
                  background: user.role === 'admin'
                    ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                    : 'var(--surface-2)',
                  color: user.role === 'admin' ? 'var(--accent)' : 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                }}
              >
                {user.username.slice(0, 1)}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: 'var(--ink)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {user.username}
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: user.role === 'admin' ? 'var(--accent)' : 'var(--muted)',
                      background: user.role === 'admin'
                        ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                        : 'var(--line)',
                      padding: '2px 7px',
                      borderRadius: 999,
                      textTransform: 'uppercase',
                    }}
                  >
                    {user.role}
                  </span>
                  {user.is_active === 0 && (
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: 'var(--expense)',
                        background: 'var(--expense-soft)',
                        padding: '2px 7px',
                        borderRadius: 999,
                      }}
                    >
                      Inactive
                    </span>
                  )}
                </div>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 12.5,
                    color: 'var(--muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user.email}
                </p>
              </div>

              <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                <Chevron />
              </span>
            </Link>
          ))}

          {sortedUsers.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>
              No users yet.
            </p>
          )}
        </div>
      )}
    </PageContainer>
  );
}
