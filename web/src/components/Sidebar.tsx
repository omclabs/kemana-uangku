import { NavLink } from 'react-router-dom';
import { getUser } from '../lib/api';
import { navItemsForRole } from '../lib/nav';

export default function Sidebar() {
  const items = navItemsForRole(getUser()?.role);

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex items-center px-4 py-3">
        <span className="font-semibold text-ink">kemana uangku</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium ${
                isActive ? 'bg-surface-2 text-accent' : 'text-muted hover:bg-surface-2'
              }`
            }
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
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
    </aside>
  );
}
