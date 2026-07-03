import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageContainer from '../../components/PageContainer';
import PageHeader from '../../components/PageHeader';
import { ApiError, apiFetch } from '../../lib/api';
import { categoryVisual, initial } from '../../lib/categories';
import type { TrackedItem } from '../../lib/types';

function CollectionIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="4" rx="1.5" />
      <rect x="4" y="10" width="16" height="4" rx="1.5" />
      <rect x="4" y="15" width="16" height="4" rx="1.5" />
    </svg>
  );
}

function dateKey(unix: number | null | undefined) {
  if (!unix) return 'unknown';
  const date = new Date(unix * 1000);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatExactDate(unix: number | null | undefined) {
  if (!unix) return 'Unknown';
  return new Date(unix * 1000).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function groupByRunOutDate(items: TrackedItem[]) {
  const groups: { key: string; date: number | null; items: TrackedItem[] }[] = [];
  const sortedItems = [...items].sort((left, right) => {
    const leftDate = left.estimated_run_out_at ?? Number.MAX_SAFE_INTEGER;
    const rightDate = right.estimated_run_out_at ?? Number.MAX_SAFE_INTEGER;
    if (leftDate !== rightDate) return leftDate - rightDate;
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });

  for (const item of sortedItems) {
    const key = dateKey(item.estimated_run_out_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, date: item.estimated_run_out_at ?? null, items: [item] });
    }
  }
  return groups;
}

function AlertRow({ item }: { item: TrackedItem }) {
  const visual = categoryVisual(item.name);
  const transactionHref = `/transactions/new?category_id=${encodeURIComponent(item.category_id)}&tracked_item_id=${encodeURIComponent(item.id)}`;

  return (
    <Link
      to={transactionHref}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        padding: '11px 16px',
        borderBottom: '1px solid var(--line)',
        textDecoration: 'none',
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          flexShrink: 0,
          background: visual.soft,
          color: visual.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        {initial(item.name)}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.name}
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>
          {item.category_name} - {item.unit}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--expense)' }}>
          {formatExactDate(item.estimated_run_out_at)}
        </div>
      </div>
    </Link>
  );
}

export default function TrackedItemAlerts() {
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<TrackedItem[]>('/tracked-items/alerts')
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load alerts');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const groups = groupByRunOutDate(items);

  return (
    <PageContainer>
      <PageHeader
        title="Stock Alerts"
        backTo="/dashboard"
        actions={(
        <Link
          to="/config/tracked-items"
          aria-label="Open tracked items"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 13,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            color: '#fff',
            boxShadow: '0 8px 16px -6px var(--accent)',
            textDecoration: 'none',
          }}
        >
          <CollectionIcon />
        </Link>
        )}
      />

      {loading && <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>Loading…</p>}
      {error && <p style={{ textAlign: 'center', color: 'var(--expense)', padding: '32px 0' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map((group) => (
            <section key={group.key}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '11px 16px 9px',
                  background: 'var(--surface-2)',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', lineHeight: 1, minWidth: 30 }}>
                  {group.date ? String(new Date(group.date * 1000).getDate()).padStart(2, '0') : '--'}
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 700, background: 'var(--accent)', color: '#fff', padding: '2px 6px', borderRadius: 5, flexShrink: 0 }}>
                  {group.date ? new Date(group.date * 1000).toLocaleString('en', { weekday: 'short' }) : 'N/A'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, flex: 1 }}>
                  {group.date
                    ? `${String(new Date(group.date * 1000).getMonth() + 1).padStart(2, '0')}.${new Date(group.date * 1000).getFullYear()}`
                    : 'Unknown'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--expense)', whiteSpace: 'nowrap' }}>
                  {group.items.length} alert{group.items.length > 1 ? 's' : ''}
                </span>
              </div>
              <div>
                {group.items.map((item) => (
                  <AlertRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}

          {items.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>
              No upcoming stock alerts.
            </p>
          )}
        </div>
      )}
    </PageContainer>
  );
}
