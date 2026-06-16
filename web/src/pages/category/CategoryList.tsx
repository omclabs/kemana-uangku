import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';
import { categoryVisual, initial } from '../../lib/categories';
import { CATEGORY_TYPES, type Category } from '../../lib/types';
import PageContainer from '../../components/PageContainer';
import { PlusIcon } from '../../components/icons';

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
        <h1 className="text-xl font-semibold text-ink">Categories</h1>
        <Link
          to="/categories/new"
          aria-label="Add category"
          className="rounded-2xl bg-gradient-to-br from-accent to-accent-2 p-2.5 text-white shadow-[0_8px_16px_-6px_var(--accent)]"
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
      </div>

      {loading && <p className="text-center text-muted">Loading...</p>}
      {error && <p className="text-center text-expense">{error}</p>}

      {!loading && !error && (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.type}>
              <h2 className="mb-2 border-b border-line pb-1 text-sm font-semibold uppercase tracking-wide text-muted">
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
            <p className="text-center text-muted">No categories yet.</p>
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
  const visual = categoryVisual(category.name);

  return (
    <li className="rounded-2xl border border-line bg-surface shadow-[0_4px_16px_-6px_rgba(60,45,110,.12)]">
      <div className="flex items-center justify-between gap-3 p-3">
        <button
          type="button"
          onClick={hasChildren ? onToggle : undefined}
          aria-expanded={hasChildren ? expanded : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px] text-[15px] font-bold"
            style={{ background: visual.soft, color: visual.color }}
          >
            {initial(category.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">{category.name}</span>
            <span className="block text-xs text-muted">
              {hasChildren ? `${subCategories.length} sub-categories` : 'No sub-categories'}
            </span>
          </span>
        </button>
        <Link
          to={`/categories/${category.id}/edit`}
          aria-label="Edit category"
          className="shrink-0 rounded-2xl border border-line px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-surface-2"
        >
          Edit
        </Link>
      </div>
      {expanded && hasChildren && (
        <ul className="space-y-2 border-t border-line px-3 py-3 pl-[70px]">
          {subCategories.map((child) => (
            <li key={child.id}>
              <Link
                to={`/categories/${child.id}/edit`}
                className="block rounded-2xl border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-ink"
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
