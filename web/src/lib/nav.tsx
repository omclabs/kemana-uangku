export const NAV_ITEMS = [
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
