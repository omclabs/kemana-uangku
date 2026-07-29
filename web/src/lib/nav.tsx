import type { Role } from './types';

type NavItem = {
  to: string;
  label: string;
  icon: JSX.Element;
  roles?: Role[];
  desktopOnly?: boolean;
};

const ALL_NAV_ITEMS: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Home',
    icon: (
      <>
        <path d="M3 11l9-7 9 7" />
        <path d="M5 10v9a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-9" />
      </>
    ),
  },
  {
    to: '/transactions',
    label: 'Activity',
    icon: (
      <>
        <path d="M7 16V4m0 0L4 7m3-3 3 3" />
        <path d="M17 8v12m0 0 3-3m-3 3-3-3" />
      </>
    ),
  },
  {
    to: '/accounts',
    label: 'Accounts',
    icon: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="3" />
        <path d="M16 11h3v4h-3a2 2 0 0 1 0-4z" />
      </>
    ),
  },
  {
    to: '/config/categories',
    label: 'Categories',
    icon: (
      <>
        <path d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3zm-2.318 3h.008v.008H7.25V6z" />
      </>
    ),
    roles: ['admin', 'user'],
    desktopOnly: true,
  },
  {
    to: '/config/tracked-items',
    label: 'Tracked',
    icon: (
      <>
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
      </>
    ),
    roles: ['admin', 'user'],
    desktopOnly: true,
  },
  {
    to: '/config',
    label: 'More',
    icon: (
      <>
        <circle cx="6" cy="12" r="1.7" fill="currentColor" />
        <circle cx="12" cy="12" r="1.7" fill="currentColor" />
        <circle cx="18" cy="12" r="1.7" fill="currentColor" />
      </>
    ),
  },
];

export function navItemsForRole(role: Role | undefined, options: { desktopOnly?: boolean } = {}) {
  return ALL_NAV_ITEMS.filter((item) => {
    if (item.roles && !item.roles.includes(role as Role)) return false;
    if (item.desktopOnly && !options.desktopOnly) return false;
    return true;
  });
}
