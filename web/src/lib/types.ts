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
export type Role = 'admin' | 'user' | 'reimbursement';

export interface SessionUser {
  id: string;
  username: string;
  role: Role;
  assigned_account_ids: string[];
}

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
  api_build?: {
    version: string;
    commit_sha: string;
    deployed_at: string | null;
  };
}

export interface MonthlyBalance {
  month_start: number;
  month_key: string;
  income: number;
  expense: number;
  balance: number;
  created_at: number;
  updated_at: number;
}

export interface BudgetItem {
  category_id: string;
  name: string;
  parent_id: string | null;
  template_amount: number;
  own_amount: number;
  total_amount: number;
  is_saved: boolean;
  effective_amount: number;
}

export interface BudgetMonth {
  month_key: string;
  month_start: number;
  total_budget: number;
  items: BudgetItem[];
}

export interface CategoryBudgetYearMonth {
  month_key: string;
  amount: number;
  is_saved: boolean;
}

export interface CategoryBudgetYear {
  category_id: string;
  year: string;
  months: CategoryBudgetYearMonth[];
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
  assigned_account_ids: string[];
  is_active: number;
  created_at: number;
  updated_at: number;
  created_by: string | null;
  updated_by: string | null;
  deleted_by: string | null;
  deleted_at: number | null;
}

export interface UserInput {
  username: string;
  email: string;
  role: Role;
  assigned_account_ids?: string[];
  password?: string;
  is_active?: boolean;
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
  merchant: string | null;
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
  payment_transaction_id: string | null;
  tracked_item_id?: string | null;
  refill_quantity?: number | null;
  remaining_qty_before_refill?: number | null;
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
  merchant?: string;
  type: TransactionType;
  transfer_to?: string | null;
  fee?: number | null;
  tracked_item_id?: string | null;
  refill_quantity?: number | null;
  remaining_qty_before_refill?: number | null;
  recurring?: { mode: RecurringMode; total: number };
}

export interface TrackedItem {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  unit: string;
  warning_days: number;
  avg_daily_usage: number | null;
  latest_quantity_added: number | null;
  estimated_run_out_at: number | null;
  next_reminder_at: number | null;
  forecast_ready: number;
  last_forecasted_at: number | null;
  is_active: number;
  created_at: number;
  updated_at: number;
  days_remaining?: number | null;
  alert_active?: boolean;
}

export interface TrackedItemInput {
  name: string;
  category_id: string;
  unit: string;
  warning_days: number;
  is_active?: boolean;
}

export interface TrackedItemRefill {
  id: string;
  tracked_item_id: string;
  transaction_id: string | null;
  date: number;
  quantity_added: number;
  remaining_qty_before_refill: number | null;
  note: string | null;
  created_at: number;
  updated_at: number;
  transaction_amount?: number | null;
  transaction_note?: string | null;
}

export type ReceiptImportDraftKind = 'item' | 'voucher' | 'manual';
export type ReceiptImportDraftOrigin = 'parsed' | 'manual';
export type ReceiptImportWarningCode =
  | 'ocr_unavailable'
  | 'line_uncertain'
  | 'no_rows_detected'
  | 'total_mismatch'
  | 'missing_total'
  | 'missing_date';

export interface ReceiptImportWarning {
  code: ReceiptImportWarningCode;
  message: string;
  row_id?: string;
}

export interface ReceiptImportDraftItem {
  id: string;
  kind: ReceiptImportDraftKind;
  note: string;
  amount: number;
  date: number;
  category_id: string | null;
  included: boolean;
  origin: ReceiptImportDraftOrigin;
  confidence: number;
  warnings: ReceiptImportWarning[];
  raw_line: string | null;
}

export interface ReceiptImportDraft {
  account_id: string;
  receipt_total: number | null;
  included_total: number;
  detected_date: number | null;
  draft_items: ReceiptImportDraftItem[];
  warnings: ReceiptImportWarning[];
  ocr_text: string | null;
}

export interface ReceiptImportCommitInput {
  account_id: string;
  draft_items: ReceiptImportDraftItem[];
}

export type CsvImportWarningCode = 'invalid_csv' | 'line_uncertain' | 'no_rows_detected';

export interface CsvImportWarning {
  code: CsvImportWarningCode;
  message: string;
  row_id?: string;
}

export interface CsvImportDraftItem {
  id: string;
  amount: number;
  description: string;
  merchant: string | null;
  category_id: string | null;
  included: boolean;
  warnings: CsvImportWarning[];
  raw_line: string | null;
}

export interface CsvImportDraft {
  account_id: string;
  date: number;
  file_hash: string;
  file_name: string | null;
  already_imported: boolean;
  included_total: number;
  draft_items: CsvImportDraftItem[];
  warnings: CsvImportWarning[];
}

export interface CsvImportCommitInput {
  account_id: string;
  date: number;
  file_hash: string;
  file_name?: string | null;
  draft_items: CsvImportDraftItem[];
}
