import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getToken } from '../lib/api';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AuthGuard({ children }: { children: ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 pb-16 md:pb-0">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
