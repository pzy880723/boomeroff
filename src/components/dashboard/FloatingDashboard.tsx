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
import { useTasks } from '@/hooks/useTasks';
import { TaskCenterCard } from './TaskCenterCard';
import { formatShiftTime, weekdayLabel, todayISO } from '@/lib/scheduleUtils';
import { quoteOfDay, dashboardAutoOpenKey } from '@/lib/dailyQuote';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import logo from '@/assets/boomer-off-vintage-logo.png';
import { LevelProgressCard } from './LevelProgressCard';

const POS_KEY = 'dashboard_capsule_pos_v2';
const AUTO_OPEN_KEY = 'dashboard_auto_opened_session';
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
  const tasks = useTasks();

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

  // 每次新登录会话自动打开一次
  useEffect(() => {
    if (!user) return;
    // 清理旧的 localStorage 残留 key
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
  const claimableCount = tasks.totalUnclaimedCount;
  const hasClaimable = claimableCount > 0;
  const hasOtherUnread = notif.unreadCount > 0;

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
          {hasClaimable ? (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 border-2 border-background text-[10px] font-bold text-white flex items-center justify-center shadow-sm animate-pulse">
              {claimableCount > 9 ? '9+' : claimableCount}
            </span>
          ) : hasOtherUnread ? (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-destructive ring-2 ring-background" />
          ) : null}
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
        'fixed inset-0 z-[60] bg-gradient-surface flex flex-col will-change-transform overflow-hidden',
        open ? 'animate-dashboard-zoom-in' : 'animate-dashboard-zoom-out'
      )}
      style={{
        transformOrigin: `${originX}px ${originY}px`,
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      {/* 装饰光晕 */}
      <div className="absolute inset-0 pointer-events-none opacity-40 [background:radial-gradient(circle_at_20%_10%,hsl(var(--accent)/0.15),transparent_40%),radial-gradient(circle_at_80%_90%,hsl(var(--primary)/0.12),transparent_40%)]" />

      {/* 顶栏 */}
      <div className="relative px-5 pt-5 pb-2 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <img src={logo} alt="BOOMER-OFF" className="h-9 w-auto object-contain drop-shadow-sm" />
          <p className="text-[11px] text-muted-foreground text-right leading-tight">
            {todayLabel}<br />
            {greet()}，{data.profile?.display_name || '店员'}
          </p>
        </div>
      </div>

      {/* 内容区 */}
      <div className="relative flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-28 space-y-4">
        {/* 打气标语 Hero */}
        <div className="relative rounded-2xl bg-gradient-to-br from-accent/15 via-primary/8 to-transparent border border-primary/15 px-6 py-6 overflow-hidden animate-fade-in">
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] font-semibold tracking-[0.2em] text-primary/80">今日标语</span>
          </div>
          <p className="text-xl font-bold leading-snug text-foreground">
            {quote}
          </p>
        </div>

        {/* 排班 Hero 卡 */}
        <ShiftHeroCard data={data} navigate={go} />

        <LevelProgressCard data={data} navigate={go} />

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
  items, unread, onRead, onReadAll,
}: {
  items: NotificationItem[];
  unread: number;
  onRead: (id: string) => void;
  onReadAll: () => void;
}) {
  return (
    <Card className="p-4 border-border/50 shadow-sm rounded-2xl">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {unread > 0 ? <BellDot className="w-4 h-4 text-primary" /> : <Megaphone className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm font-semibold">系统通知</span>
          {unread > 0 && <span className="text-[11px] text-primary font-medium">{unread} 未读</span>}
        </div>
        {unread > 0 && (
          <button onClick={onReadAll} className="text-[11px] text-muted-foreground hover:text-foreground">全部已读</button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">暂无系统通知</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {items.slice(0, 5).map(n => (
            <button
              key={n.id}
              onClick={() => !n.read && onRead(n.id)}
              className={cn(
                'w-full text-left p-2.5 rounded-lg transition-colors flex gap-3',
                n.read ? 'bg-transparent hover:bg-muted/40' : 'bg-primary/[0.04] hover:bg-primary/[0.08]'
              )}
            >
              <div className={cn('w-0.5 rounded-full shrink-0', n.read ? 'bg-transparent' : 'bg-primary')} />
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm', !n.read && 'font-semibold')}>{n.title}</p>
                {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">{n.body}</p>}
                <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function ShiftHeroCard({ data, navigate }: { data: ReturnType<typeof useDashboardData>; navigate: (p: string) => void }) {
  const shift = data.todayShift;
  const peers = data.colleaguesToday || [];
  const tomorrow = data.weekShifts?.[1]?.shift ?? null;
  const hasTomorrowData = (data.weekShifts?.length ?? 0) >= 2;

  return (
    <Card
      onClick={() => navigate('/me')}
      className="border-border/50 shadow-sm rounded-2xl cursor-pointer hover:border-border transition-colors overflow-hidden"
    >
      {/* 今日 */}
      <div className="p-4 flex items-center gap-4">
        {shift ? (
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-md shrink-0"
            style={{ backgroundColor: shift.color || 'hsl(var(--primary))' }}
          >
            {shift.code}
          </div>
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center shrink-0">
            <Coffee className="w-7 h-7 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold tracking-[0.2em] text-primary/80 mb-1">今日</div>
          {shift ? (
            <>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-base font-semibold leading-tight">{shift.name}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {formatShiftTime(shift.start_time, shift.end_time)}
                </span>
              </div>
              {peers.length > 0 ? (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex -space-x-2">
                    {peers.slice(0, 4).map(c => (
                      <Avatar key={c.user_id} className="w-6 h-6 border-2 border-background">
                        <AvatarImage src={c.avatar_url || undefined} />
                        <AvatarFallback className="text-[9px] bg-muted">{(c.display_name || '同')[0]}</AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{peers.length} 位同事在岗</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1.5">今日独自当班</p>
              )}
            </>
          ) : (
            <>
              <p className="text-base font-bold">今日休息</p>
              <p className="text-xs text-muted-foreground mt-0.5">好好放松一天 🌿</p>
            </>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>

      {/* 明日 */}
      <div className="border-t border-border/50 px-4 py-3 flex items-center gap-3 bg-muted/20">
        <div className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground shrink-0 w-8">明日</div>
        {tomorrow ? (
          <>
            <span
              className="px-1.5 py-0.5 rounded text-[11px] text-white font-medium shrink-0"
              style={{ background: tomorrow.color || 'hsl(var(--primary))' }}
            >
              {tomorrow.code}
            </span>
            <span className="text-sm font-medium truncate">{tomorrow.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums ml-auto shrink-0">
              {formatShiftTime(tomorrow.start_time, tomorrow.end_time)}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            {hasTomorrowData ? '明日休息 🌿' : '明日待排'}
          </span>
        )}
      </div>
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
    <Card className="p-4 border-border/50 shadow-sm rounded-2xl">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">今日运营</span>
        </div>
        <span className={cn('text-xs font-medium tabular-nums', trend >= 0 ? 'text-primary' : 'text-muted-foreground')}>
          本周 {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </span>
      </div>

      {/* 一键打卡 */}
      {!data.checkedToday ? (
        <Button
          onClick={handleCheckIn}
          disabled={submitting}
          className="w-full h-12 mb-4 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-semibold"
        >
          <Flame className="w-4 h-4 mr-2" />
          {submitting ? '签到中…' : `一键打卡 ${data.currentStreak > 0 ? `· 连签 ${data.currentStreak} 天` : ''}`}
        </Button>
      ) : (
        <div className="flex items-center justify-center gap-2 h-12 mb-4 rounded-xl bg-muted/60 text-foreground text-sm font-medium">
          <Check className="w-4 h-4 text-primary" /> 今日已打卡 · 连签 {data.currentStreak} 天
        </div>
      )}

      {/* 数据三联 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className="text-2xl font-bold tabular-nums leading-none">{data.stats.weekScans}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">本周识物</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums leading-none">{data.stats.weekFavs}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">本周收藏</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums leading-none">{data.stats.weekPosts}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">本周发布</p>
        </div>
      </div>

      {/* Sparkline 线性化 */}
      <div>
        <div className="flex items-end justify-between gap-1.5 h-8">
          {data.stats.weeklySpark.map((v, i) => {
            const isLast = i === data.stats.weeklySpark.length - 1;
            const h = Math.max(2, (v / max) * 100);
            return (
              <div key={i} className="flex-1 flex items-end h-full">
                <div
                  className={cn(
                    'w-full rounded-full',
                    isLast ? 'bg-primary' : 'bg-muted-foreground/25'
                  )}
                  style={{ height: `${h}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
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
    <Card className="p-4 border-border/50 shadow-sm rounded-2xl">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="w-4 h-4 text-muted-foreground" />
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
      <Card className="p-4 border-border/50 shadow-sm rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
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
    <Card className="p-4 border-border/50 shadow-sm rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <UsersIcon className="w-4 h-4 text-muted-foreground" />
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
