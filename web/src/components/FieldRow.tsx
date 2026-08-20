import type { ReactNode } from 'react';

export default function FieldRow({
  icon,
  label,
  labelWidth = 72,
  children,
}: {
  icon: ReactNode;
  label: ReactNode;
  labelWidth?: number;
  children: ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 16, padding: '12px 14px',
    }}>
      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', minWidth: labelWidth, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
