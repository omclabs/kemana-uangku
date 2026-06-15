import { useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getUser } from '../lib/api';
import { NAV_ITEMS } from '../lib/nav';
import { ArrowRightOnRectangleIcon } from './icons';

export default function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();

  const activeItem = NAV_ITEMS.find((item) => location.pathname.startsWith(item.to));
  const title = activeItem?.label ?? 'kemana uangku';

  function handleLogout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
      <span className="font-semibold text-gray-900">{title}</span>
      <div className="flex items-center gap-3">
        {user && <span className="text-sm text-gray-500">{user.username}</span>}
        <button onClick={handleLogout} aria-label="Logout" className="text-gray-500">
          <ArrowRightOnRectangleIcon className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
