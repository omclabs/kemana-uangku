import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch, getUser } from '../lib/api';
import PageContainer from '../components/PageContainer';
import { CheckIcon, XMarkIcon } from '../components/icons';

export default function ChangePassword() {
  const navigate = useNavigate();
  const user = getUser();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

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
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold text-ink">Change Password</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-muted" htmlFor="currentPassword">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            className="w-full rounded-2xl border border-line px-3 py-2 text-base"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-muted" htmlFor="newPassword">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            className="w-full rounded-2xl border border-line px-3 py-2 text-base"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-muted" htmlFor="confirmPassword">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            className="w-full rounded-2xl border border-line px-3 py-2 text-base"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>

        {error && <p className="text-sm text-expense">{error}</p>}
        {saved && <p className="text-sm text-income">Password updated.</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            aria-label={saving ? 'Saving...' : 'Save'}
            className="flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 px-4 py-3 text-white disabled:opacity-50"
          >
            <CheckIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/config')}
            aria-label="Cancel"
            className="flex flex-1 items-center justify-center rounded-2xl border border-line px-4 py-3 text-muted"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </form>
    </PageContainer>
  );
}
