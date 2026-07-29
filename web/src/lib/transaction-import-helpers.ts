import type { Category } from './types';

export function isLeafExpenseCategory(categories: Category[], candidate: Category): boolean {
  if (candidate.type !== 'expense' || candidate.is_active !== 1) return false;
  return !categories.some((category) => category.parent_id === candidate.id && category.is_active === 1);
}

export const byName = <T extends { name: string }>(left: T, right: T) =>
  left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
