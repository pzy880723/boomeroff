import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BottomTabBar } from './BottomTabBar';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import { EdgeSwipeBack } from '@/components/system/EdgeSwipeBack';
import { PullToRefresh } from '@/components/system/PullToRefresh';
import { lazyWithRetry as lazy } from '@/lib/lazyWithRetry';
import { NotificationsProvider } from '@/hooks/useNotifications';
import { TasksProvider } from '@/hooks/useTasks';

const FloatingDashboard = lazy(() =>
  import('@/components/dashboard/FloatingDashboard').then(m => ({ default: m.FloatingDashboard }))
);
const LevelUpWatcher = lazy(() =>
  import('@/components/system/LevelUpWatcher').then(m => ({ default: m.LevelUpWatcher }))
);
const PushBootstrap = lazy(() =>
  import('@/components/system/PushBootstrap').then(m => ({ default: m.PushBootstrap }))
);

export function MainLayout() {
  return (
    <NotificationsProvider>
      <TasksProvider>
        <div className="min-h-screen bg-gradient-surface flex flex-col">
          {/* 店员端覆盖回内部文案,不影响顾客端 /u 的分享预览 */}
          <Helmet>
            <title>BOOMER GO · 门店运营系统</title>
            <meta
              name="description"
              content="BOOMER GO 门店运营系统：仪表盘 · AI 识物 · 官方知识库 · 排班打卡 · 通知中心,BOOMER 体系旗下所有门店共用的一站式运营工具。"
            />
            <meta property="og:title" content="BOOMER GO · 门店运营系统" />
            <meta
              property="og:description"
              content="仪表盘 · AI 识物 · 知识共享 · 排班打卡 · 通知中心,门店日常运营一个工具搞定。"
            />
          </Helmet>
          <main className="flex-1 pb-28">
            <ErrorBoundary scope="page">
              <Outlet />
            </ErrorBoundary>
          </main>
          <BottomTabBar />
          <EdgeSwipeBack />
          <PullToRefresh />
          <Suspense fallback={null}>
            <FloatingDashboard />
            <LevelUpWatcher />
            <PushBootstrap />
          </Suspense>
        </div>
      </TasksProvider>
    </NotificationsProvider>
  );
}
