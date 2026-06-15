export const ACCOUNT_TYPES = [
  'bank',
  'cash',
  'autodebet',
  'credit_card',
  'prepaid',
  'savings',
  'investment',
  'loan',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  parent_id: string | null;
  credit_limit: number | null;
  billing_date: number | null;
  include_in_total: number;
  is_active: number;
  computed_balance: number;
  created_at: number;
  updated_at: number;
}

export interface AccountInput {
  name: string;
  type: AccountType;
  balance?: number;
  parent_id?: string | null;
  credit_limit?: number | null;
  billing_date?: number | null;
  include_in_total?: boolean;
  is_active?: boolean;
}

export const CATEGORY_TYPES = ['income', 'expense'] as const;

export type CategoryType = (typeof CATEGORY_TYPES)[number];

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  parent_id: string | null;
  budget_monthly: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface CategoryInput {
  name: string;
  type: CategoryType;
  parent_id?: string | null;
  budget_monthly?: number;
  is_active?: boolean;
}

export interface Config {
  id: number;
  version: string;
  default_timezone: string;
  currency: string;
  last_updated: number;
}

export const TRANSACTION_TYPES = ['income', 'expense', 'transfer'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const PAID_STATUSES = ['paid', 'settle'] as const;
export type PaidStatus = (typeof PAID_STATUSES)[number];

export const INSTALLMENT_OPTIONS = [3, 6, 12] as const; // + "custom"

export const RECURRING_MODES = ['recurring', 'installment'] as const;
export type RecurringMode = (typeof RECURRING_MODES)[number];

export interface Transaction {
  id: string;
  date: number;
  account_id: string;
  category_id: string | null;
  amount: number;
  note: string | null;
  type: TransactionType;
  transfer_to: string | null;
  fee: number | null;
  source: 'single' | 'bulk';
  paid_status: PaidStatus;
  recurring_group_id: string | null;
  recurring_mode: RecurringMode | null;
  installment_index: number | null;
  installment_total: number | null;
  parent_transaction_id: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface TransactionInput {
  date: number;
  account_id: string;
  category_id?: string | null;
  amount: number;
  note?: string;
  type: TransactionType;
  transfer_to?: string | null;
  fee?: number | null;
  recurring?: { mode: RecurringMode; total: number };
}
