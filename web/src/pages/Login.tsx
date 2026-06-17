import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch, setSession } from '../lib/api';
import type { SessionUser } from '../lib/types';

interface LoginResponse {
  token: string;
  user: SessionUser;
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setSession(res.token, res.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(165deg, #1A1560 0%, #3D2AAA 35%, #5B43E8 62%, #7B61F0 82%, #9580F8 100%)',
      padding: '24px 16px',
    }}>

      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', width: 420, height: 420, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(120,100,255,.45) 0%, transparent 70%)',
          top: -160, left: -140,
          animation: 'ku-float1 8s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: 340, height: 340, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(180,100,255,.3) 0%, transparent 70%)',
          bottom: -100, right: -100,
          animation: 'ku-float2 11s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: 200, height: 200, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(100,200,255,.15) 0%, transparent 70%)',
          top: '38%', left: '65%',
          animation: 'ku-float3 9s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.07) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />
        <div style={{
          position: 'absolute', top: 0, left: '10%', width: '80%', height: 220,
          background: 'linear-gradient(180deg, rgba(255,255,255,.1) 0%, transparent 100%)',
          borderRadius: '0 0 50% 50%',
        }} />
      </div>

      <div style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', marginBottom: 28,
        animation: 'ku-slide-up .5s ease both',
      }}>
        <div style={{ position: 'relative', width: 80, height: 80 }}>
          <div style={{
            position: 'absolute', inset: -8, borderRadius: 28,
            border: '2px solid rgba(255,255,255,.25)',
            animation: 'ku-pulse-ring 2.8s ease-out infinite',
          }} />
          <div style={{
            width: 80, height: 80, borderRadius: 22,
            background: 'linear-gradient(145deg, #ffffff 0%, rgba(255,255,255,.88) 100%)',
            boxShadow: '0 16px 40px -8px rgba(30,20,80,.6), 0 4px 12px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: -20, left: -15, width: 90, height: 90,
              background: 'radial-gradient(circle, rgba(255,255,255,.2) 0%, transparent 65%)',
            }} />
            <img src="/icon.svg" alt="Money Wing logo" style={{ width: 44, height: 44, position: 'relative' }} />
          </div>
        </div>

        <div style={{ marginTop: 16, textAlign: 'center', lineHeight: 1.05, filter: 'drop-shadow(0 4px 24px rgba(30,10,80,.5))' }}>
          <div style={{
            fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,.65)',
            letterSpacing: '0.22em', textTransform: 'uppercase',
          }}>kemana</div>
          <div style={{
            fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #fff 30%, rgba(200,185,255,.9) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>uangku</div>
        </div>

        <div style={{
          marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)',
          borderRadius: 999, padding: '4px 12px',
        }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', fontWeight: 500, letterSpacing: '0.02em' }}>
            catet, biar nggak boncos
          </span>
          <span style={{ fontSize: 12 }}>💸</span>
        </div>
      </div>

      <div style={{
        position: 'relative', width: '100%', maxWidth: 380,
        borderRadius: 28,
        background: 'rgba(255,255,255,.13)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        border: '1px solid rgba(255,255,255,.22)',
        padding: '28px 24px',
        boxShadow: '0 24px 60px rgba(20,12,60,.45), inset 0 1px 0 rgba(255,255,255,.28), inset 0 -1px 0 rgba(0,0,0,.08)',
        animation: 'ku-slide-up .5s .1s ease both',
      }}>

        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
            Welcome back
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', marginTop: 3, fontWeight: 500 }}>
            Sign in to your account
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{
              display: 'block', fontSize: 11.5, fontWeight: 700,
              color: 'rgba(255,255,255,.7)', letterSpacing: '0.05em',
              textTransform: 'uppercase', marginBottom: 7,
            }}>
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,.45)', pointerEvents: 'none',
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </div>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                placeholder="Enter your username"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,.09)',
                  border: '1px solid rgba(255,255,255,.18)',
                  borderRadius: 14,
                  padding: '13px 14px 13px 42px',
                  boxShadow: 'inset 0 2px 6px rgba(0,0,0,.2), 0 1px 0 rgba(255,255,255,.1)',
                  fontSize: 14, color: '#fff',
                  fontFamily: 'inherit', outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,.45)';
                  e.currentTarget.style.background = 'rgba(255,255,255,.14)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,.18)';
                  e.currentTarget.style.background = 'rgba(255,255,255,.09)';
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{
              display: 'block', fontSize: 11.5, fontWeight: 700,
              color: 'rgba(255,255,255,.7)', letterSpacing: '0.05em',
              textTransform: 'uppercase', marginBottom: 7,
            }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,.45)', pointerEvents: 'none',
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,.09)',
                  border: '1px solid rgba(255,255,255,.18)',
                  borderRadius: 14,
                  padding: '13px 44px 13px 42px',
                  boxShadow: 'inset 0 2px 6px rgba(0,0,0,.2), 0 1px 0 rgba(255,255,255,.1)',
                  fontSize: 14, color: '#fff',
                  fontFamily: 'inherit', outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,.45)';
                  e.currentTarget.style.background = 'rgba(255,255,255,.14)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,.18)';
                  e.currentTarget.style.background = 'rgba(255,255,255,.09)';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  color: 'rgba(255,255,255,.4)', background: 'none', border: 'none',
                  cursor: 'pointer', padding: 0, display: 'flex',
                }}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'rgba(229,84,75,.18)', border: '1px solid rgba(229,84,75,.3)',
              borderRadius: 12, fontSize: 13, color: '#FCA5A5', fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', inset: 4, borderRadius: 14,
              background: 'linear-gradient(135deg, #5B43E8, #9B8BF4)',
              filter: 'blur(14px)', opacity: loading ? 0.3 : 0.7,
              transition: 'opacity .2s',
            }} />
            <button
              type="submit"
              disabled={loading}
              style={{
                position: 'relative', width: '100%', border: 'none',
                borderRadius: 16, padding: '15px 0',
                background: 'linear-gradient(135deg, #7B61F0 0%, #5B43E8 50%, #4535CC 100%)',
                color: '#fff', fontSize: 15, fontWeight: 800,
                fontFamily: 'inherit', letterSpacing: '0.01em',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 12px 28px -8px rgba(91,67,232,.7), inset 0 1px 0 rgba(255,255,255,.3), inset 0 -1px 0 rgba(0,0,0,.15)',
                transition: 'opacity .2s, transform .1s',
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.98)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {loading ? 'Logging in…' : 'Log in'}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}
