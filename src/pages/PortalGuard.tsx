import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isPortalUnlocked } from '@/hooks/useAdminPortal';

export function PortalGuard({ children }: { children: ReactNode }) {
  if (!isPortalUnlocked()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
