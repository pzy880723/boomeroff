import { Outlet } from 'react-router-dom';
import { BottomTabBar } from './BottomTabBar';

export function MainLayout() {
  return (
    <div className="min-h-screen bg-gradient-surface flex flex-col">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}
