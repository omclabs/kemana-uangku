function CompactIcon({ size, strokeWidth, d }: { size: number; strokeWidth: number; d: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 18, strokeWidth = 2.2 }: { size?: number; strokeWidth?: number }) {
  return <CompactIcon size={size} strokeWidth={strokeWidth} d="M15 18l-6-6 6-6" />;
}

export function ChevronRightIcon({ size = 18, strokeWidth = 2.2 }: { size?: number; strokeWidth?: number }) {
  return <CompactIcon size={size} strokeWidth={strokeWidth} d="M9 6l6 6-6 6" />;
}

export function TagIcon({ size = 18, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3zm-2.318 3h.008v.008H7.25V6z" />
    </svg>
  );
}

export function WalletIcon({ size = 18, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M16 11h3v4h-3a2 2 0 0 1 0-4z" />
    </svg>
  );
}

export function LockIcon({ size = 18, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
