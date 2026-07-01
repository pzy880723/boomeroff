import { Suspense, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { lazyWithRetry as lazy } from '@/lib/lazyWithRetry';

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

  // 认证还在跑时,后台预取相机面板的 chunk,拿到 user 时几乎已就位
  useEffect(() => {
    const idle = (cb: () => void) =>
      (window as any).requestIdleCallback ? (window as any).requestIdleCallback(cb) : setTimeout(cb, 0);
    idle(() => { import('@/components/dashboard/LiveStreamPanel'); });
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col">
        <PageHeader title="AI 识物" />
        <CenterSpinner />
      </div>
    );
  }

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

