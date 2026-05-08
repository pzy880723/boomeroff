import { lazy, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';

// 把首屏不一定需要的重型模块拆出来：未登录用户只下载 AuthPage，已登录才下载 LiveStreamPanel（含相机/识别）
const AuthPage = lazy(() =>
  import('@/components/auth/AuthPage').then((m) => ({ default: m.AuthPage }))
);
const LiveStreamPanel = lazy(() =>
  import('@/components/dashboard/LiveStreamPanel').then((m) => ({ default: m.LiveStreamPanel }))
);

function CenterSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function Scan() {
  const { user, loading } = useAuth();

  if (loading) return <CenterSpinner />;

  if (!user) {
    return (
      <Suspense fallback={<CenterSpinner />}>
        <AuthPage />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col">
      <PageHeader title="AI 识物" />
      <Suspense fallback={<CenterSpinner />}>
        <LiveStreamPanel />
      </Suspense>
    </div>
  );
}
