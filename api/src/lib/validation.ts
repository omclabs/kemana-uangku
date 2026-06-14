import { z } from 'zod';

export const categoryCreate = z.object({
  name: z.string().min(1),
  type: z.enum(['income', 'expense']),
  parent_id: z.string().uuid().optional(),
  budget_monthly: z.number().nonnegative().optional(),
});

export const categoryUpdate = categoryCreate.partial().extend({
  is_active: z.boolean().optional(),
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

export const userCreate = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
});

export const userUpdate = userCreate.partial().extend({
  is_active: z.boolean().optional(),
});

export const authLogin = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type CategoryCreate = z.infer<typeof categoryCreate>;
export type CategoryUpdate = z.infer<typeof categoryUpdate>;
export type AccountCreate = z.infer<typeof accountCreate>;
export type AccountUpdate = z.infer<typeof accountUpdate>;
export type ConfigUpdate = z.infer<typeof configUpdate>;
export type UserCreate = z.infer<typeof userCreate>;
export type UserUpdate = z.infer<typeof userUpdate>;
export type AuthLogin = z.infer<typeof authLogin>;
