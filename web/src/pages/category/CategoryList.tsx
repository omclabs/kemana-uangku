import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageContainer from '../../components/PageContainer';
import { PlusIcon } from '../../components/icons';
import { ApiError, apiFetch } from '../../lib/api';
import { categoryVisual, initial } from '../../lib/categories';
import { CATEGORY_TYPES, type Category, type CategoryType } from '../../lib/types';

const TYPE_META: Record<CategoryType, { label: string; icon: ReactNode }> = {
  income: {
    label: 'Income',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M12 5l-7 7M12 5l7 7" />
      </svg>
    ),
  },
  expense: {
    label: 'Expense',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M12 19l-7-7M12 19l7-7" />
      </svg>
    ),
  },
};

function Chevron({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default function CategoryList() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<Category[]>('/categories')
      .then((list) => {
        if (!cancelled) setCategories(list);
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

  const visibleCategories = categories.filter(
    (category) => category.id !== 'cat-transfer' && category.id !== 'cat-admin'
  );
  const childrenOf = (parentId: string) => visibleCategories.filter((category) => category.parent_id === parentId);

  const topLevel = visibleCategories.filter((category) => category.parent_id === null);
  const groups = CATEGORY_TYPES
    .map((type) => ({ type, items: topLevel.filter((category) => category.type === type) }))
    .filter((group) => group.items.length > 0);

  return (
    <PageContainer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
          Categories
        </h1>
        <Link
          to="/config/categories/new"
          aria-label="Add category"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 40, height: 40, borderRadius: 13,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            color: '#fff', boxShadow: '0 8px 16px -6px var(--accent)',
          }}
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>Loading…</p>}
      {error && <p style={{ textAlign: 'center', color: 'var(--expense)', padding: '32px 0' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {groups.map(({ type, items }) => {
            const meta = TYPE_META[type];
            return (
              <section key={type}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  marginBottom: 10, color: 'var(--muted)',
                }}>
                  <span style={{ opacity: 0.7 }}>{meta.icon}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  }}>
                    {meta.label}
                  </span>
                  <span style={{
                    marginLeft: 4, fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                    background: 'var(--line)', padding: '1px 7px', borderRadius: 999,
                  }}>
                    {items.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {items.map((category) => {
                    const children = childrenOf(category.id);
                    const hasKids = children.length > 0;
                    const visual = categoryVisual(category.name);

                    return (
                      <div
                        key={category.id}
                        style={{
                          background: 'var(--surface)', border: '1px solid var(--line)',
                          borderRadius: 20, overflow: 'hidden',
                          boxShadow: '0 2px 12px rgba(0,0,0,.04)',
                        }}
                      >
                        <Link
                          to={`/config/categories/${category.id}/edit`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '14px 16px', textDecoration: 'none',
                          }}
                        >
                          <span style={{
                            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                            background: visual.soft, color: visual.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 15, fontWeight: 800,
                          }}>
                            {initial(category.name)}
                          </span>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                              <span style={{
                                fontSize: 15, fontWeight: 700, color: 'var(--ink)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {category.name}
                              </span>
                              {hasKids && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700,
                                  color: 'var(--accent)',
                                  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                                  padding: '2px 7px', borderRadius: 999, flexShrink: 0,
                                }}>
                                  {children.length} sub
                                </span>
                              )}
                            </div>
                            <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--muted)', fontWeight: 500 }}>
                              {hasKids ? 'Parent category' : 'Leaf category'}
                            </p>
                          </div>

                          <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                            <Chevron />
                          </span>
                        </Link>

                        {hasKids && children.map((child, idx) => {
                          const isLast = idx === children.length - 1;
                          return (
                            <Link
                              key={child.id}
                              to={`/config/categories/${child.id}/edit`}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '11px 16px 11px 20px',
                                borderTop: '1px solid var(--line)',
                                textDecoration: 'none',
                                background: 'var(--surface-2)',
                              }}
                            >
                              <div style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', width: 20, flexShrink: 0, alignSelf: 'stretch',
                              }}>
                                <div style={{
                                  width: 1.5, flex: 1,
                                  background: isLast ? 'transparent' : 'var(--line)',
                                }} />
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                  <path d="M2 0 L2 7 L12 7" stroke="var(--line)" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                                {!isLast && <div style={{ width: 1.5, flex: 1, background: 'var(--line)' }} />}
                              </div>

                              <span style={{
                                flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {child.name}
                              </span>

                              <span style={{
                                fontSize: 10, fontWeight: 700, color: 'var(--muted)',
                                background: 'var(--line)', padding: '2px 7px', borderRadius: 999, flexShrink: 0,
                              }}>
                                Child
                              </span>

                              <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                                <Chevron size={14} />
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {groups.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>
              No categories yet.
            </p>
          )}
        </div>
      )}
    </PageContainer>
  );
}
