import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '../lib/nav';

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 flex border-t border-gray-200 bg-white md:hidden">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
              isActive ? 'text-blue-600' : 'text-gray-500'
            }`
          }
          style={{ minHeight: '44px' }}
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
  );
}
