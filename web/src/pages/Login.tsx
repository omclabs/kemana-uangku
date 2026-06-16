import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch, setSession } from '../lib/api';

interface LoginResponse {
  token: string;
  user: { id: string; username: string };
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-[0_4px_16px_-6px_rgba(60,45,110,.12)]"
      >
        <h1 className="mb-6 text-center text-2xl font-semibold text-ink">
          kemana uangku
        </h1>

        <label className="mb-1 block text-sm font-medium text-muted" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="mb-4 w-full rounded-2xl border border-line px-3 py-2 text-base"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />

        <label className="mb-1 block text-sm font-medium text-muted" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="mb-4 w-full rounded-2xl border border-line px-3 py-2 text-base"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {error && <p className="mb-4 text-sm text-expense">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-gradient-to-br from-accent to-accent-2 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
