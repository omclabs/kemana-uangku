import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageContainer from '../../components/PageContainer';
import PageHeader from '../../components/PageHeader';
import { PlusIcon } from '../../components/icons';
import SummaryStrip from '../../components/SummaryStrip';
import { ApiError, apiFetch } from '../../lib/api';
import { categoryVisual, initial } from '../../lib/categories';
import type { TrackedItem } from '../../lib/types';

function formatDayLabel(daysRemaining: number | null | undefined) {
  if (daysRemaining === null || daysRemaining === undefined) return 'Forecast unavailable';
  if (daysRemaining <= 0) return 'Runs out today';
  if (daysRemaining === 1) return '1 day left';
  return `${daysRemaining} days left`;
}

function formatDateLabel(unix: number | null | undefined) {
  if (!unix) return 'Unknown';
  return new Date(unix * 1000).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const chipBase = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  borderRadius: 999,
  padding: '5px 9px',
  fontSize: 11,
  fontWeight: 700,
} as const;

function AlertTriangle() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function ItemRow({ item }: { item: TrackedItem }) {
  const visual = categoryVisual(item.category_name ?? item.name);
  const alert = item.alert_active;
  const runsOutToday = (item.days_remaining ?? 99) <= 0;

  if (!item.is_active) {
    return (
      <Link
        to={`/config/tracked-items/${item.id}/edit`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderRadius: 18,
          border: '1px dashed var(--line)',
          background: 'var(--surface-2)',
          padding: '13px 14px',
          textDecoration: 'none',
          opacity: 0.72,
        }}
      >
        <span style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800 }}>
          {initial(item.name)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--line)', padding: '2px 7px', borderRadius: 999, flexShrink: 0 }}>Inactive</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{item.category_name} · {item.unit}</div>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 6l6 6-6 6" /></svg>
      </Link>
    );
  }

  return (
    <Link
      to={`/config/tracked-items/${item.id}/edit`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderRadius: 18,
        border: alert ? '1px solid var(--expense)' : '1px solid var(--line)',
        background: 'var(--surface)',
        padding: '13px 14px',
        textDecoration: 'none',
        boxShadow: '0 2px 12px rgba(0,0,0,.04)',
      }}
    >
      <span style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: visual.soft, color: visual.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800 }}>
        {initial(item.name)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
          {alert && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', background: 'var(--expense)', padding: '2px 7px', borderRadius: 999, flexShrink: 0 }}>ALERT</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{item.category_name} · {item.unit}</div>
        <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
          <span style={{ ...chipBase, color: alert ? 'var(--expense)' : 'var(--ink)', background: alert ? 'var(--expense-soft)' : 'var(--surface-2)', border: alert ? '1px solid transparent' : '1px solid var(--line)' }}>
            {runsOutToday && alert && <AlertTriangle />}
            {formatDayLabel(item.days_remaining)}
          </span>
          <span style={{ ...chipBase, fontWeight: 600, color: 'var(--muted)', background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            {formatDateLabel(item.estimated_run_out_at)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function TrackedItemList() {
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<TrackedItem[]>('/tracked-items?include_inactive=true')
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load tracked items');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const { activeCount, alertCount } = useMemo(() => {
    const active = items.filter((item) => item.is_active);
    return { activeCount: active.length, alertCount: active.filter((item) => item.alert_active).length };
  }, [items]);

  const sortedItems = useMemo(() => (
    [...items].sort((left, right) => {
      if (left.alert_active !== right.alert_active) return left.alert_active ? -1 : 1;

      const leftDate = left.estimated_run_out_at ?? Number.MAX_SAFE_INTEGER;
      const rightDate = right.estimated_run_out_at ?? Number.MAX_SAFE_INTEGER;
      if (leftDate !== rightDate) return leftDate - rightDate;

      if (left.is_active !== right.is_active) return left.is_active ? -1 : 1;

      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    })
  ), [items]);

  return (
    <PageContainer>
      <PageHeader
        title="Tracked Items"
        backTo="/config"
        actions={(
          <Link
            to="/config/tracked-items/new"
            aria-label="Add tracked item"
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
        <>
          <SummaryStrip
            items={[
              { label: 'Tracking', value: `${activeCount} item${activeCount === 1 ? '' : 's'}` },
              { label: 'Need refill', value: `${alertCount} soon`, color: 'var(--expense)' },
            ]}
          />

          {alertCount > 0 && (
            <Link
              to="/tracked-items/alerts"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 16,
                padding: '12px 14px',
                marginBottom: 16,
                textDecoration: 'none',
                boxShadow: '0 2px 12px rgba(0,0,0,.04)',
              }}
            >
              <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: 'var(--expense-soft)', color: 'var(--expense)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>View stock alerts</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>
                  {alertCount} item{alertCount === 1 ? '' : 's'} running low
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: 'var(--expense)', minWidth: 22, height: 22, padding: '0 7px', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {alertCount}
              </span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 6l6 6-6 6" /></svg>
            </Link>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {sortedItems.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}

            {items.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>
                No tracked items yet.
              </p>
            )}
          </div>
        </>
      )}
    </PageContainer>
  );
}
