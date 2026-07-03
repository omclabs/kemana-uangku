type SummaryStripItem = {
  label: string;
  value: string;
  color?: string;
};

export default function SummaryStrip({ items, marginBottom = 24 }: { items: SummaryStripItem[]; marginBottom?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        marginBottom,
        minWidth: 0,
      }}
    >
      {items.map((item, index) => (
        <div
          key={item.label}
          style={{
            padding: '13px 16px',
            borderRight: index < items.length - 1 ? '1px solid var(--line)' : 'none',
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{item.label}</div>
          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              fontWeight: 800,
              color: item.color ?? 'var(--ink)',
              letterSpacing: '-.03em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
