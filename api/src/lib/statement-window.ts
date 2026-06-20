export function statementCycleStart(year: number, month: number, billingDate: number): Date {
  return new Date(year, month, billingDate + 1, 0, 0, 0, 0);
}

export function nextStatementCycleStart(start: Date, billingDate: number): Date {
  return new Date(start.getFullYear(), start.getMonth() + 1, billingDate + 1, 0, 0, 0, 0);
}

export function statementWindowForOffset(anchorYear: number, anchorMonth: number, billingDate: number, offset: number) {
  const start = statementCycleStart(anchorYear, anchorMonth + offset, billingDate);
  const endExclusive = nextStatementCycleStart(start, billingDate);
  return {
    start: Math.floor(start.getTime() / 1000),
    endExclusive: Math.floor(endExclusive.getTime() / 1000),
  };
}

export function parseAnchorMonth(value: string): { year: number; month: number } {
  const [yearRaw, monthRaw] = value.split('-');
  return { year: Number(yearRaw), month: Number(monthRaw) - 1 };
}
