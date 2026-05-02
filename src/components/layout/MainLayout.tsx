import { Outlet } from 'react-router-dom';
import { BottomTabBar } from './BottomTabBar';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';

export function MainLayout() {
  return (
    <div className="min-h-screen bg-gradient-surface flex flex-col">
      <main className="flex-1 pb-16">
        <ErrorBoundary scope="page">
          <Outlet />
        </ErrorBoundary>
      </main>
      <BottomTabBar />
    </div>
  );
}
