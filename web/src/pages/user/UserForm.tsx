import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageContainer from '../../components/PageContainer';
import PageHeader from '../../components/PageHeader';
import StyledSelect from '../../components/StyledSelect';
import { ApiError, apiFetch } from '../../lib/api';
import type { Role, User, UserInput } from '../../lib/types';

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 14,
  padding: '12px 14px',
  fontSize: 15,
  color: 'var(--ink)',
  fontFamily: 'inherit',
  outline: 'none',
};

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 11.5,
          fontWeight: 700,
          color: 'var(--muted)',
          letterSpacing: '.05em',
          textTransform: 'uppercase',
          marginBottom: 7,
        }}
      >
        {label}
      </label>
      {children}
      {hint && <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--muted)' }}>{hint}</p>}
    </div>
  );
}

const roleOptions = [
  { value: 'admin', label: 'Admin', hint: 'Can manage users and all app data' },
  { value: 'user', label: 'User', hint: 'Can use the app but cannot manage users' },
];

export default function UserForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const user = await apiFetch<User>(`/users/${id}`);
        if (cancelled) return;
        setUsername(user.username);
        setEmail(user.email);
        setRole(user.role);
        setIsActive(user.is_active === 1);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load user');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    const body: UserInput = {
      username,
      email,
      role,
      is_active: isActive,
    };

    if (password.trim()) {
      body.password = password.trim();
    }

    try {
      if (isEdit) {
        await apiFetch(`/users/${id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        const createBody: UserInput & { password: string } = {
          username,
          email,
          role,
          password: password.trim(),
        };
        await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify(createBody),
        });
      }
      navigate('/config/users');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save user');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>Loading…</p>;
  }

  return (
    <PageContainer>
      <PageHeader
        title={isEdit ? 'Edit User' : 'Add User'}
        backTo="/config/users"
        info={isEdit ? 'Update access and role details.' : 'Create a new app user.'}
      />

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Field label="Username">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              style={inputStyle}
              onFocus={(event) => { event.currentTarget.style.borderColor = 'var(--accent)'; }}
              onBlur={(event) => { event.currentTarget.style.borderColor = 'var(--line)'; }}
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              style={inputStyle}
              onFocus={(event) => { event.currentTarget.style.borderColor = 'var(--accent)'; }}
              onBlur={(event) => { event.currentTarget.style.borderColor = 'var(--line)'; }}
            />
          </Field>

          <Field label="Role">
            <StyledSelect
              value={role}
              options={roleOptions}
              onChange={(value) => setRole(value as Role)}
            />
          </Field>

          <Field
            label={isEdit ? 'New Password' : 'Password'}
            hint={isEdit ? 'Leave empty to keep the current password.' : 'Minimum 8 characters.'}
          >
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required={!isEdit}
              minLength={8}
              style={inputStyle}
              onFocus={(event) => { event.currentTarget.style.borderColor = 'var(--accent)'; }}
              onBlur={(event) => { event.currentTarget.style.borderColor = 'var(--line)'; }}
            />
          </Field>

          {isEdit && (
            <Field label="Status">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink)' }}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                />
                Active user
              </label>
            </Field>
          )}

          {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--expense)' }}>{error}</p>}

          <button
            type="submit"
            disabled={saving}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 18,
              padding: '14px 16px',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              color: '#fff',
              fontFamily: 'inherit',
              fontSize: 14.5,
              fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              boxShadow: '0 10px 20px -10px var(--accent)',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add user'}
          </button>
        </div>
      </form>
    </PageContainer>
  );
}
