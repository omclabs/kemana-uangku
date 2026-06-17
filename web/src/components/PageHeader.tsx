import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  backTo?: string;
  actions?: ReactNode;
  info?: string;
  marginBottom?: number;
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <path d="M12 7h.01" />
    </svg>
  );
}

export default function PageHeader({
  title,
  backTo,
  actions,
  info,
  marginBottom = 20,
}: PageHeaderProps) {
  const navigate = useNavigate();
  const isDetail = Boolean(backTo);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLDivElement | null>(null);
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);
  const infoBubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubbleStyle, setBubbleStyle] = useState<{ left: number; top: number; width: number } | null>(null);

  useEffect(() => {
    if (!infoOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!infoRef.current?.contains(event.target as Node)) {
        setInfoOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setInfoOpen(false);
      }
    }

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [infoOpen]);

  useLayoutEffect(() => {
    if (!infoOpen || !infoButtonRef.current || !infoBubbleRef.current) return;

    function updateBubblePosition() {
      const buttonRect = infoButtonRef.current!.getBoundingClientRect();
      const bubbleRect = infoBubbleRef.current!.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const gutter = 16;
      const width = Math.min(220, Math.max(160, viewportWidth - gutter * 2));
      const maxLeft = Math.max(gutter, viewportWidth - width - gutter);
      const left = Math.min(Math.max(buttonRect.left - 8, gutter), maxLeft);
      const belowTop = buttonRect.bottom + 10;
      const aboveTop = buttonRect.top - bubbleRect.height - 10;
      const top = belowTop + bubbleRect.height + gutter <= viewportHeight
        ? belowTop
        : Math.max(gutter, aboveTop);

      setBubbleStyle({ left, top, width });
    }

    updateBubblePosition();
    window.addEventListener('resize', updateBubblePosition);
    window.addEventListener('scroll', updateBubblePosition, true);
    return () => {
      window.removeEventListener('resize', updateBubblePosition);
      window.removeEventListener('scroll', updateBubblePosition, true);
    };
  }, [infoOpen, info]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom,
        position: 'sticky',
        top: 0,
        zIndex: 15,
        padding: '10px 0 12px',
        background: 'color-mix(in srgb, var(--bg) 84%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid color-mix(in srgb, var(--line) 75%, transparent)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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
            {info && (
              <div ref={infoRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  ref={infoButtonRef}
                  type="button"
                  aria-label={`Info about ${title}`}
                  aria-expanded={infoOpen}
                  onClick={() => setInfoOpen((open) => !open)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    border: '1px solid var(--line)',
                    background: infoOpen ? 'var(--surface-2)' : 'var(--surface)',
                    color: 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <InfoIcon />
                </button>
                {infoOpen && (
                  <div
                    ref={infoBubbleRef}
                    style={{
                      position: 'fixed',
                      left: bubbleStyle?.left ?? 16,
                      top: bubbleStyle?.top ?? 16,
                      zIndex: 20,
                      width: bubbleStyle?.width ?? 220,
                      maxWidth: 'calc(100vw - 32px)',
                      padding: '10px 12px',
                      borderRadius: 14,
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                      color: 'var(--muted)',
                      fontSize: 12.5,
                      lineHeight: 1.45,
                      boxShadow: '0 16px 34px -18px rgba(0,0,0,.28)',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: -6,
                        left: 14,
                        width: 12,
                        height: 12,
                        transform: 'rotate(45deg)',
                        background: 'var(--surface)',
                        borderLeft: '1px solid var(--line)',
                        borderTop: '1px solid var(--line)',
                      }}
                    />
                    <div style={{ position: 'relative' }}>{info}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}
