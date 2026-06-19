import { z } from 'zod';

export const categoryCreate = z.object({
  name: z.string().min(1),
  type: z.enum(['income', 'expense']),
  parent_id: z.string().min(1).nullable().optional(),
  budget_monthly: z.number().nonnegative().optional(),
});

export const categoryUpdate = categoryCreate.partial().extend({
  is_active: z.boolean().optional(),
});

export const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const budgetUpsert = z.object({
  items: z.array(
    z.object({
      category_id: z.string().min(1),
      amount: z.number().nonnegative(),
    })
  ),
});

export const accountCreate = z.object({
  name: z.string().min(1),
  type: z.enum([
    'bank',
    'cash',
    'autodebet',
    'credit_card',
    'prepaid',
    'savings',
    'investment',
    'loan',
  ]),
  balance: z.number().optional(),
  parent_id: z.string().min(1).nullable().optional(),
  credit_limit: z.number().nonnegative().nullable().optional(),
  billing_date: z.number().int().min(1).max(28).nullable().optional(),
  include_in_total: z.boolean().optional(),
});

export const accountUpdate = accountCreate.partial().extend({
  is_active: z.boolean().optional(),
});

export const configUpdate = z.object({
  version: z.string().optional(),
  default_timezone: z.string().optional(),
  currency: z.string().optional(),
});

export const configClearData = z.object({
  confirmation: z.literal('CLEAR ALL DATA'),
  current_password: z.string().min(1),
});

export const userCreate = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'user']).optional(),
});

export const userUpdate = userCreate.partial().extend({
  is_active: z.boolean().optional(),
});

export const authLogin = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const changePassword = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

export const transactionCreate = z
  .object({
    date: z.number().int(),
    account_id: z.string().min(1),
    category_id: z.string().min(1).nullable().optional(),
    amount: z.number().refine((value) => value !== 0, { message: 'amount must not be zero' }),
    note: z.string().optional(),
    type: z.enum(['income', 'expense', 'transfer']),
    transfer_to: z.string().min(1).nullable().optional(),
    fee: z.number().nonnegative().nullable().optional(),
    recurring: z
      .object({
        mode: z.enum(['recurring', 'installment']),
        total: z.number().int().min(2).max(60),
      })
      .optional(),
  })
  .refine((data) => data.recurring?.mode !== 'installment' || Math.abs(data.amount) >= data.recurring.total, {
    message: 'amount must be >= installment count',
    path: ['recurring', 'total'],
  });

export const transactionUpdate = z.object({
  date: z.number().int().optional(),
  category_id: z.string().min(1).nullable().optional(),
  amount: z.number().refine((value) => value !== 0, { message: 'amount must not be zero' }).optional(),
  note: z.string().optional(),
  is_active: z.boolean().optional(),
  paid_status: z.enum(['paid', 'settle']).optional(),
});

export const accountPaymentCreate = z.object({
  payment_account_id: z.string().min(1),
  transaction_ids: z.array(z.string().min(1)).min(1),
  anchor_month: monthKey,
});

export const receiptImportWarning = z.object({
  code: z.enum([
    'ocr_unavailable',
    'line_uncertain',
    'no_rows_detected',
    'total_mismatch',
    'missing_total',
    'missing_date',
  ]),
  message: z.string().min(1),
  row_id: z.string().min(1).optional(),
});

export const receiptImportDraftItem = z.object({
  id: z.string().min(1),
  kind: z.enum(['item', 'voucher', 'manual']),
  note: z.string(),
  amount: z.number().refine((value) => value !== 0, { message: 'amount must not be zero' }),
  date: z.number().int(),
  category_id: z.string().min(1).nullable(),
  included: z.boolean(),
  origin: z.enum(['parsed', 'manual']),
  confidence: z.number().min(0).max(1),
  warnings: z.array(receiptImportWarning),
  raw_line: z.string().nullable(),
});

export const receiptImportCommitInput = z.object({
  account_id: z.string().min(1),
  draft_items: z.array(receiptImportDraftItem).min(1),
});

export const receiptImportMerchant = z.enum(['generic', 'superindo']);

export type CategoryCreate = z.infer<typeof categoryCreate>;
export type CategoryUpdate = z.infer<typeof categoryUpdate>;
export type BudgetUpsert = z.infer<typeof budgetUpsert>;
export type AccountCreate = z.infer<typeof accountCreate>;
export type AccountUpdate = z.infer<typeof accountUpdate>;
export type ConfigUpdate = z.infer<typeof configUpdate>;
export type ConfigClearData = z.infer<typeof configClearData>;
export type UserCreate = z.infer<typeof userCreate>;
export type UserUpdate = z.infer<typeof userUpdate>;
export type AuthLogin = z.infer<typeof authLogin>;
export type ChangePassword = z.infer<typeof changePassword>;
export type TransactionCreate = z.infer<typeof transactionCreate>;
export type TransactionUpdate = z.infer<typeof transactionUpdate>;
export type AccountPaymentCreate = z.infer<typeof accountPaymentCreate>;
export type ReceiptImportWarning = z.infer<typeof receiptImportWarning>;
export type ReceiptImportDraftItem = z.infer<typeof receiptImportDraftItem>;
export type ReceiptImportCommitInput = z.infer<typeof receiptImportCommitInput>;
