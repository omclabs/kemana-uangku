export type ReceiptImportDraftKind = 'item' | 'voucher' | 'manual';
export type ReceiptImportDraftOrigin = 'parsed' | 'manual';
type ReceiptImportWarningCode =
  | 'invalid_csv'
  | 'line_uncertain'
  | 'no_rows_detected'
  | 'missing_date';

export type ReceiptImportWarning = {
  code: ReceiptImportWarningCode;
  message: string;
  row_id?: string;
};

export type ReceiptImportDraftItem = {
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
};

export type ReceiptImportDraft = {
  account_id: string;
  receipt_total: number | null;
  included_total: number;
  detected_date: number | null;
  draft_items: ReceiptImportDraftItem[];
  warnings: ReceiptImportWarning[];
  ocr_text: string | null;
};

export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseDate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed / 1000);
}

export function parseAmount(value: string): number | null {
  const normalized = value.trim().replace(/[^\d,.\-]/g, '');
  if (!normalized) return null;

  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  let working = normalized;

  if (lastComma !== -1 && lastDot !== -1) {
    working = lastComma > lastDot ? working.replace(/\./g, '').replace(',', '.') : working.replace(/,/g, '');
  } else if (lastComma !== -1) {
    const decimals = working.length - lastComma - 1;
    working = decimals === 3 ? working.replace(/,/g, '') : working.replace(',', '.');
  } else if (lastDot !== -1) {
    const decimals = working.length - lastDot - 1;
    working = decimals === 3 ? working.replace(/\./g, '') : working;
  }

  const amount = Number(working);
  return Number.isFinite(amount) && amount !== 0 ? amount : null;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return true;
  return !['false', '0', 'no'].includes(value.trim().toLowerCase());
}

export function buildReceiptDraft(accountId: string, csvText: string | null): ReceiptImportDraft {
  const lines = (csvText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const warnings: ReceiptImportWarning[] = [];
  if (lines.length === 0) {
    warnings.push({ code: 'no_rows_detected', message: 'CSV file is empty.' });
    return {
      account_id: accountId,
      receipt_total: null,
      included_total: 0,
      detected_date: null,
      draft_items: [],
      warnings,
      ocr_text: null,
    };
  }

  const header = parseCsvLine(lines[0]).map((value) => value.toLowerCase());
  const noteIndex = header.indexOf('note');
  const amountIndex = header.indexOf('amount');
  const dateIndex = header.indexOf('date');
  const categoryIndex = header.indexOf('category_id');
  const includedIndex = header.indexOf('included');
  const kindIndex = header.indexOf('kind');

  if (noteIndex === -1 || amountIndex === -1 || dateIndex === -1) {
    warnings.push({
      code: 'invalid_csv',
      message: 'CSV must include headers: note, amount, date. Optional: category_id, included, kind.',
    });
    return {
      account_id: accountId,
      receipt_total: null,
      included_total: 0,
      detected_date: null,
      draft_items: [],
      warnings,
      ocr_text: null,
    };
  }

  const items: ReceiptImportDraftItem[] = [];

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const note = values[noteIndex]?.trim() ?? '';
    const amount = parseAmount(values[amountIndex] ?? '');
    const date = parseDate(values[dateIndex] ?? '');
    const category_id = categoryIndex === -1 ? null : values[categoryIndex]?.trim() || null;
    const included = includedIndex === -1 ? true : parseBoolean(values[includedIndex]);
    const kindValue = kindIndex === -1 ? 'item' : (values[kindIndex]?.trim().toLowerCase() || 'item');
    const kind: ReceiptImportDraftKind =
      kindValue === 'voucher' || kindValue === 'manual' ? kindValue : 'item';

    const itemWarnings: ReceiptImportWarning[] = [];
    if (!note) {
      itemWarnings.push({ code: 'line_uncertain', message: 'Missing note in CSV row.' });
    }
    if (amount === null) {
      itemWarnings.push({ code: 'line_uncertain', message: 'Invalid amount in CSV row.' });
    }
    if (date === null) {
      itemWarnings.push({ code: 'missing_date', message: 'Invalid date in CSV row.' });
    }

    items.push({
      id: crypto.randomUUID(),
      kind,
      note,
      amount: amount ?? 0,
      date: date ?? Math.floor(Date.now() / 1000),
      category_id,
      included,
      origin: 'parsed',
      confidence: itemWarnings.length === 0 ? 1 : 0.5,
      warnings: itemWarnings,
      raw_line: line,
    });
  }

  if (items.length === 0) {
    warnings.push({ code: 'no_rows_detected', message: 'CSV contains headers but no data rows.' });
  }

  const firstDate = items.find((item) => item.warnings.every((warning) => warning.code !== 'missing_date'))?.date ?? null;
  const includedTotal = items.filter((item) => item.included).reduce((sum, item) => sum + item.amount, 0);

  return {
    account_id: accountId,
    receipt_total: null,
    included_total: includedTotal,
    detected_date: firstDate,
    draft_items: items,
    warnings,
    ocr_text: null,
  };
}
