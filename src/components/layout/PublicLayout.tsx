import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { Camera, Users, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import logo from '@/assets/boomer-off-vintage-logo.png';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';

const tabs = [
  { to: '/u', label: '拍一拍', Icon: Camera, exact: true },
  { to: '/u/community', label: '中古圈', Icon: Users },
  { to: '/u/about', label: '关于', Icon: Info },
];

/** 顾客版极简布局：编辑式头图 + 主体 + 底部 3 tab。完全不暴露店员/管理入口。 */
export function PublicLayout() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-gradient-surface flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl safe-top">
        <div className="container flex h-14 items-center gap-3">
          <Link id="onboard-logo" to="/u" className="flex items-center min-w-0 group">
            <div className="min-w-0 leading-tight">
              <div className="font-display text-[15px] tracking-tight truncate">
                中古识物
              </div>
              <div className="text-[10px] text-muted-foreground tracking-[0.18em] uppercase">
                Tap · Discover
              </div>
            </div>
          </Link>
          <Link to="/u" className="ml-auto shrink-0" aria-label="中古识物">
            <img
              src={logo}
              alt="中古识物"
              draggable={false}
              className="h-9 w-auto object-contain"
            />
          </Link>
        </div>
      </header>

      <main className="flex-1 pb-20">
        <ErrorBoundary scope="page">
          <Outlet />
        </ErrorBoundary>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/40 bg-background/85 backdrop-blur-xl safe-bottom"
        aria-label="底部导航"
      >
        <div className="mx-auto max-w-screen-md px-3">
          <ul className="flex items-stretch justify-around h-14">
            {tabs.map(({ to, label, Icon, exact }) => {
              const active = exact
                ? location.pathname === to
                : location.pathname === to || location.pathname.startsWith(to + '/');
              return (
                <li key={to} className="flex-1" id={to === '/u/community' ? 'onboard-community-tab' : undefined}>
                  <NavLink
                    to={to}
                    end={exact}
                    className={cn(
                      'relative flex flex-col items-center justify-center gap-0.5 h-full transition-all',
                      active ? 'text-foreground' : 'text-muted-foreground/70 hover:text-foreground'
                    )}
                  >
                    {active && (
                      <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-gradient-accent" />
                    )}
                    <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2 : 1.6} />
                    <span className={cn('text-[11px]', active ? 'font-semibold' : 'font-medium')}>
                      {label}
                    </span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </div>
  );
}
