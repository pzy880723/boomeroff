import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Camera, Bell, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';

type Tab = {
  to: string;
  label: string;
  Icon: typeof BookOpen;
  primary?: boolean;
  matchExtra?: string[];
};

const tabs: Tab[] = [
  { to: '/', label: '仪表盘', Icon: LayoutDashboard, matchExtra: ['/home'] },
  { to: '/library', label: '官方知识', Icon: BookOpen },
  { to: '/scan', label: 'AI 识别', Icon: Camera, primary: true },
  { to: '/notifications', label: '通知', Icon: Bell },
  { to: '/me', label: '我的', Icon: User },
];

/**
 * 悬浮黑色胶囊 + 中间朱红凸起按钮。
 * BOOMER GO 底部导航签名 · 5 Tab。
 */
export function BottomTabBar() {
  const location = useLocation();
  const { unreadCount } = useNotifications();

  return (
    <nav
      className="fixed left-0 right-0 z-40 pointer-events-none"
      style={{ bottom: 'max(env(safe-area-inset-bottom), 8px)' }}
      aria-label="底部导航"
    >
      <div className="mx-auto max-w-[420px] px-4 pointer-events-auto">
        <ul className="relative flex items-center justify-between h-14 rounded-[24px] bg-[hsl(0_0%_10%)] px-3 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35)]">
          {tabs.map(({ to, label, Icon, primary, matchExtra }) => {
            const active =
              location.pathname === to ||
              (to === '/' && (location.pathname === '/home' || location.pathname === '')) ||
              (matchExtra?.includes(location.pathname) ?? false);
            const isNotif = to === '/notifications';

            if (primary) {
              return (
                <li key={to} className="flex-1 flex justify-center">
                  <NavLink
                    to={to}
                    aria-label={label}
                    className="relative -mt-8 flex flex-col items-center gap-1"
                  >
                    <span
                      className={cn(
                        'w-14 h-14 rounded-full flex items-center justify-center bg-primary text-primary-foreground border-4 border-[hsl(0_0%_10%)] transition-transform active:scale-95',
                        active && 'shadow-[0_8px_20px_-4px_hsl(355_100%_45%/0.6)]'
                      )}
                    >
                      <Icon className="w-6 h-6" strokeWidth={2.4} />
                    </span>
                    <span className="text-[10px] font-bold text-white/90 tracking-wide">{label}</span>
                  </NavLink>
                </li>
              );
            }
            return (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  aria-label={label}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-0.5 h-full transition-colors',
                    active ? 'text-primary' : 'text-white/60 hover:text-white/90'
                  )}
                >
                  <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.4 : 2} />
                  <span className="text-[10px] font-semibold tracking-wide">{label}</span>
                  {active && (
                    <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                  {isNotif && unreadCount > 0 && (
                    <span className="absolute top-1 right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-primary border-2 border-[hsl(0_0%_10%)] text-[9px] font-bold text-white flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
