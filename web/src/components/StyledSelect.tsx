import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type StyledSelectOption = {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
};

type StyledSelectProps = {
  value: string;
  options: StyledSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .18s ease' }}
    >
      <path d="M7 10l5 5 5-5" />
    </svg>
  );
}

export default function StyledSelect({
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
}: StyledSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        style={{
          width: '100%',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: '12px 14px',
          paddingRight: 54,
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface) 84%, white), var(--surface))',
          boxShadow: open
            ? '0 0 0 4px color-mix(in srgb, var(--accent) 14%, transparent), inset 0 1px 0 rgba(255,255,255,.55), 0 10px 24px -18px rgba(28,24,45,.35)'
            : 'inset 0 1px 0 rgba(255,255,255,.5), 0 10px 24px -18px rgba(28,24,45,.35)',
          color: selected ? 'var(--ink)' : 'var(--muted)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          fontSize: 15,
          lineHeight: 1.3,
          transition: 'border-color .15s, box-shadow .15s, opacity .15s',
          opacity: disabled ? 0.7 : 1,
          position: 'relative',
        }}
      >
        <span style={{ display: 'block', fontWeight: 600 }}>
          {selected?.label ?? placeholder}
        </span>
        {selected?.hint && (
          <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: 'var(--muted)', fontWeight: 500 }}>
            {selected.hint}
          </span>
        )}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 7,
            right: 8,
            bottom: 7,
            width: 34,
            borderRadius: 10,
            background: 'color-mix(in srgb, var(--accent) 8%, white)',
            border: '1px solid color-mix(in srgb, var(--accent) 12%, var(--line))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
          }}
        >
          <Chevron open={open} />
        </span>
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(100% + 10px)',
            zIndex: 30,
            borderRadius: 22,
            border: '1px solid var(--line)',
            background: 'color-mix(in srgb, var(--surface) 92%, white)',
            boxShadow: '0 24px 44px -24px rgba(16,18,32,.28)',
            padding: 8,
            backdropFilter: 'blur(12px)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={{
                    width: '100%',
                    border: isSelected ? '1px solid color-mix(in srgb, var(--accent) 22%, transparent)' : '1px solid transparent',
                    borderRadius: 16,
                    padding: '11px 12px',
                    background: isSelected
                      ? 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, white), color-mix(in srgb, var(--accent-2) 10%, white))'
                      : 'transparent',
                    color: isSelected ? 'var(--accent)' : 'var(--ink)',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    cursor: option.disabled ? 'not-allowed' : 'pointer',
                    opacity: option.disabled ? 0.5 : 1,
                    transition: 'background .15s, border-color .15s, color .15s',
                  }}
                >
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700 }}>
                    {option.label}
                  </span>
                  {option.hint && (
                    <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: 'var(--muted)', fontWeight: 500 }}>
                      {option.hint}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
