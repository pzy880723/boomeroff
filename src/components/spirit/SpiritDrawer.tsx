import { lazy, Suspense, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MessageCircle, LayoutDashboard, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SpiritChatPanel } from './SpiritChatPanel';
import { cn } from '@/lib/utils';

const DashboardInner = lazy(() => import('./DashboardInner').then((m) => ({ default: m.DashboardInner })));

const TAB_KEY = 'spirit_drawer_tab_v1';

interface Props {
  open: boolean;
  closing: boolean;
  originX: number;
  originY: number;
  onAnimEnd: () => void;
  onClose: () => void;
}

export function SpiritDrawer({ open, closing, originX, originY, onAnimEnd, onClose }: Props) {
  const [tab, setTab] = useState<'chat' | 'dashboard'>(() => {
    try {
      return (localStorage.getItem(TAB_KEY) as any) || 'chat';
    } catch {
      return 'chat';
    }
  });
  const setTabPersist = (v: string) => {
    setTab(v as 'chat' | 'dashboard');
    try { localStorage.setItem(TAB_KEY, v); } catch {}
  };

  const tabTriggerCls =
    'flex-1 rounded-lg text-[12px] gap-1 py-1.5 ' +
    'text-[hsl(var(--primary-foreground)/0.55)] ' +
    'data-[state=active]:bg-[hsl(var(--accent)/0.18)] data-[state=active]:text-[hsl(var(--primary-foreground))]';

  return (
    <div
      onAnimationEnd={onAnimEnd}
      className={cn(
        'dashboard-deep-surface fixed inset-0 z-[60] flex flex-col will-change-transform overflow-hidden',
        open ? 'animate-dashboard-zoom-in' : 'animate-dashboard-zoom-out',
      )}
      style={{
        transformOrigin: `${originX}px ${originY}px`,
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      {/* Tabs 切换 */}
      <Tabs value={tab} onValueChange={setTabPersist} className="flex-1 flex flex-col min-h-0 relative">
        <div className="px-4 pt-2 shrink-0">
          <TabsList className="w-full bg-[hsl(var(--accent)/0.06)] border border-[hsl(var(--accent)/0.18)] rounded-xl p-1 h-auto">
            <TabsTrigger value="chat" className={tabTriggerCls}>
              <MessageCircle className="w-3.5 h-3.5" />
              对话
            </TabsTrigger>
            <TabsTrigger value="dashboard" className={tabTriggerCls}>
              <LayoutDashboard className="w-3.5 h-3.5" />
              仪表盘
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chat" className="m-0 flex-1 min-h-0 outline-none">
          <SpiritChatPanel />
        </TabsContent>

        <TabsContent value="dashboard" className="m-0 flex-1 min-h-0 outline-none overflow-hidden">
          <Suspense fallback={
            <div className="h-full flex items-center justify-center text-[hsl(var(--primary-foreground)/0.5)] text-xs">
              加载中…
            </div>
          }>
            <DashboardInner onClose={onClose} />
          </Suspense>
        </TabsContent>
      </Tabs>

      {/* 收起按钮 — 只在 dashboard tab 显示;chat tab 输入框就够了 */}
      {tab === 'dashboard' && (
        <div
          className="absolute left-0 right-0 bottom-0 pt-6 pb-2 pointer-events-none"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
            background: 'linear-gradient(to top, hsl(28 18% 16%) 0%, hsl(28 18% 16% / 0.95) 60%, transparent 100%)',
          }}
        >
          <Button
            variant="ghost"
            onClick={onClose}
            className="mx-auto flex h-10 px-5 rounded-full bg-[hsl(var(--accent)/0.1)] hover:bg-[hsl(var(--accent)/0.16)] text-[hsl(var(--primary-foreground)/0.85)] text-xs pointer-events-auto"
          >
            <ChevronDown className="w-4 h-4 mr-1.5" />
            收起
          </Button>
        </div>
      )}

      {/* 右上角关闭按钮（始终可见） */}
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center bg-[hsl(var(--accent)/0.12)] hover:bg-[hsl(var(--accent)/0.22)] text-[hsl(var(--primary-foreground)/0.7)]"
        style={{ top: 'calc(env(safe-area-inset-top) + 8px)' }}
      >
        <ChevronDown className="w-4 h-4" />
      </button>
    </div>
  );
}
