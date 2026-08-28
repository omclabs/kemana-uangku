import { useNavigate } from 'react-router-dom';
import { LockIcon } from './compactIcons';

export default function ForbiddenNotice() {
  const navigate = useNavigate();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      background: 'color-mix(in srgb, var(--bg) 55%, transparent)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
    }}>
      <div style={{
        width: '100%', maxWidth: 340,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 20,
        boxShadow: '0 24px 48px -20px rgba(0,0,0,.4)',
        padding: '28px 24px 24px',
        textAlign: 'center',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 16, margin: '0 auto 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--expense) 12%, transparent)',
          color: 'var(--expense)',
        }}>
          <LockIcon size={24} strokeWidth={2} />
        </div>

        <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
          Access restricted
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          You don&apos;t have permission to view this page. Contact an admin if you think this is a mistake.
        </p>

        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            width: '100%', padding: '11px 16px', border: 'none', borderRadius: 13,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 8px 16px -6px var(--accent)',
          }}
        >
          Go back
        </button>
      </div>
    </div>
  );
}
