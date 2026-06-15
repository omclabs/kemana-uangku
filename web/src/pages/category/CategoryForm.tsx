import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';
import { CATEGORY_TYPES, type Category, type CategoryInput, type CategoryType } from '../../lib/types';
import PageContainer from '../../components/PageContainer';
import { CheckIcon, XMarkIcon } from '../../components/icons';

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
    return <p className="p-4 text-center text-gray-500">Loading...</p>;
  }

  const topLevelCategories = categories.filter(
    (c) => c.parent_id === null && c.id !== id && c.is_active === 1
  );
  const parentOptions = topLevelCategories.filter((c) => c.type === type);
  const children = categories.filter((c) => c.parent_id === id);
  const hasActiveChildren = children.some((c) => c.is_active === 1);

  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">
        {isEdit ? 'Edit Category' : 'Add Category'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="type">
            Type
          </label>
          <select
            id="type"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base disabled:bg-gray-100 disabled:text-gray-500"
            value={type}
            onChange={(e) => setType(e.target.value as CategoryType)}
            disabled={Boolean(parentId)}
          >
            {CATEGORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
          {parentId && (
            <p className="mt-1 text-xs text-gray-500">Matches parent category&apos;s type.</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="parent">
            Parent category (optional)
          </label>
          <select
            id="parent"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">None (top-level)</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {isEdit && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
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
              <p className="mt-1 text-xs text-gray-500">
                Cannot change: category has active sub-categories.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            aria-label={saving ? 'Saving...' : 'Save'}
            className="flex flex-1 items-center justify-center rounded-md bg-blue-600 px-4 py-3 text-white disabled:opacity-50"
          >
            <CheckIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/categories')}
            aria-label="Cancel"
            className="flex flex-1 items-center justify-center rounded-md border border-gray-300 px-4 py-3 text-gray-700"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </form>

      {isEdit && children.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Sub-categories
          </h2>
          <ul className="space-y-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  to={`/categories/${child.id}/edit`}
                  className="block rounded-lg bg-white p-3 shadow-sm hover:bg-gray-50"
                >
                  <p className="truncate font-medium text-gray-900">{child.name}</p>
                  {child.is_active === 0 && <p className="text-xs text-gray-500">Inactive</p>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageContainer>
  );
}
