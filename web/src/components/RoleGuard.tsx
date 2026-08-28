import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getToken, getUser } from '../lib/api';
import type { Role } from '../lib/types';
import ForbiddenNotice from './ForbiddenNotice';

export default function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: Role[];
  children: ReactNode;
}) {
  const token = getToken();
  const user = getUser();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return <ForbiddenNotice />;
  }

  return <>{children}</>;
}
