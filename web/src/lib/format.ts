export function statFmt(value: number): string {
  return new Intl.NumberFormat('id-ID').format(Math.round(Math.abs(value)));
}

export function signedFmt(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}Rp ${statFmt(value)}`;
}

export function cellFmt(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2).replace('.', ',')}jt`;
  return statFmt(value);
}

export function trimCompactDecimals(value: number, digits: number): string {
  return value
    .toFixed(digits)
    .replace(/\.?0+$/, '')
    .replace('.', ',');
}

export function truncateNote(note: string | null | undefined, limit = 60): string {
  const firstLine = (note ?? '').split('\n')[0] ?? '';
  return firstLine.length > limit ? `${firstLine.slice(0, limit).trimEnd()}…` : firstLine;
}
