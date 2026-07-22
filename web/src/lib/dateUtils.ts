// Shared calendar/date helpers for transaction and statement views.
// Pulled out of AccountTransactions/AccountPayment/TransactionList, which had
// each grown byte-identical copies of these.

export const DAY_MS = 86_400_000;
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function sameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export function weekStart(date: Date): Date {
  const start = startOfDay(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

export function fmtMD(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

export function fmtMDY(date: Date): string {
  return `${fmtMD(date)}.${String(date.getFullYear()).slice(2)}`;
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function toDatetimePreset(unix: number): string {
  const date = new Date(unix * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dateKey(unix: number): string {
  const date = new Date(unix * 1000);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// Credit-card statement cycles run from (billingDay + 1) of one month to
// billingDay (inclusive) of the next.
export function statementCycleStart(year: number, month: number, billingDay: number): Date {
  return new Date(year, month, billingDay + 1, 0, 0, 0, 0);
}

export function nextStatementCycleStart(start: Date, billingDay: number): Date {
  return new Date(start.getFullYear(), start.getMonth() + 1, billingDay + 1, 0, 0, 0, 0);
}

export function statementCycleEndInclusive(endExclusive: Date): Date {
  return new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate() - 1, 0, 0, 0, 0);
}
