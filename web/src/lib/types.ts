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

export interface Config {
  id: number;
  version: string;
  default_timezone: string;
  currency: string;
  last_updated: number;
}
