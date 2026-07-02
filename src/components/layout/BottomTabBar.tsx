import { NavLink, useLocation } from 'react-router-dom';
import { Home, BookOpen, Camera, Bell, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';

type Tab = { to: string; label: string; Icon: typeof Home; primary?: boolean };
const tabs: Tab[] = [
  { to: '/', label: '仪表盘', Icon: Home },
  { to: '/library', label: '知识库', Icon: BookOpen },
  { to: '/scan', label: 'AI 识物', Icon: Camera, primary: true },
  { to: '/notifications', label: '通知', Icon: Bell },
  { to: '/me', label: '我的', Icon: User },
];

export function BottomTabBar() {
  const location = useLocation();
  const { unreadCount } = useNotifications();
  return (
    <nav
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 safe-bottom"
      aria-label="底部导航"
    >
      <div className="rounded-full bg-foreground text-background shadow-hard px-2.5 py-2 border border-foreground/40 backdrop-blur">
        <ul className="flex items-end gap-1">
          {tabs.map(({ to, label, Icon, primary }) => {
            const active =
              location.pathname === to ||
              (to !== '/' && location.pathname.startsWith(to)) ||
              (to === '/' && location.pathname === '/');
            if (primary) {
              return (
                <li key={to}>
                  <NavLink
                    to={to}
                    aria-label={label}
                    className="mx-1 -mt-8 flex flex-col items-center"
                  >
                    <span
                      className={cn(
                        'w-14 h-14 rounded-full flex items-center justify-center shadow-hard border-4 border-foreground transition-transform active:scale-95 bg-primary text-primary-foreground ring-4 ring-primary/25',
                        active && 'ring-primary/50 scale-105'
                      )}
                    >
                      <Icon className="w-6 h-6" strokeWidth={2.5} />
                    </span>
                    <span className="mt-1 text-[10px] font-bold text-background/90">{label}</span>
                  </NavLink>
                </li>
              );
            }
            const showBadge = to === '/notifications' && unreadCount > 0;
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-full transition-colors min-w-[56px]',
                    active ? 'bg-primary text-primary-foreground shadow-inner' : 'text-background/80 hover:text-background'
                  )}
                >
                  <Icon className="w-4 h-4" strokeWidth={active ? 2.5 : 2} />
                  <span className="text-[10px] font-medium leading-none">{label}</span>
                  {showBadge && (
                    <span className="absolute top-0.5 right-1.5 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center border-2 border-foreground">
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
