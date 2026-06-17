-- Seed default categories only.
-- Fresh installs intentionally start with zero accounts.

INSERT INTO categories (id, name, type, parent_id) VALUES
  -- Income
  ('cat-income-salary',        'Salary',            'income',  NULL),
  ('cat-income-bonus',         'Bonus',             'income',  NULL),
  ('cat-income-freelance',     'Freelance',         'income',  NULL),
  ('cat-income-business',      'Business',          'income',  NULL),
  ('cat-income-investment',    'Investment Income', 'income',  NULL),
  ('cat-income-refund',        'Refund',            'income',  NULL),
  ('cat-income-cashback',      'Cashback',          'income',  NULL),
  ('cat-income-gift',          'Gift Received',     'income',  NULL),
  ('cat-income-asset-sale',    'Asset Sale',        'income',  NULL),
  ('cat-income-other',         'Other Income',      'income',  NULL),

  -- Expense parents
  ('cat-food',                 'Food',              'expense', NULL),
  ('cat-transport',            'Transport',         'expense', NULL),
  ('cat-housing',              'Housing',           'expense', NULL),
  ('cat-personal',             'Personal',          'expense', NULL),
  ('cat-household',            'Household',         'expense', NULL),
  ('cat-health',               'Health',            'expense', NULL),
  ('cat-family',               'Family',            'expense', NULL),
  ('cat-entertainment',        'Entertainment',     'expense', NULL),
  ('cat-finance',              'Finance',           'expense', NULL),
  ('cat-shopping',             'Shopping',          'expense', NULL),
  ('cat-travel',               'Travel',            'expense', NULL),
  ('cat-other',                'Other',             'expense', NULL),

  -- Reserved internal categories
  ('cat-admin',                'Admin Fees',        'expense', NULL),
  ('cat-transfer',             'Transfer',          'expense', NULL),

  -- Food
  ('cat-food-groceries',       'Groceries',         'expense', 'cat-food'),
  ('cat-food-dining',          'Dining Out',        'expense', 'cat-food'),
  ('cat-food-coffee',          'Coffee & Snacks',   'expense', 'cat-food'),

  -- Transport
  ('cat-transport-fuel',       'Fuel',              'expense', 'cat-transport'),
  ('cat-transport-public',     'Public Transit',    'expense', 'cat-transport'),
  ('cat-transport-rides',      'Ride Hailing',      'expense', 'cat-transport'),
  ('cat-transport-parking',    'Parking & Tolls',   'expense', 'cat-transport'),

  -- Housing
  ('cat-housing-rent',         'Rent / Mortgage',   'expense', 'cat-housing'),
  ('cat-housing-utilities',    'Utilities',         'expense', 'cat-housing'),
  ('cat-housing-maintenance',  'Maintenance',       'expense', 'cat-housing'),

  -- Personal
  ('cat-personal-care',        'Personal Care',     'expense', 'cat-personal'),
  ('cat-personal-education',   'Education',         'expense', 'cat-personal'),

  -- Household
  ('cat-household-supplies',   'Home Supplies',     'expense', 'cat-household'),

  -- Health
  ('cat-health-medical',       'Medical',           'expense', 'cat-health'),
  ('cat-health-pharmacy',      'Pharmacy',          'expense', 'cat-health'),
  ('cat-health-fitness',       'Fitness',           'expense', 'cat-health'),

  -- Family
  ('cat-family-children',      'Child Care',        'expense', 'cat-family'),
  ('cat-family-support',       'Family Support',    'expense', 'cat-family'),

  -- Entertainment
  ('cat-entertainment-hobbies','Hobbies',           'expense', 'cat-entertainment'),
  ('cat-entertainment-subs',   'Subscriptions',     'expense', 'cat-entertainment'),

  -- Finance
  ('cat-finance-fees',         'Fees',              'expense', 'cat-finance'),
  ('cat-finance-insurance',    'Insurance',         'expense', 'cat-finance'),
  ('cat-finance-interest',     'Interest',          'expense', 'cat-finance'),

  -- Shopping
  ('cat-shopping-clothing',    'Clothing',          'expense', 'cat-shopping'),
  ('cat-shopping-electronics', 'Electronics',       'expense', 'cat-shopping'),

  -- Travel
  ('cat-travel-transport',     'Travel Transport',  'expense', 'cat-travel'),
  ('cat-travel-stay',          'Accommodation',     'expense', 'cat-travel'),

  -- Other
  ('cat-other-misc',           'Miscellaneous',     'expense', 'cat-other');
