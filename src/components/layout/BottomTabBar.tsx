import { NavLink, useLocation } from 'react-router-dom';
import { BookOpen, Star, Camera, Users, User } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = { to: string; label: string; Icon: typeof BookOpen; primary?: boolean };
const tabs: Tab[] = [
  { to: '/library', label: '官方知识', Icon: BookOpen },
  { to: '/my-library', label: '个人知识', Icon: Star },
  { to: '/scan', label: 'AI 识物', Icon: Camera, primary: true },
  { to: '/community', label: '中古圈', Icon: Users },
  { to: '/me', label: '我的', Icon: User },
];

export function BottomTabBar() {
  const location = useLocation();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur safe-bottom"
      aria-label="底部导航"
    >
      <div className="mx-auto max-w-screen-md px-2">
        <ul className="flex items-end justify-around h-12 relative">
          {tabs.map(({ to, label, Icon, primary }) => {
            const active = location.pathname === to || (to === '/scan' && location.pathname === '/');
            if (primary) {
              return (
                <li key={to} className="flex-1 flex justify-center">
                  <NavLink
                    to={to}
                    className="flex flex-col items-center justify-center gap-0.5 h-full pt-0.5 pb-0.5"
                    aria-label={label}
                  >
                    <span
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-colors',
                        active ? 'bg-gradient-primary text-primary-foreground' : 'bg-primary text-primary-foreground'
                      )}
                    >
                      <Icon className="w-4 h-4" strokeWidth={2} />
                    </span>
                    <span className={cn('text-[11px] font-medium', active ? 'text-primary' : 'text-foreground')}>{label}</span>
                  </NavLink>
                </li>
              );
            }
            return (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 h-full pt-0.5 pb-0.5 transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  <Icon className="w-4 h-4" strokeWidth={1.75} />
                  <span className="text-[11px] font-medium">{label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
