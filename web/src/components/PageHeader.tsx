import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  backTo?: string;
  actions?: ReactNode;
  subtitle?: string;
  marginBottom?: number;
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export default function PageHeader({
  title,
  backTo,
  actions,
  subtitle,
  marginBottom = 20,
}: PageHeaderProps) {
  const navigate = useNavigate();
  const isDetail = Boolean(backTo);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {backTo && (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label={`Back to ${backTo}`}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              flexShrink: 0,
              border: '1px solid var(--line)',
              background: 'var(--surface)',
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <BackIcon />
          </button>
        )}

        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: isDetail ? 20 : 22,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 12.5,
                color: 'var(--muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}
