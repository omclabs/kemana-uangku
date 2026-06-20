import { NavLink } from 'react-router-dom';
import { getUser } from '../lib/api';
import { navItemsForRole } from '../lib/nav';

export default function BottomNav() {
  const items = navItemsForRole(getUser()?.role);

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--surface)',
        borderTop: '1px solid var(--line)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -8px 24px rgba(0,0,0,.05)',
      }}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          style={({ isActive }) => ({
            flex: 1,
            display: 'flex',
            flexDirection: 'column' as const,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            padding: '6px 4px 8px',
            minHeight: 56,
            color: isActive ? 'var(--accent)' : 'var(--muted)',
            textDecoration: 'none',
            fontSize: 10,
            fontWeight: isActive ? 700 : 600,
            fontFamily: 'inherit',
            transition: 'color .15s',
          })}
        >
          {({ isActive }) => (
            <>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px 14px',
                  borderRadius: 12,
                  background: isActive
                    ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                    : 'transparent',
                  transition: 'background .15s',
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={isActive ? 2.2 : 1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transition: 'stroke-width .15s' }}
                >
                  {item.icon}
                </svg>
              </span>
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
