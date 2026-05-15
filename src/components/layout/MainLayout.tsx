import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BottomTabBar } from './BottomTabBar';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';

const FloatingDashboard = lazy(() =>
  import('@/components/dashboard/FloatingDashboard').then(m => ({ default: m.FloatingDashboard }))
);
const LevelUpWatcher = lazy(() =>
  import('@/components/system/LevelUpWatcher').then(m => ({ default: m.LevelUpWatcher }))
);

export function MainLayout() {
  return (
    <div className="min-h-screen bg-gradient-surface flex flex-col">
      {/* 店员端覆盖回内部文案,不影响顾客端 /u 的分享预览 */}
      <Helmet>
        <title>门店运营辅助系统 | BOOMER-OFF</title>
        <meta
          name="description"
          content="一站式门店运营辅助平台：AI 秒级识别商品、知识库共享、班次排班与日常运营管理,让店员的每一天都更顺手。"
        />
        <meta property="og:title" content="门店运营辅助系统" />
        <meta
          property="og:description"
          content="AI 识物 · 知识共享 · 排班管理 · 销售辅助,门店日常运营一个工具搞定。"
        />
      </Helmet>
      <main className="flex-1 pb-16">
        <ErrorBoundary scope="page">
          <Outlet />
        </ErrorBoundary>
      </main>
      <BottomTabBar />
      <Suspense fallback={null}>
        <FloatingDashboard />
      </Suspense>
    </div>
  );
}
