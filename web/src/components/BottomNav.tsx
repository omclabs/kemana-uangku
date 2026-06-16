import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '../lib/nav';

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-line bg-surface px-2 pb-[env(safe-area-inset-bottom)] md:hidden">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
              isActive ? 'text-accent' : 'text-muted'
            }`
          }
          style={{ minHeight: '44px' }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-[22px] w-[22px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {item.icon}
          </svg>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
