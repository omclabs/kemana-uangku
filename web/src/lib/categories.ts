// Deterministic color-coding for categories & accounts.
// The schema has no per-category color, so we hash the name to a warm palette.
// (Want fixed colors for specific categories? Add a name match in `categoryVisual`.)

const PALETTE = [
  { color: '#D97706', soft: 'rgba(245,158,11,.15)' }, // amber
  { color: '#2563EB', soft: 'rgba(59,130,246,.15)' }, // blue
  { color: '#7C3AED', soft: 'rgba(139,92,246,.15)' }, // violet
  { color: '#DB2777', soft: 'rgba(236,72,153,.15)' }, // pink
  { color: '#059669', soft: 'rgba(16,185,129,.15)' }, // emerald
  { color: '#E11D48', soft: 'rgba(244,63,94,.15)' },  // rose
  { color: '#0D9488', soft: 'rgba(20,184,166,.15)' }, // teal
  { color: '#CA8A04', soft: 'rgba(202,138,4,.15)' },  // gold
] as const;

export type Visual = { color: string; soft: string };

export function categoryVisual(name: string | null | undefined): Visual {
  const key = (name ?? '').trim() || 'Uncategorized';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initial(name: string | null | undefined): string {
  return ((name ?? '').trim()[0] || '?').toUpperCase();
}
