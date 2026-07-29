import { parseAmount, parseCsvLine } from './receipt-import';

type CsvImportWarningCode = 'invalid_csv' | 'line_uncertain' | 'no_rows_detected';

export type CsvImportWarning = {
  code: CsvImportWarningCode;
  message: string;
  row_id?: string;
};

export type CsvImportDraftItem = {
  id: string;
  amount: number;
  description: string;
  category_id: string | null;
  included: boolean;
  warnings: CsvImportWarning[];
  raw_line: string | null;
};

export type CsvImportDraft = {
  account_id: string;
  date: number;
  included_total: number;
  draft_items: CsvImportDraftItem[];
  warnings: CsvImportWarning[];
};

export function buildCsvImportDraft(accountId: string, date: number, csvText: string | null): CsvImportDraft {
  const lines = (csvText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const warnings: CsvImportWarning[] = [];
  if (lines.length === 0) {
    warnings.push({ code: 'no_rows_detected', message: 'CSV file is empty.' });
    return {
      account_id: accountId,
      date,
      included_total: 0,
      draft_items: [],
      warnings,
    };
  }

  const header = parseCsvLine(lines[0]).map((value) => value.toLowerCase());
  const amountIndex = header.indexOf('amount');
  const descriptionIndex = header.indexOf('description');

  if (amountIndex === -1 || descriptionIndex === -1) {
    warnings.push({
      code: 'invalid_csv',
      message: 'CSV must include headers: amount, description.',
    });
    return {
      account_id: accountId,
      date,
      included_total: 0,
      draft_items: [],
      warnings,
    };
  }

  const items: CsvImportDraftItem[] = [];

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const amount = parseAmount(values[amountIndex] ?? '');
    const description = values[descriptionIndex]?.trim() ?? '';

    const itemWarnings: CsvImportWarning[] = [];
    if (amount === null) {
      itemWarnings.push({ code: 'line_uncertain', message: 'Invalid amount in CSV row.' });
    }
    if (!description) {
      itemWarnings.push({ code: 'line_uncertain', message: 'Missing description in CSV row.' });
    }

    items.push({
      id: crypto.randomUUID(),
      amount: amount ?? 0,
      description,
      category_id: null,
      included: true,
      warnings: itemWarnings,
      raw_line: line,
    });
  }

  if (items.length === 0) {
    warnings.push({ code: 'no_rows_detected', message: 'CSV contains headers but no data rows.' });
  }

  const includedTotal = items.filter((item) => item.included).reduce((sum, item) => sum + item.amount, 0);

  return {
    account_id: accountId,
    date,
    included_total: includedTotal,
    draft_items: items,
    warnings,
  };
}
