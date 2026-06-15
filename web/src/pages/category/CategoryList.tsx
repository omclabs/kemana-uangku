import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';
import { CATEGORY_TYPES, type Category } from '../../lib/types';
import PageContainer from '../../components/PageContainer';
import { PencilIcon, PlusIcon } from '../../components/icons';

function formatTypeLabel(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function CategoryList() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    apiFetch<Category[]>('/categories')
      .then((categoryList) => {
        if (cancelled) return;
        setCategories(categoryList);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load categories');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const topLevel = categories.filter((c) => c.parent_id === null);
  const groups = CATEGORY_TYPES.map((type) => ({
    type,
    categories: topLevel.filter((c) => c.type === type),
  })).filter((group) => group.categories.length > 0);

  return (
    <PageContainer>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Categories</h1>
        <Link
          to="/categories/new"
          aria-label="Add category"
          className="rounded-md bg-blue-600 p-2 text-white"
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
      </div>

      {loading && <p className="text-center text-gray-500">Loading...</p>}
      {error && <p className="text-center text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.type}>
              <h2 className="mb-2 border-b border-gray-200 pb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {formatTypeLabel(group.type)}
              </h2>
              <ul className="space-y-2">
                {group.categories.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    subCategories={categories.filter((c) => c.parent_id === category.id)}
                    expanded={expanded.has(category.id)}
                    onToggle={() => toggleExpanded(category.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
          {groups.length === 0 && (
            <p className="text-center text-gray-500">No categories yet.</p>
          )}
        </div>
      )}
    </PageContainer>
  );
}

function CategoryRow({
  category,
  subCategories,
  expanded,
  onToggle,
}: {
  category: Category;
  subCategories: Category[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasChildren = subCategories.length > 0;

  return (
    <li className="rounded-lg bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 p-3">
        <button
          type="button"
          onClick={hasChildren ? onToggle : undefined}
          aria-expanded={hasChildren ? expanded : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium text-gray-900"
        >
          {hasChildren ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}
          <span className="truncate">{category.name}</span>
        </button>
        <Link
          to={`/categories/${category.id}/edit`}
          aria-label="Edit category"
          className="shrink-0 p-1 text-blue-600"
        >
          <PencilIcon className="h-5 w-5" />
        </Link>
      </div>
      {expanded && hasChildren && (
        <ul className="space-y-1 border-t border-gray-100 px-3 py-2 pl-9">
          {subCategories.map((child) => (
            <li key={child.id}>
              <Link
                to={`/categories/${child.id}/edit`}
                className="block rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
