import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError, apiFetch, clearSession, getUser } from '../lib/api';
import PageContainer from '../components/PageContainer';

function LockIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
}
function ShieldIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
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

export default function ChangePassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const mustRotateDefaultPassword = location.state && typeof location.state === 'object' && 'mustChangePassword' in location.state;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!user) {
      setError('Not logged in.');
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/users/${user.id}/change-password`, {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      clearSession();
      navigate('/login', {
        replace: true,
        state: { passwordChanged: true },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update password');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'none', border: 'none', padding: 0,
    fontSize: 14, fontWeight: 600, color: 'var(--ink)', fontFamily: 'inherit',
    outline: 'none',
  };

  return (
    <PageContainer>
      {/* ── Back + title ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 22,
        position: 'sticky',
        top: 0,
        zIndex: 15,
        padding: '10px 0 12px',
        background: 'color-mix(in srgb, var(--bg) 84%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid color-mix(in srgb, var(--line) 75%, transparent)',
      }}>
        <button type="button" onClick={() => navigate('/config')} style={{
          width: 38, height: 38, borderRadius: 12, flexShrink: 0,
          border: '1px solid var(--line)', background: 'var(--surface)',
          color: 'var(--muted)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
          Change Password
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FieldRow icon={<LockIcon />} label="Current">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </FieldRow>

          <FieldRow icon={<LockIcon />} label="New">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
              style={inputStyle}
            />
          </FieldRow>

          <FieldRow icon={<ShieldIcon />} label="Confirm">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
              style={inputStyle}
            />
          </FieldRow>

          {error && (
            <div style={{
              padding: '10px 14px', background: 'var(--expense-soft)',
              border: '1px solid color-mix(in srgb, var(--expense) 25%, transparent)',
              borderRadius: 12, fontSize: 13, color: 'var(--expense)', fontWeight: 500,
            }}>
              {error}
            </div>
          )}
          {mustRotateDefaultPassword && (
            <div style={{
              padding: '10px 14px',
              background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))',
              border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
              borderRadius: 12,
              fontSize: 13,
              color: 'var(--ink)',
              fontWeight: 600,
            }}>
              Default admin password is still active. Change it now to harden the app.
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
                {saving ? 'Saving…' : 'Update password'}
              </button>
            </div>
            <button type="button" onClick={() => navigate('/config')} style={{
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
