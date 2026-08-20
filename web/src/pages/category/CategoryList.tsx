import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageContainer from '../../components/PageContainer';
import PageHeader from '../../components/PageHeader';
import { PlusIcon } from '../../components/icons';
import SummaryStrip from '../../components/SummaryStrip';
import { ApiError, apiFetch } from '../../lib/api';
import { categoryVisual, initial } from '../../lib/categories';
import { statFmt } from '../../lib/format';
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
  const navigate = useNavigate();
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

  const byName = (left: Category, right: Category) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  const visibleCategories = categories.filter(
    (category) => category.id !== 'cat-transfer' && category.id !== 'cat-admin'
  );
  const childrenOf = (parentId: string) => visibleCategories.filter((category) => category.parent_id === parentId).sort(byName);

  const topLevel = visibleCategories.filter((category) => category.parent_id === null).sort(byName);
  const groups = CATEGORY_TYPES
    .map((type) => ({ type, items: topLevel.filter((category) => category.type === type).sort(byName) }))
    .filter((group) => group.items.length > 0);
  const incomeCount = visibleCategories.filter((category) => category.type === 'income').length;
  const expenseCount = visibleCategories.filter((category) => category.type === 'expense').length;

  return (
    <PageContainer>
      <PageHeader
        title="Categories"
        backTo="/config"
        actions={(
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
        )}
      />

      {loading && <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>Loading…</p>}
      {error && <p style={{ textAlign: 'center', color: 'var(--expense)', padding: '32px 0' }}>{error}</p>}

      {!loading && !error && (
        <>
          <SummaryStrip
            items={[
              { label: 'Income', value: `${incomeCount} categor${incomeCount === 1 ? 'y' : 'ies'}` },
              { label: 'Expense', value: `${expenseCount} categor${expenseCount === 1 ? 'y' : 'ies'}`, color: 'var(--expense)' },
            ]}
          />

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
                            borderRadius: 16, overflow: 'hidden',
                            boxShadow: '0 2px 12px rgba(0,0,0,.04)',
                          }}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(`/config/categories/${category.id}/edit`)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                navigate(`/config/categories/${category.id}/edit`);
                              }
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 9,
                              padding: '10px 12px', cursor: 'pointer',
                            }}
                          >
                            <span style={{
                              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                              background: visual.soft, color: visual.color,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12.5, fontWeight: 800,
                            }}>
                              {initial(category.name)}
                            </span>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{
                                  fontSize: 13, fontWeight: 700, color: 'var(--ink)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {category.name}
                                </span>
                                {hasKids && (
                                  <span style={{
                                    fontSize: 9, fontWeight: 700,
                                    color: 'var(--accent)',
                                    background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                                    padding: '1px 6px', borderRadius: 999, flexShrink: 0,
                                  }}>
                                    {children.length} sub
                                  </span>
                                )}
                              </div>
                              {category.type === 'expense' && (
                                <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--muted)', fontWeight: 500 }}>
                                  {category.budget_monthly > 0 ? `Budget: Rp ${statFmt(category.budget_monthly)}/mo` : 'No budget set'}
                                </p>
                              )}
                            </div>

                            <Link
                              to={`/config/categories/new?parent_id=${category.id}&type=${category.type}`}
                              aria-label={`Add sub-category under ${category.name}`}
                              onClick={(event) => event.stopPropagation()}
                              style={{
                                width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--accent)',
                                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                                textDecoration: 'none',
                              }}
                            >
                              <PlusIcon className="h-3 w-3" />
                            </Link>

                            <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                              <Chevron size={14} />
                            </span>
                          </div>

                          {hasKids && children.map((child, idx) => {
                            const isLast = idx === children.length - 1;
                            return (
                              <Link
                                key={child.id}
                                to={`/config/categories/${child.id}/edit`}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '8px 12px 8px 16px',
                                  borderTop: '1px solid var(--line)',
                                  textDecoration: 'none',
                                  background: 'var(--surface-2)',
                                }}
                              >
                                <div style={{
                                  display: 'flex', flexDirection: 'column',
                                  alignItems: 'center', width: 16, flexShrink: 0, alignSelf: 'stretch',
                                }}>
                                  <div style={{
                                    width: 1.5, flex: 1,
                                    background: isLast ? 'transparent' : 'var(--line)',
                                  }} />
                                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                                    <path d="M2 0 L2 7 L12 7" stroke="var(--line)" strokeWidth="1.5" strokeLinecap="round" />
                                  </svg>
                                  {!isLast && <div style={{ width: 1.5, flex: 1, background: 'var(--line)' }} />}
                                </div>

                                <span style={{
                                  flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--ink)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {child.name}
                                </span>

                                <span style={{
                                  fontSize: 9, fontWeight: 700, color: 'var(--muted)',
                                  background: 'var(--line)', padding: '1px 6px', borderRadius: 999, flexShrink: 0,
                                }}>
                                  Child
                                </span>

                                <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                                  <Chevron size={12} />
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
          </div>

          {groups.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>
              No categories yet.
            </p>
          )}
        </>
      )}
    </PageContainer>
  );
}
