import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  LayoutDashboard, ChevronDown, BarChart3, ListChecks, Bell, CalendarDays,
} from 'lucide-react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useNotifications } from '@/hooks/useNotifications';
import { useTasks } from '@/hooks/useTasks';
import { ProfileHeaderCard } from './ProfileHeaderCard';
import { TodayPanel } from './TodayPanel';
import { TasksPanel } from './TasksPanel';
import { MessagesPanel } from './MessagesPanel';
import { SchedulePanel } from './SchedulePanel';
import { cn } from '@/lib/utils';

const POS_KEY = 'dashboard_capsule_pos_v2';
const AUTO_OPEN_KEY = 'dashboard_auto_opened_session';
const TAB_KEY = 'dashboard_active_tab_v1';
const BTN = 48;
const EDGE = 10;
const BOTTOM_TAB = 64;
type Side = 'left' | 'right';
interface Pos { side: Side; y: number }

function clampY(y: number): number {
  if (typeof window === 'undefined') return y;
  const vh = window.innerHeight;
  const minY = EDGE + 56;
  const maxY = Math.max(minY, vh - BTN - BOTTOM_TAB - EDGE);
  return Math.min(Math.max(y, minY), maxY);
}

function defaultPos(): Pos {
  if (typeof window === 'undefined') return { side: 'right', y: 200 };
  return { side: 'right', y: clampY(window.innerHeight - BTN - BOTTOM_TAB - EDGE - 32) };
}

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if ((p?.side === 'left' || p?.side === 'right') && typeof p?.y === 'number') {
        return { side: p.side, y: clampY(p.y) };
      }
    }
  } catch {}
  return defaultPos();
}

function getCapsuleX(side: Side): number {
  if (typeof window === 'undefined') return 0;
  return side === 'left' ? EDGE : window.innerWidth - BTN - EDGE;
}

export function FloatingDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [pos, setPos] = useState<Pos>(() => (typeof window !== 'undefined' ? loadPos() : { side: 'right', y: 0 }));
  const [dragXY, setDragXY] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; oy: number; moved: boolean } | null>(null);
  const [showLabel, setShowLabel] = useState(true);
  const data = useDashboardData(!!user);
  const notif = useNotifications();
  const tasks = useTasks();

  useEffect(() => {
    if (!showLabel) return;
    const t = setTimeout(() => setShowLabel(false), 3500);
    return () => clearTimeout(t);
  }, [showLabel]);

  useEffect(() => {
    const onResize = () => setPos(p => ({ ...p, y: clampY(p.y) }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!user) return;
    try { localStorage.removeItem('dashboard_last_auto_open'); } catch {}
    const opened = sessionStorage.getItem(AUTO_OPEN_KEY);
    if (!opened) {
      const t = setTimeout(() => {
        openDashboard();
        sessionStorage.setItem(AUTO_OPEN_KEY, '1');
      }, 700);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const openDashboard = () => {
    setMounted(true);
    setClosing(false);
    requestAnimationFrame(() => setOpen(true));
  };

  const closeDashboard = () => {
    setClosing(true);
    setOpen(false);
  };

  const onAnimEnd = () => {
    if (closing) {
      setMounted(false);
      setClosing(false);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const x = getCapsuleX(pos.side);
    dragRef.current = { startX: e.clientX, startY: e.clientY, oy: pos.y, moved: false };
    setDragXY({ x, y: pos.y });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) dragRef.current.moved = true;
    setDragXY({
      x: Math.max(EDGE, Math.min(window.innerWidth - BTN - EDGE, e.clientX - BTN / 2)),
      y: clampY(dragRef.current.oy + dy),
    });
  };
  const onPointerUp = () => {
    const moved = dragRef.current?.moved;
    dragRef.current = null;
    if (!moved) {
      setDragXY(null);
      openDashboard();
      return;
    }
    const cx = (dragXY?.x ?? getCapsuleX(pos.side)) + BTN / 2;
    const side: Side = cx < window.innerWidth / 2 ? 'left' : 'right';
    const y = clampY(dragXY?.y ?? pos.y);
    const next = { side, y };
    setPos(next);
    setDragXY(null);
    try { localStorage.setItem(POS_KEY, JSON.stringify(next)); } catch {}
  };

  if (!user) return null;

  const dragging = !!dragRef.current || !!dragXY;
  const capsuleX = dragging && dragXY ? dragXY.x : getCapsuleX(pos.side);
  const capsuleY = dragging && dragXY ? dragXY.y : pos.y;
  const todayCode = data.todayShift?.code;
  const claimableCount = tasks.totalUnclaimedCount;
  const hasClaimable = claimableCount > 0;
  const hasOtherUnread = notif.unreadCount > 0;

  return (
    <>
      <div
        className={cn(
          'fixed z-50 flex items-center select-none touch-none transition-all',
          dragging ? 'duration-0' : 'duration-300 ease-out',
          pos.side === 'right' && !dragging ? 'flex-row-reverse' : 'flex-row',
          (open || closing) && 'opacity-0 pointer-events-none',
        )}
        style={{ left: capsuleX, top: capsuleY }}
      >
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label="打开仪表盘"
          className={cn(
            'relative flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-elegant border border-primary/30 active:scale-95 transition-transform',
            dragging && 'opacity-95 scale-105',
          )}
          style={{ width: BTN, height: BTN }}
        >
          <LayoutDashboard className="w-5 h-5" />
          {todayCode && (
            <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-card border border-border text-[9px] font-bold text-foreground flex items-center justify-center">
              {todayCode}
            </span>
          )}
          {hasClaimable ? (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 border-2 border-background text-[10px] font-bold text-white flex items-center justify-center shadow-sm animate-badge-pop">
              {claimableCount > 9 ? '9+' : claimableCount}
            </span>
          ) : hasOtherUnread ? (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-destructive ring-2 ring-background" />
          ) : null}
        </button>

        {showLabel && !dragging && (
          <div className="mx-1.5 px-2.5 py-1 rounded-full bg-card/95 backdrop-blur border border-border/60 shadow-md text-xs font-semibold text-foreground whitespace-nowrap pointer-events-none animate-label-bubble-in">
            仪表盘
          </div>
        )}
      </div>

      {mounted && createPortal(
        <DashboardFullscreen
          open={open}
          closing={closing}
          originX={getCapsuleX(pos.side) + BTN / 2}
          originY={pos.y + BTN / 2}
          onAnimEnd={onAnimEnd}
          onClose={closeDashboard}
          data={data}
          notif={notif}
          tasks={tasks}
          navigate={navigate}
        />,
        document.body,
      )}
    </>
  );
}

function DashboardFullscreen({
  open, closing, originX, originY, onAnimEnd, onClose, data, notif, tasks, navigate,
}: {
  open: boolean;
  closing: boolean;
  originX: number;
  originY: number;
  onAnimEnd: () => void;
  onClose: () => void;
  data: ReturnType<typeof useDashboardData>;
  notif: ReturnType<typeof useNotifications>;
  tasks: ReturnType<typeof useTasks>;
  navigate: (p: string) => void;
}) {
  const [tab, setTab] = useState<string>(() => {
    try { return localStorage.getItem(TAB_KEY) || 'today'; } catch { return 'today'; }
  });
  const setTabPersist = (v: string) => {
    setTab(v);
    try { localStorage.setItem(TAB_KEY, v); } catch {}
  };

  const go = (path: string) => {
    onClose();
    setTimeout(() => navigate(path), 240);
  };

  // 自动跳到有待领奖励的 tab
  useEffect(() => {
    if (open && tasks.totalUnclaimedCount > 0 && tab === 'today') {
      // 仅首次打开提示，不强制
    }
  }, [open]);

  const tabBadge = (n: number) =>
    n > 0 ? (
      <span className="ml-1 min-w-[16px] h-[16px] px-1 rounded-full bg-amber-500 text-[9px] font-bold text-white inline-flex items-center justify-center tabular-nums">
        {n > 9 ? '9+' : n}
      </span>
    ) : null;

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
      {/* 顶部个人信息 */}
      <div className="relative shrink-0">
        <ProfileHeaderCard data={data} />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTabPersist} className="flex-1 flex flex-col min-h-0 relative">
        <div className="px-4 shrink-0">
          <TabsList className="w-full bg-white/5 border border-white/8 rounded-xl p-1 h-auto">
            <TabsTrigger
              value="today"
              className="flex-1 rounded-lg text-[12px] data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/55 gap-1 py-1.5"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              今日
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="flex-1 rounded-lg text-[12px] data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/55 gap-1 py-1.5"
            >
              <ListChecks className="w-3.5 h-3.5" />
              任务{tabBadge(tasks.totalUnclaimedCount)}
            </TabsTrigger>
            <TabsTrigger
              value="messages"
              className="flex-1 rounded-lg text-[12px] data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/55 gap-1 py-1.5"
            >
              <Bell className="w-3.5 h-3.5" />
              消息{tabBadge(notif.unreadCount)}
            </TabsTrigger>
            <TabsTrigger
              value="schedule"
              className="flex-1 rounded-lg text-[12px] data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/55 gap-1 py-1.5"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              排班
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="relative flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-28">
          <TabsContent value="today" className="m-0 outline-none">
            <TodayPanel data={data} />
          </TabsContent>
          <TabsContent value="tasks" className="m-0 outline-none">
            <TasksPanel tasks={tasks} onClaimed={() => data.refresh()} onNavigate={go} />
          </TabsContent>
          <TabsContent value="messages" className="m-0 outline-none">
            <MessagesPanel
              items={notif.items}
              unread={notif.unreadCount}
              onRead={notif.markRead}
              onReadAll={notif.markAllRead}
              learning={data.learning}
              navigate={go}
            />
          </TabsContent>
          <TabsContent value="schedule" className="m-0 outline-none">
            <SchedulePanel data={data} navigate={go} />
          </TabsContent>
        </div>
      </Tabs>

      {/* 收起 */}
      <div
        className="absolute left-0 right-0 bottom-0 bg-gradient-to-t from-[#0f1320] via-[#0f1320]/95 to-transparent pt-6 pb-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
      >
        <Button
          variant="ghost"
          onClick={onClose}
          className="mx-auto flex h-10 px-5 rounded-full bg-white/8 hover:bg-white/12 text-white/85 text-xs"
        >
          <ChevronDown className="w-4 h-4 mr-1.5" />
          收起仪表盘
        </Button>
      </div>
    </div>
  );
}
