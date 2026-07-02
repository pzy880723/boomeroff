import { NavLink, useLocation } from 'react-router-dom';
import { Home, BookOpen, Camera, MessageCircle, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';

type Tab = { to: string; label: string; Icon: typeof Home; primary?: boolean };
const tabs: Tab[] = [
  { to: '/', label: '首页', Icon: Home },
  { to: '/library', label: '知识', Icon: BookOpen },
  { to: '/scan', label: 'AI 识图', Icon: Camera, primary: true },
  { to: '/notifications', label: '消息', Icon: MessageCircle },
  { to: '/me', label: '我的', Icon: User },
];


export function BottomTabBar() {
  const location = useLocation();
  const { unreadCount } = useNotifications();
  return (
    <nav
      className="fixed bottom-2 left-1/2 -translate-x-1/2 z-40 safe-bottom"
      aria-label="底部导航"
    >
      <div className="rounded-full bg-foreground/95 text-background px-2 py-1 border border-foreground/50 backdrop-blur shadow-[0_6px_20px_-8px_rgba(0,0,0,0.35)]">
        <ul className="flex items-center gap-0.5">
          {tabs.map(({ to, label, Icon, primary }) => {
            const active =
              location.pathname === to ||
              (to !== '/' && location.pathname.startsWith(to)) ||
              (to === '/' && location.pathname === '/');
            if (primary) {
              return (
                <li key={to} className="flex flex-col items-center">
                  <NavLink
                    to={to}
                    aria-label={label}
                    className="mx-1.5 -mt-5 flex flex-col items-center justify-center"
                  >
                    <span
                      className={cn(
                        'w-11 h-11 rounded-full flex items-center justify-center border-[3px] border-foreground/95 bg-primary text-primary-foreground shadow-md ring-4 ring-primary/25 transition-transform active:scale-95',
                        active && 'ring-primary/45 scale-105'
                      )}
                    >
                      <Icon className="w-[20px] h-[20px]" strokeWidth={2.4} />
                    </span>
                    <span className="text-[9px] font-medium leading-none mt-0.5 text-background/85 whitespace-nowrap">
                      {label}
                    </span>
                  </NavLink>
                </li>
              );
            }
            const showBadge = to === '/notifications' && unreadCount > 0;
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  aria-label={label}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-full transition-colors min-w-[52px]',
                    active ? 'bg-primary text-primary-foreground' : 'text-background/85 hover:text-background'
                  )}
                >
                  <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.4 : 2} />
                  <span className="text-[10px] font-medium leading-none whitespace-nowrap">{label}</span>
                  {showBadge && (
                    <span className="absolute top-0 right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center border-2 border-foreground/95">
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
