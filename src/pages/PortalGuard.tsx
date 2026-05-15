import { ReactNode, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { isPortalUnlocked } from '@/hooks/useAdminPortal';
import { usePermissions } from '@/hooks/usePermissions';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const ANY_PORTAL_PERM = [
  'user.read', 'role.manage',
  'shop.write', 'schedule.write', 'shift.write',
  'shop.kb.write', 'knowledge.official.write',
  'community.moderate', 'correction.review',
  'settings.ai',
] as const;

export function PortalGuard({ children }: { children: ReactNode }) {
  const { can, loading } = usePermissions();

  if (!isPortalUnlocked()) {
    return <Navigate to="/" replace />;
  }
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const hasAny = ANY_PORTAL_PERM.some((p) => can(p));
  if (!hasAny) {
    // 不直接 toast，否则路由跳转后还会再触发；用 useEffect 触发一次
    return <DenyAndRedirect />;
  }
  return <>{children}</>;
}

function DenyAndRedirect() {
  useEffect(() => {
    toast.error('当前账号没有后台权限');
  }, []);
  return <Navigate to="/" replace />;
}
