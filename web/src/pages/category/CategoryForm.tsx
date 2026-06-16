import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StyledSelect from '../../components/StyledSelect';
import { ApiError, apiFetch } from '../../lib/api';
import { categoryVisual, initial } from '../../lib/categories';
import { CATEGORY_TYPES, type Category, type CategoryInput, type CategoryType } from '../../lib/types';
import PageContainer from '../../components/PageContainer';

export default function CategoryForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [type, setType] = useState<CategoryType>('expense');
  const [parentId, setParentId] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const categoryList = await apiFetch<Category[]>('/categories?include_inactive=true');
        if (cancelled) return;
        setCategories(categoryList);

        if (id) {
          const category = await apiFetch<Category>(`/categories/${id}`);
          if (cancelled) return;
          setName(category.name);
          setType(category.type);
          setParentId(category.parent_id ?? '');
          setIsActive(category.is_active === 1);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load category');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const body: CategoryInput = {
      name,
      type,
      parent_id: parentId || null,
      is_active: isActive,
    };

    try {
      if (isEdit) {
        await apiFetch(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/categories', { method: 'POST', body: JSON.stringify(body) });
      }
      navigate('/categories');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save category');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="p-4 text-center text-muted">Loading...</p>;
  }

  const topLevelCategories = categories.filter(
    (c) => c.parent_id === null && c.id !== id && c.is_active === 1
  );
  const parentOptions = topLevelCategories.filter((c) => c.type === type);
  const typeOptions = CATEGORY_TYPES.map((categoryType) => ({
    value: categoryType,
    label: categoryType.charAt(0).toUpperCase() + categoryType.slice(1),
    hint: categoryType === 'income' ? 'Money coming in' : 'Money going out',
  }));
  const parentSelectOptions = [
    { value: '', label: 'None (top-level)', hint: 'Create this as a main category' },
    ...parentOptions.map((category) => ({
      value: category.id,
      label: category.name,
      hint: category.type.charAt(0).toUpperCase() + category.type.slice(1),
    })),
  ];
  const children = categories.filter((c) => c.parent_id === id);
  const hasActiveChildren = children.some((c) => c.is_active === 1);
  const previewVisual = categoryVisual(name || type);

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold text-ink">
        {isEdit ? 'Edit Category' : 'Add Category'}
      </h1>

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[0_4px_16px_-6px_rgba(60,45,110,.12)]">
        <span
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px] text-[15px] font-bold"
          style={{ background: previewVisual.soft, color: previewVisual.color }}
        >
          {initial(name || type)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{name || 'New category'}</p>
          <p className="text-xs capitalize text-muted">{type}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-muted" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            className="w-full rounded-2xl border border-line bg-surface px-3 py-2 text-base text-ink"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-muted" htmlFor="type">
            Type
          </label>
          <StyledSelect
            value={type}
            options={typeOptions}
            disabled={Boolean(parentId)}
            onChange={(nextValue) => setType(nextValue as CategoryType)}
          />
          {parentId && (
            <p className="mt-1 text-xs text-muted">Matches parent category&apos;s type.</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-muted" htmlFor="parent">
            Parent category (optional)
          </label>
          <StyledSelect
            value={parentId}
            options={parentSelectOptions}
            onChange={setParentId}
          />
        </div>

        {isEdit && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-muted">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={isActive}
                disabled={hasActiveChildren}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active
            </label>
            {hasActiveChildren && (
              <p className="mt-1 text-xs text-muted">
                Cannot change: category has active sub-categories.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-expense">{error}</p>}

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-gradient-to-br from-accent to-accent-2 px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_-6px_var(--accent)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add category'}
          </button>
        </div>
      </form>

      {isEdit && children.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Sub-categories
          </h2>
          <ul className="space-y-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  to={`/categories/${child.id}/edit`}
                  className="block rounded-2xl bg-surface p-3 shadow-[0_4px_16px_-6px_rgba(60,45,110,.12)] hover:bg-surface-2"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px] text-[15px] font-bold"
                      style={{
                        background: categoryVisual(child.name).soft,
                        color: categoryVisual(child.name).color,
                      }}
                    >
                      {initial(child.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{child.name}</p>
                      {child.is_active === 0 && <p className="text-xs text-muted">Inactive</p>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageContainer>
  );
}
