-- Seed default accounts and categories, ported from ExpenseTracker's
-- gas/SetupService.js (_seedAccounts / _seedCategories).
--
-- accounts.type mapping (gas -> schema enum):
--   Bank -> bank, Cash -> cash, Autodebet -> autodebet,
--   Credit Card -> credit_card, Prepaid -> prepaid, Savings -> savings,
--   Investment -> investment, Loan -> loan
--
-- categories.type (income/expense) maps directly, no transform.
-- gas parent_id '' -> SQL NULL.

-- ── accounts (20, all top-level) ───────────────────────────────────────────
INSERT INTO accounts (id, name, type, credit_limit, billing_date) VALUES
  -- Bank
  ('acc-bank-bca',             'Bank BCA',            'bank',        NULL, NULL),
  ('acc-bank-blu',              'Blu BCA',             'bank',        NULL, NULL),
  ('acc-bank-cimb',             'Bank CIMB Niaga',     'bank',        NULL, NULL),
  ('acc-bank-ocbc',             'Bank OCBC NISP',      'bank',        NULL, NULL),
  ('acc-bank-mandiri',          'Bank Mandiri',        'bank',        NULL, NULL),
  ('acc-bank-seabank',          'Seabank',             'bank',        NULL, NULL),
  -- Cash
  ('acc-cash',                  'Cash',                'cash',        NULL, NULL),
  -- Autodebet
  ('acc-autodebet-kendali',     'OCBC Kendali',        'autodebet',   NULL, NULL),
  ('acc-autodebet-360s',        'OCBC 360s',           'autodebet',   NULL, NULL),
  -- Credit Card (credit_limit is a placeholder -- update via PUT /accounts/acc-cc-cimb)
  ('acc-cc-cimb',               'CIMB Niaga Platinum', 'credit_card', 10000000, 19),
  -- Prepaid
  ('acc-ovo',                   'OVO',                 'prepaid',     NULL, NULL),
  ('acc-gopay',                 'GoPay',               'prepaid',     NULL, NULL),
  ('acc-shopeepay',             'ShopeePay',           'prepaid',     NULL, NULL),
  ('acc-emoney',                'e-Money',             'prepaid',     NULL, NULL),
  -- Savings
  ('acc-savings-alena',         'Alena',               'savings',     NULL, NULL),
  ('acc-savings-arvano',        'Arvano',              'savings',     NULL, NULL),
  -- Investment
  ('acc-invest-bpjs-crewdible', 'BPJS Crewdible',      'investment',  NULL, NULL),
  ('acc-invest-bpjs-99',        'BPJS 99.co',          'investment',  NULL, NULL),
  ('acc-invest-rdn',            'RDN',                 'investment',  NULL, NULL),
  -- Loan
  ('acc-loan-kpr-ocbc',         'KPR OCBC',            'loan',        NULL, NULL);

-- ── categories (87: 19 top-level + 68 children) ────────────────────────────
INSERT INTO categories (id, name, type, parent_id) VALUES
  -- Income top-level
  ('cat-inc-transfer-in', 'Transfer In',     'income', NULL),
  ('cat-inc-salary',      'Salary',          'income', NULL),
  ('cat-inc-bonus',       'Bonus',           'income', NULL),
  ('cat-inc-voucher',     'Voucher',         'income', NULL),
  ('cat-inc-refund',      'Refund',          'income', NULL),

  -- Expense top-level
  ('cat-food',        'Food',          'expense', NULL),
  ('cat-apparel',     'Apparel',       'expense', NULL),
  ('cat-babies',      'Babies',        'expense', NULL),
  ('cat-beauty',      'Beauty',        'expense', NULL),
  ('cat-bills',       'Bills',         'expense', NULL),
  ('cat-entertain',   'Entertainment', 'expense', NULL),
  ('cat-edu',         'Education',     'expense', NULL),
  ('cat-gift',        'Gift',          'expense', NULL),
  ('cat-health',      'Health',        'expense', NULL),
  ('cat-household',   'Household',     'expense', NULL),
  ('cat-transport',   'Transport',     'expense', NULL),
  ('cat-admin',       'Admin Fees',    'expense', NULL),
  ('cat-mortgage',    'Mortgage',      'expense', NULL),
  ('cat-transfer',    'Transfer',      'expense', NULL),

  -- Food children
  ('cat-food-breakfast',  'Breakfast',  'expense', 'cat-food'),
  ('cat-food-lunch',      'Lunch',      'expense', 'cat-food'),
  ('cat-food-dinner',     'Dinner',     'expense', 'cat-food'),
  ('cat-food-eatingout',  'Eating Out', 'expense', 'cat-food'),
  ('cat-food-beverages',  'Beverages',  'expense', 'cat-food'),
  ('cat-food-coffee',     'Coffee',     'expense', 'cat-food'),
  ('cat-food-seasoning',  'Seasoning',  'expense', 'cat-food'),
  ('cat-food-vegetables', 'Vegetables', 'expense', 'cat-food'),
  ('cat-food-meats',      'Meats',      'expense', 'cat-food'),
  ('cat-food-fruits',     'Fruits',     'expense', 'cat-food'),
  ('cat-food-grabfood',   'GrabFood',   'expense', 'cat-food'),

  -- Apparel children
  ('cat-apparel-clothing', 'Clothing', 'expense', 'cat-apparel'),
  ('cat-apparel-shoes',    'Shoes',    'expense', 'cat-apparel'),
  ('cat-apparel-laundry',  'Laundry',  'expense', 'cat-apparel'),

  -- Babies children
  ('cat-babies-daily', 'Daily', 'expense', 'cat-babies'),

  -- Beauty children
  ('cat-beauty-cosmetic',    'Cosmetic',    'expense', 'cat-beauty'),
  ('cat-beauty-accessories', 'Accessories', 'expense', 'cat-beauty'),
  ('cat-beauty-hairdo',      'Hairdo',      'expense', 'cat-beauty'),
  ('cat-beauty-skincare',    'Skincare',    'expense', 'cat-beauty'),

  -- Bills children
  ('cat-bills-kpr',       'KPR',       'expense', 'cat-bills'),
  ('cat-bills-indihome',  'IndiHome',  'expense', 'cat-bills'),
  ('cat-bills-telkomsel', 'Telkomsel', 'expense', 'cat-bills'),
  ('cat-bills-ipl',       'IPL',       'expense', 'cat-bills'),
  ('cat-bills-pbb',       'PBB',       'expense', 'cat-bills'),
  ('cat-bills-gcs',       'GCS',       'expense', 'cat-bills'),
  ('cat-bills-netflix',   'Netflix',   'expense', 'cat-bills'),
  ('cat-bills-bitwarden', 'Bitwarden', 'expense', 'cat-bills'),
  ('cat-bills-ai',        'AI',        'expense', 'cat-bills'),

  -- Entertainment children
  ('cat-entertain-books', 'Books', 'expense', 'cat-entertain'),
  ('cat-entertain-movie', 'Movie', 'expense', 'cat-entertain'),
  ('cat-entertain-apps',  'Apps',  'expense', 'cat-entertain'),
  ('cat-entertain-music', 'Music', 'expense', 'cat-entertain'),
  ('cat-entertain-hobby', 'Hobby', 'expense', 'cat-entertain'),

  -- Education children
  ('cat-edu-schooling',       'Schooling',        'expense', 'cat-edu'),
  ('cat-edu-supplies',        'School Supplies',  'expense', 'cat-edu'),
  ('cat-edu-textbook',        'Textbook',         'expense', 'cat-edu'),
  ('cat-edu-tpa',             'TPA',              'expense', 'cat-edu'),
  ('cat-edu-extracurricular', 'Extra Curricular', 'expense', 'cat-edu'),

  -- Health children
  ('cat-health-gym',        'Gym',        'expense', 'cat-health'),
  ('cat-health-hospital',   'Hospital',   'expense', 'cat-health'),
  ('cat-health-supplement', 'Supplement', 'expense', 'cat-health'),
  ('cat-health-medicine',   'Medicine',   'expense', 'cat-health'),
  ('cat-health-therapy',    'Therapy',    'expense', 'cat-health'),

  -- Household children
  ('cat-household-kitchen',     'Kitchen',      'expense', 'cat-household'),
  ('cat-household-toiletries',  'Toiletries',   'expense', 'cat-household'),
  ('cat-household-furniture',   'Furniture',    'expense', 'cat-household'),
  ('cat-household-appliance',   'Appliance',    'expense', 'cat-household'),
  ('cat-household-electricity', 'Electricity',  'expense', 'cat-household'),
  ('cat-household-phonedata',   'Phone & Data', 'expense', 'cat-household'),
  ('cat-household-laundry',     'Laundry',      'expense', 'cat-household'),

  -- Transport children
  ('cat-transport-commuter',    'Commuter',    'expense', 'cat-transport'),
  ('cat-transport-bus',         'Bus',         'expense', 'cat-transport'),
  ('cat-transport-parking',     'Parking',     'expense', 'cat-transport'),
  ('cat-transport-gasoline',    'Gasoline',    'expense', 'cat-transport'),
  ('cat-transport-maintenance', 'Maintenance', 'expense', 'cat-transport'),
  ('cat-transport-toll',        'Toll',        'expense', 'cat-transport'),
  ('cat-transport-delivery',    'Delivery',    'expense', 'cat-transport'),

  -- Admin Fees children (one per bank + prepaid account)
  ('cat-admin-bca',       'Admin Bank BCA',   'expense', 'cat-admin'),
  ('cat-admin-blu',       'Admin Blu BCA',    'expense', 'cat-admin'),
  ('cat-admin-cimb',      'Admin CIMB Niaga', 'expense', 'cat-admin'),
  ('cat-admin-ocbc',      'Admin OCBC NISP',  'expense', 'cat-admin'),
  ('cat-admin-mandiri',   'Admin Mandiri',    'expense', 'cat-admin'),
  ('cat-admin-seabank',   'Admin Seabank',    'expense', 'cat-admin'),
  ('cat-admin-ovo',       'Admin OVO',        'expense', 'cat-admin'),
  ('cat-admin-gopay',     'Admin GoPay',      'expense', 'cat-admin'),
  ('cat-admin-shopeepay', 'Admin ShopeePay',  'expense', 'cat-admin'),
  ('cat-admin-emoney',    'Admin e-Money',    'expense', 'cat-admin'),

  -- Mortgage children
  ('cat-mortgage-interest', 'Interest', 'expense', 'cat-mortgage');
