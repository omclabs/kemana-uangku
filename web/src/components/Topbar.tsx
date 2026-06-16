import { useLocation } from 'react-router-dom';
import { getUser } from '../lib/api';
import { NAV_ITEMS } from '../lib/nav';
import { useTheme } from '../lib/theme';

export default function Topbar() {
  const location = useLocation();
  const user = getUser();
  const { theme, toggle } = useTheme();

  const activeItem = NAV_ITEMS.find((item) => location.pathname.startsWith(item.to));
  const title = activeItem?.label ?? 'kemana uangku';

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
      <span className="font-bold tracking-tight text-ink">{title}</span>
      <div className="flex items-center gap-2">
        {user && <span className="text-sm text-muted">{user.username}</span>}

        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted transition-colors hover:text-ink"
        >
          {theme === 'dark' ? (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
