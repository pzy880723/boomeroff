import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { Camera, Users, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import logo from '@/assets/boomer-off-vintage-logo.png';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';

const tabs = [
  { to: '/u', label: 'AI 识物', Icon: Camera, exact: true },
  { to: '/u/community', label: '中古圈', Icon: Users },
  { to: '/u/about', label: '关于', Icon: Info },
];

/** 游客版极简布局：顶部 logo + 主体 + 底部三 tab */
export function PublicLayout() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-gradient-surface flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur safe-top">
        <div className="container flex h-14 items-center justify-between gap-2">
          <Link to="/u" className="flex items-center gap-2 min-w-0">
            <img src={logo} alt="BOOMER-OFF" className="h-9 w-9 rounded object-contain" />
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">BOOMER-OFF · 识物</div>
              <div className="text-[10px] text-muted-foreground">免登录·拍一拍认中古</div>
            </div>
          </Link>
          <Link
            to="/scan"
            className="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors shrink-0"
          >
            店员入口 →
          </Link>
        </div>
      </header>

      <main className="flex-1 pb-16">
        <ErrorBoundary scope="page">
          <Outlet />
        </ErrorBoundary>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur safe-bottom"
        aria-label="游客底部导航"
      >
        <div className="mx-auto max-w-screen-md px-2">
          <ul className="flex items-end justify-around h-12">
            {tabs.map(({ to, label, Icon, exact }) => {
              const active = exact
                ? location.pathname === to
                : location.pathname === to || location.pathname.startsWith(to + '/');
              return (
                <li key={to} className="flex-1">
                  <NavLink
                    to={to}
                    end={exact}
                    className={cn(
                      'flex flex-col items-center justify-center gap-0.5 h-full pt-0.5 pb-0.5 transition-colors',
                      active ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    <Icon className="w-5 h-5" strokeWidth={active ? 2.25 : 1.75} />
                    <span className="text-[11px] font-medium">{label}</span>
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
