import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Flame, BookOpen, MessagesSquare, Sparkles,
  Camera, Star, Image as ImageIcon, TrendingUp, ChevronRight, Check,
  ClipboardList, Users as UsersIcon, AlertCircle, ChevronDown,
  LayoutDashboard, Megaphone, BellDot, Coffee,
} from 'lucide-react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useNotifications, type NotificationItem } from '@/hooks/useNotifications';
import { formatShiftTime, weekdayLabel, todayISO } from '@/lib/scheduleUtils';
import { quoteOfDay, dashboardAutoOpenKey } from '@/lib/dailyQuote';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const POS_KEY = 'dashboard_capsule_pos_v2';
const AUTO_OPEN_KEY = 'dashboard_last_auto_open';
const BTN = 48;          // 圆形按钮直径
const EDGE = 10;         // 离屏边距
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

function greet(): string {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function getCapsuleX(side: Side): number {
  if (typeof window === 'undefined') return 0;
  return side === 'left' ? EDGE : window.innerWidth - BTN - EDGE;
}

export function FloatingDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);   // 全屏 DOM 是否挂载(等关闭动画)
  const [closing, setClosing] = useState(false);   // 是否正在播放关闭动画
  const [pos, setPos] = useState<Pos>(() => (typeof window !== 'undefined' ? loadPos() : { side: 'right', y: 0 }));
  const [dragXY, setDragXY] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; oy: number; moved: boolean } | null>(null);
  const [showLabel, setShowLabel] = useState(true);
  const data = useDashboardData(!!user);
  const notif = useNotifications();

  // 标签气泡 3 秒后渐隐
  useEffect(() => {
    if (!showLabel) return;
    const t = setTimeout(() => setShowLabel(false), 3500);
    return () => clearTimeout(t);
  }, [showLabel]);

  // 视口变化重新 clamp
  useEffect(() => {
    const onResize = () => setPos(p => ({ ...p, y: clampY(p.y) }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 每日自动打开一次
  useEffect(() => {
    if (!user) return;
    const today = dashboardAutoOpenKey();
    const last = localStorage.getItem(AUTO_OPEN_KEY);
    if (last !== today) {
      const t = setTimeout(() => {
        openDashboard();
        localStorage.setItem(AUTO_OPEN_KEY, today);
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

  /* ---------- 拖拽 ---------- */
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
  const onPointerUp = (e: React.PointerEvent) => {
    const moved = dragRef.current?.moved;
    dragRef.current = null;
    if (!moved) {
      setDragXY(null);
      openDashboard();
      return;
    }
    // 吸附到最近边
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
  const hasUnread = notif.unreadCount > 0
    || (!data.checkedToday)
    || (data.todos.pendingShares + data.todos.pendingCorrections > 0);

  return (
    <>
      {/* 圆形按钮 + 文字气泡 */}
      <div
        className={cn(
          'fixed z-50 flex items-center select-none touch-none transition-all',
          dragging ? 'duration-0' : 'duration-300 ease-out',
          pos.side === 'right' && !dragging ? 'flex-row-reverse' : 'flex-row',
          // 隐藏浮标:抽屉打开时;关闭动画期间也隐藏避免视觉重影
          (open || closing) && 'opacity-0 pointer-events-none'
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
            dragging && 'opacity-90 scale-105'
          )}
          style={{ width: BTN, height: BTN }}
        >
          <LayoutDashboard className="w-5 h-5" />
          {todayCode && (
            <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-card border border-border text-[9px] font-bold text-foreground flex items-center justify-center">
              {todayCode}
            </span>
          )}
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-destructive ring-2 ring-background" />
          )}
        </button>

        {showLabel && !dragging && (
          <div
            className={cn(
              'mx-1.5 px-2.5 py-1 rounded-full bg-card/95 backdrop-blur border border-border/60 shadow-md text-xs font-semibold text-foreground whitespace-nowrap pointer-events-none animate-label-bubble-in'
            )}
          >
            仪表盘
          </div>
        )}
      </div>

      {/* 全屏抽屉 */}
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
          navigate={navigate}
        />,
        document.body
      )}
    </>
  );
}

/* ===================== 全屏抽屉 ===================== */

function DashboardFullscreen({
  open, closing, originX, originY, onAnimEnd, onClose, data, notif, navigate,
}: {
  open: boolean;
  closing: boolean;
  originX: number;
  originY: number;
  onAnimEnd: () => void;
  onClose: () => void;
  data: ReturnType<typeof useDashboardData>;
  notif: ReturnType<typeof useNotifications>;
  navigate: (p: string) => void;
}) {
  const today = todayISO();
  const todayLabel = `${today.slice(5).replace('-', '/')} ${weekdayLabel(today)}`;
  const quote = useMemo(() => quoteOfDay(), []);

  const go = (path: string) => {
    onClose();
    setTimeout(() => navigate(path), 240);
  };

  return (
    <div
      onAnimationEnd={onAnimEnd}
      className={cn(
        'fixed inset-0 z-[60] bg-background flex flex-col will-change-transform',
        open ? 'animate-dashboard-zoom-in' : 'animate-dashboard-zoom-out'
      )}
      style={{
        transformOrigin: `${originX}px ${originY}px`,
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      {/* 顶栏 */}
      <div className="px-5 pt-5 pb-2 shrink-0">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-bold tracking-tight leading-none">仪表盘</h2>
          <p className="text-xs text-muted-foreground">
            {todayLabel} · {greet()},{data.profile?.display_name || '店员'}
          </p>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-28 space-y-4">
        {/* 打气标语 Hero */}
        <div className="relative rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/15 px-6 py-7 overflow-hidden animate-fade-in">
          <Sparkles className="absolute top-4 right-4 w-5 h-5 text-primary/60" />
          <p className="text-xl font-bold leading-snug text-foreground pr-8">
            {quote}
          </p>
        </div>

        {/* 排班 Hero 卡 */}
        <ShiftHeroCard data={data} navigate={go} />

        <NotificationCard items={notif.items} unread={notif.unreadCount} onRead={notif.markRead} onReadAll={notif.markAllRead} />
        <TodayOpsCard data={data} />
        <LearningCard learning={data.learning} navigate={go} />
        <TodoActivityCard data={data} navigate={go} />
      </div>

      {/* 底部 收起按钮 */}
      <div
        className="absolute left-0 right-0 bottom-0 bg-gradient-to-t from-background via-background/95 to-background/0 pt-6 pb-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
      >
        <Button
          variant="secondary"
          onClick={onClose}
          className="mx-auto flex h-11 px-6 rounded-full shadow-md"
        >
          <ChevronDown className="w-4 h-4 mr-1.5" />
          收起仪表盘
        </Button>
      </div>
    </div>
  );
}

/* ===================== 卡片们 ===================== */

function NotificationCard({
  items, unread, onRead, onReadAll, todayShift,
}: {
  items: NotificationItem[];
  unread: number;
  onRead: (id: string) => void;
  onReadAll: () => void;
  todayShift: ReturnType<typeof useDashboardData>['todayShift'];
}) {
  return (
    <Card className="p-4 border-border/60 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
            {unread > 0 ? <BellDot className="w-4 h-4 text-primary" /> : <Megaphone className="w-4 h-4 text-primary" />}
          </div>
          <span className="text-sm font-semibold">系统通知</span>
          {unread > 0 && <Badge variant="destructive" className="text-[10px] h-5">{unread} 条未读</Badge>}
        </div>
        {unread > 0 && (
          <button onClick={onReadAll} className="text-[11px] text-muted-foreground hover:text-foreground">全部已读</button>
        )}
      </div>

      {/* 今日班次提醒(简洁) */}
      <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40">
        <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {todayShift ? (
          <p className="text-xs">
            <span className="text-muted-foreground">今日班次 · </span>
            <span className="font-semibold">{todayShift.name}</span>
            <span className="ml-2 text-muted-foreground tabular-nums">{formatShiftTime(todayShift.start_time, todayShift.end_time)}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">今日休息 · 好好放松一天 🌿</p>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">暂无系统通知</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {items.slice(0, 5).map(n => (
            <button
              key={n.id}
              onClick={() => !n.read && onRead(n.id)}
              className={cn(
                'w-full text-left p-2.5 rounded-lg border transition-colors',
                n.read ? 'border-border/40 bg-background' : 'border-primary/30 bg-primary/5 hover:bg-primary/10'
              )}
            >
              <div className="flex items-start gap-2">
                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm', !n.read && 'font-semibold')}>{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function TodayOpsCard({ data }: { data: ReturnType<typeof useDashboardData> }) {
  const [submitting, setSubmitting] = useState(false);
  const handleCheckIn = async () => {
    if (data.checkedToday || submitting) return;
    setSubmitting(true);
    const { data: r, error } = await supabase.rpc('perform_check_in');
    setSubmitting(false);
    if (error) { toast.error('签到失败'); return; }
    const result = r as any;
    if (!result?.already) {
      const bonus = result?.bonus ? `(连签 +${result.bonus})` : '';
      toast.success(`签到 +${result?.exp_gained} 经验${bonus}`);
    }
    data.refresh();
  };

  const max = Math.max(1, ...data.stats.weeklySpark);
  const trend = data.stats.prevWeekScans > 0
    ? Math.round(((data.stats.weekScans - data.stats.prevWeekScans) / data.stats.prevWeekScans) * 100)
    : (data.stats.weekScans > 0 ? 100 : 0);

  return (
    <Card className="p-4 border-border/60 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-amber-500/10 flex items-center justify-center">
            <Flame className="w-4 h-4 text-amber-600" />
          </div>
          <span className="text-sm font-semibold">今日运营</span>
        </div>
        <Badge variant={trend >= 0 ? 'default' : 'secondary'} className="text-[10px]">
          本周 {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </Badge>
      </div>

      {/* 一键打卡 */}
      {!data.checkedToday ? (
        <Button onClick={handleCheckIn} disabled={submitting} className="w-full h-10 mb-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white border-none shadow-md hover:opacity-90">
          <Flame className="w-4 h-4 mr-2" />
          {submitting ? '签到中…' : `一键打卡 ${data.currentStreak > 0 ? `· 连签 ${data.currentStreak} 天` : ''}`}
        </Button>
      ) : (
        <div className="flex items-center justify-center gap-2 h-10 mb-3 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
          <Check className="w-4 h-4" /> 今日已打卡 · 连签 {data.currentStreak} 天
        </div>
      )}

      {/* 数据 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center py-1.5 rounded-md bg-muted/40">
          <Camera className="w-3.5 h-3.5 mx-auto mb-0.5 text-primary" />
          <p className="text-base font-bold tabular-nums leading-tight">{data.stats.weekScans}</p>
          <p className="text-[10px] text-muted-foreground">本周识物</p>
        </div>
        <div className="text-center py-1.5 rounded-md bg-muted/40">
          <Star className="w-3.5 h-3.5 mx-auto mb-0.5 text-yellow-500" />
          <p className="text-base font-bold tabular-nums leading-tight">{data.stats.weekFavs}</p>
          <p className="text-[10px] text-muted-foreground">本周收藏</p>
        </div>
        <div className="text-center py-1.5 rounded-md bg-muted/40">
          <ImageIcon className="w-3.5 h-3.5 mx-auto mb-0.5 text-accent" />
          <p className="text-base font-bold tabular-nums leading-tight">{data.stats.weekPosts}</p>
          <p className="text-[10px] text-muted-foreground">本周发布</p>
        </div>
      </div>

      {/* Sparkline */}
      <div>
        <div className="flex items-end justify-between gap-1 h-10">
          {data.stats.weeklySpark.map((v, i) => (
            <div key={i} className="flex-1 flex items-end h-full">
              <div
                className="w-full rounded-sm bg-gradient-to-t from-primary/40 to-primary"
                style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 4 : 2, opacity: v > 0 ? 1 : 0.25 }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>7 天前</span><span>今天</span>
        </div>
      </div>
    </Card>
  );
}

function LearningCard({
  learning, navigate,
}: { learning: ReturnType<typeof useDashboardData>['learning']; navigate: (p: string) => void }) {
  const items = [
    learning.sop && { key: 'sop', icon: BookOpen, label: '今日 SOP', title: learning.sop.title, body: learning.sop.body, path: '/me/sop', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
    learning.qa && { key: 'qa', icon: MessagesSquare, label: '顾客 Q&A', title: learning.qa.title, body: learning.qa.body, path: '/me/qa', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
    learning.daily && {
      key: 'daily', icon: Sparkles, label: '中古小知识',
      title: typeof learning.daily.content === 'object' ? (learning.daily.content?.title || '今日小知识') : '今日小知识',
      body: typeof learning.daily.content === 'object' ? (learning.daily.content?.summary || learning.daily.content?.body || '') : String(learning.daily.content || ''),
      path: '/library', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10',
    },
  ].filter(Boolean) as Array<{ key: string; icon: any; label: string; title: string; body: string; path: string; color: string; bg: string }>;

  if (items.length === 0) return null;

  return (
    <Card className="p-4 border-border/60 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-md bg-purple-500/10 flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        </div>
        <span className="text-sm font-semibold">今日学习</span>
      </div>
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
        {items.map(it => {
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              onClick={() => navigate(it.path)}
              className="snap-start shrink-0 w-[80%] text-left p-3 rounded-xl border border-border/50 hover:border-border bg-card hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className={cn('w-6 h-6 rounded-md flex items-center justify-center', it.bg)}>
                  <Icon className={cn('w-3.5 h-3.5', it.color)} />
                </div>
                <span className="text-[11px] text-muted-foreground">{it.label}</span>
              </div>
              <p className="text-sm font-semibold line-clamp-1">{it.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{it.body}</p>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function TodoActivityCard({
  data, navigate,
}: { data: ReturnType<typeof useDashboardData>; navigate: (p: string) => void }) {
  const todoCount = data.todos.pendingShares + data.todos.pendingCorrections + data.todos.pendingUsers;

  // 管理员:有待办优先显示待办
  if (todoCount > 0) {
    return (
      <Card className="p-4 border-border/60 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-destructive/10 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-destructive" />
            </div>
            <span className="text-sm font-semibold">待办事项</span>
          </div>
          <Badge variant="destructive" className="text-[10px]">{todoCount}</Badge>
        </div>
        <div className="space-y-1.5">
          {data.todos.pendingShares > 0 && (
            <button onClick={() => navigate('/portal')} className="w-full flex items-center gap-2 text-left text-sm py-2 px-2 rounded-md hover:bg-muted/50 transition-colors">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              <span className="flex-1">待审分享</span>
              <span className="font-semibold tabular-nums">{data.todos.pendingShares}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </Card>
    );
  }

  // 店员:同事最新动态
  if (data.social.posts.length === 0) return null;
  return (
    <Card className="p-4 border-border/60 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <UsersIcon className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-sm font-semibold">同事最新动态</span>
        </div>
        <button onClick={() => navigate('/community')} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center">
          查看全部 <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <div className="space-y-2">
        {data.social.posts.map(p => (
          <button
            key={p.id}
            onClick={() => navigate('/community')}
            className="w-full flex items-center gap-3 text-left hover:bg-muted/40 -mx-1 px-1 py-1.5 rounded-md transition-colors"
          >
            {(p.thumbnail_url || p.image_url) && (
              <img
                src={p.thumbnail_url || p.image_url || ''}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-12 h-12 rounded-md object-cover shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium line-clamp-1">{p.name}</p>
              <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{p.display_name || '同事'} 分享</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </Card>
  );
}

/* TrendingUp re-export to avoid unused import lint */
export const _hint = TrendingUp;
