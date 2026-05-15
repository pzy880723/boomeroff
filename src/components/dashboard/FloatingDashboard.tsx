import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Calendar, Flame, Crown, BookOpen, MessagesSquare, Sparkles,
  Camera, Star, Image as ImageIcon, TrendingUp, ChevronRight, Check,
  ClipboardList, Users as UsersIcon, AlertCircle, X,
} from 'lucide-react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { getLevelInfo } from '@/lib/level';
import { formatShiftTime, shortDateLabel, weekdayLabel, todayISO, addDaysISO } from '@/lib/scheduleUtils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const POS_KEY = 'dashboard_capsule_pos_v1';
const CAPSULE_W = 96;
const CAPSULE_H = 44;
const EDGE = 12;
const BOTTOM_TAB = 64;

interface Pos { x: number; y: number }

function clampPos(x: number, y: number): Pos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minX = EDGE;
  const maxX = Math.max(EDGE, vw - CAPSULE_W - EDGE);
  const minY = EDGE + 8;
  const maxY = Math.max(EDGE, vh - CAPSULE_H - BOTTOM_TAB - EDGE);
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

function defaultPos(): Pos {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  return clampPos(window.innerWidth - CAPSULE_W - EDGE, window.innerHeight - CAPSULE_H - BOTTOM_TAB - EDGE - 8);
}

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.x === 'number' && typeof p?.y === 'number') return clampPos(p.x, p.y);
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

function shiftBg(code?: string | null): string {
  if (!code) return 'from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900';
  const c = code.toUpperCase();
  if (c.startsWith('A')) return 'from-amber-200 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/30';
  if (c.startsWith('B')) return 'from-emerald-200 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/30';
  if (c.startsWith('C')) return 'from-indigo-200 to-blue-100 dark:from-indigo-900/40 dark:to-blue-900/30';
  return 'from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900';
}

export function FloatingDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>(() => (typeof window !== 'undefined' ? loadPos() : { x: 0, y: 0 }));
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const data = useDashboardData(!!user);

  // Reposition on viewport change
  useEffect(() => {
    const onResize = () => setPos(p => clampPos(p.x, p.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragRef.current.moved = true;
    setPos(clampPos(dragRef.current.ox + dx, dragRef.current.oy + dy));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const moved = dragRef.current?.moved;
    dragRef.current = null;
    setDragging(false);
    if (!moved) {
      setOpen(true);
    } else {
      try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch {}
    }
  };

  if (!user) return null;

  const code = data.todayShift?.code ?? '休';
  const todoCount = data.todos.pendingShares + data.todos.pendingCorrections + data.todos.pendingUsers;
  const hasUnread = !data.checkedToday || todoCount > 0;

  return (
    <>
      {/* Capsule */}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          'fixed z-50 flex items-center gap-1.5 pl-1 pr-2.5 rounded-full bg-card/95 backdrop-blur border border-border shadow-elegant select-none touch-none transition-opacity',
          dragging && 'opacity-80'
        )}
        style={{ left: pos.x, top: pos.y, width: CAPSULE_W, height: CAPSULE_H }}
        aria-label="打开仪表盘"
      >
        <span className="relative shrink-0">
          <Avatar className="w-9 h-9 border border-border/60">
            <AvatarImage src={data.profile?.avatar_url || undefined} />
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {data.profile?.display_name?.charAt(0) || '我'}
            </AvatarFallback>
          </Avatar>
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-destructive ring-2 ring-card" />
          )}
        </span>
        <span
          className="text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded text-white shrink-0"
          style={{ background: data.todayShift?.color || (data.todayShift ? '#f59e0b' : 'hsl(var(--muted-foreground) / 0.7)') }}
        >
          {code}
        </span>
      </button>

      {/* Drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="h-[88vh] p-0 rounded-t-2xl border-t-2 overflow-hidden flex flex-col"
        >
          <DashboardContent data={data} onClose={() => setOpen(false)} navigate={navigate} />
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ---------------- Drawer body ---------------- */

function DashboardContent({ data, onClose, navigate }: { data: ReturnType<typeof useDashboardData>; onClose: () => void; navigate: (p: string) => void }) {
  const lvl = useMemo(() => getLevelInfo(data.totalExp), [data.totalExp]);
  const heroBg = shiftBg(data.todayShift?.code);
  const today = todayISO();
  const todayLabel = `${today.slice(5).replace('-', '/')} ${weekdayLabel(today)}`;

  const go = (path: string) => { onClose(); setTimeout(() => navigate(path), 80); };

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      {/* Hero greeting */}
      <div className={cn('relative px-4 pt-5 pb-6 bg-gradient-to-br', heroBg)}>
        <button
          aria-label="关闭"
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-background/60 backdrop-blur flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <Avatar className="w-12 h-12 border-2 border-white/70">
            <AvatarImage src={data.profile?.avatar_url || undefined} />
            <AvatarFallback>{data.profile?.display_name?.charAt(0) || '我'}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-foreground/90">
              {greet()}，{data.profile?.display_name || '店员'}
            </p>
            <p className="text-xs text-foreground/70 mt-0.5">{todayLabel} · 今日加油</p>
          </div>
        </div>
      </div>

      <div className="px-3 py-3 space-y-3 -mt-3">
        {/* Schedule hero */}
        <Card className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => go('/me')}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-semibold">今日排班</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
          {data.todayShift ? (
            <>
              <p className="text-2xl font-bold tracking-tight">
                {data.todayShift.name}
                <span
                  className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded text-white align-middle"
                  style={{ background: data.todayShift.color || '#f59e0b' }}
                >{data.todayShift.code}</span>
              </p>
              <p className="text-sm text-muted-foreground tabular-nums mt-0.5">
                {formatShiftTime(data.todayShift.start_time, data.todayShift.end_time)}
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold tracking-tight text-muted-foreground">今日休息</p>
          )}

          {data.nextShift && (
            <p className="text-xs text-muted-foreground mt-2">
              下一班：{shortDateLabel(data.nextShift.date)} {weekdayLabel(data.nextShift.date)}
              {data.nextShift.shift && ` · ${data.nextShift.shift.name} ${formatShiftTime(data.nextShift.shift.start_time, data.nextShift.shift.end_time)}`}
            </p>
          )}

          {/* Colleagues */}
          {data.colleaguesToday.length > 0 && (
            <div className="flex items-center gap-1 mt-3">
              <span className="text-[11px] text-muted-foreground mr-1">同班：</span>
              <div className="flex -space-x-2">
                {data.colleaguesToday.slice(0, 5).map(c => (
                  <Avatar key={c.user_id} className="w-6 h-6 border-2 border-background">
                    <AvatarImage src={c.avatar_url || undefined} />
                    <AvatarFallback className="text-[10px]">{c.display_name.charAt(0)}</AvatarFallback>
                  </Avatar>
                ))}
              </div>
              {data.colleaguesToday.length > 5 && (
                <span className="text-[11px] text-muted-foreground ml-1">+{data.colleaguesToday.length - 5}</span>
              )}
            </div>
          )}

          {/* 7-day mini bar */}
          <div className="grid grid-cols-7 gap-1 mt-3">
            {data.weekShifts.map((d, i) => (
              <div key={d.date} className="flex flex-col items-center gap-1">
                <div
                  className="w-full h-6 rounded text-[10px] font-medium text-white flex items-center justify-center"
                  style={{ background: d.shift?.color || (d.shift ? '#f59e0b' : 'hsl(var(--muted))'), color: d.shift ? '#fff' : 'hsl(var(--muted-foreground))' }}
                >
                  {d.shift?.code || '休'}
                </div>
                <span className={cn('text-[10px]', i === 0 ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
                  {i === 0 ? '今' : weekdayLabel(d.date).slice(1)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Check-in + Level */}
        <div className="grid grid-cols-2 gap-3">
          <CheckInMini data={data} />
          <LevelMini lvl={lvl} />
        </div>

        {/* Learning carousel */}
        <LearningRow learning={data.learning} navigate={go} />

        {/* Stats */}
        <StatsCard stats={data.stats} />

        {/* Todos / Social */}
        <TodoSocialCard data={data} navigate={go} />
      </div>
    </div>
  );
}

/* ---------------- Sub cards ---------------- */

function CheckInMini({ data }: { data: ReturnType<typeof useDashboardData> }) {
  const [submitting, setSubmitting] = useState(false);
  const handle = async () => {
    if (data.checkedToday || submitting) return;
    setSubmitting(true);
    const { data: r, error } = await supabase.rpc('perform_check_in');
    setSubmitting(false);
    if (error) { toast.error('签到失败'); return; }
    const result = r as any;
    if (!result?.already) {
      const bonus = result?.bonus ? `（连签 +${result.bonus}）` : '';
      toast.success(`签到 +${result?.exp_gained} 经验${bonus}`);
    }
    data.refresh();
  };

  return (
    <Card className="p-3 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200/60 dark:border-amber-900/40">
      <div className="flex items-center gap-2 mb-2">
        <Flame className="w-4 h-4 text-orange-500" />
        <span className="text-xs font-semibold">每日打卡</span>
      </div>
      <p className="text-xl font-bold tabular-nums">
        {data.currentStreak}<span className="text-xs font-normal text-muted-foreground ml-1">天连续</span>
      </p>
      <Button
        size="sm"
        className="w-full mt-2 h-7 text-xs"
        disabled={data.checkedToday || submitting}
        onClick={handle}
      >
        {data.checkedToday ? <><Check className="w-3 h-3 mr-1" />已签到</> : (submitting ? '签到中' : '立即打卡')}
      </Button>
    </Card>
  );
}

function LevelMini({ lvl }: { lvl: ReturnType<typeof getLevelInfo> }) {
  return (
    <Card className="p-3 bg-gradient-primary text-primary-foreground relative overflow-hidden">
      <div className="absolute -right-3 -top-3 opacity-15"><Crown className="w-16 h-16" /></div>
      <div className="flex items-center gap-2 mb-2">
        <Crown className="w-4 h-4" />
        <span className="text-xs font-semibold">Lv.{lvl.level}</span>
      </div>
      <p className="text-sm font-bold truncate">{lvl.title}</p>
      <p className="text-[10px] opacity-90 mt-0.5 tabular-nums">
        {lvl.isMax ? '已达顶峰 🏆' : `距 Lv.${lvl.level + 1} 还差 ${lvl.expForNext - lvl.expIntoLevel}`}
      </p>
      <div className="h-1.5 bg-primary-foreground/20 rounded-full overflow-hidden mt-1.5">
        <div className="h-full bg-primary-foreground transition-all" style={{ width: `${Math.min(lvl.progress * 100, 100)}%` }} />
      </div>
    </Card>
  );
}

function LearningRow({ learning, navigate }: { learning: ReturnType<typeof useDashboardData>['learning']; navigate: (p: string) => void }) {
  const items = [
    learning.sop && { key: 'sop', icon: BookOpen, label: '今日 SOP', title: learning.sop.title, body: learning.sop.body, path: '/me/sop', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    learning.qa && { key: 'qa', icon: MessagesSquare, label: '顾客 Q&A', title: learning.qa.title, body: learning.qa.body, path: '/me/qa', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    learning.daily && {
      key: 'daily', icon: Sparkles, label: '中古小知识',
      title: typeof learning.daily.content === 'object' ? (learning.daily.content?.title || '今日小知识') : '今日小知识',
      body: typeof learning.daily.content === 'object' ? (learning.daily.content?.summary || learning.daily.content?.body || '') : String(learning.daily.content || ''),
      path: '/library', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30',
    },
  ].filter(Boolean) as Array<{ key: string; icon: any; label: string; title: string; body: string; path: string; color: string; bg: string }>;

  if (items.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">📚 今日学习</p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
        {items.map(it => {
          const Icon = it.icon;
          return (
            <Card
              key={it.key}
              onClick={() => navigate(it.path)}
              className="snap-start shrink-0 w-[78%] p-3 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className={cn('w-7 h-7 rounded-md flex items-center justify-center', it.bg)}>
                  <Icon className={cn('w-4 h-4', it.color)} />
                </div>
                <span className="text-[11px] text-muted-foreground">{it.label}</span>
              </div>
              <p className="text-sm font-semibold line-clamp-1">{it.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{it.body}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StatsCard({ stats }: { stats: ReturnType<typeof useDashboardData>['stats'] }) {
  const trend = stats.prevWeekScans > 0
    ? Math.round(((stats.weekScans - stats.prevWeekScans) / stats.prevWeekScans) * 100)
    : (stats.weekScans > 0 ? 100 : 0);
  const max = Math.max(1, ...stats.weeklySpark);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-primary" /> 本周数据</span>
        <Badge variant={trend >= 0 ? 'default' : 'secondary'} className="text-[10px]">
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <Camera className="w-4 h-4 mx-auto mb-1 text-primary" />
          <p className="text-lg font-bold tabular-nums">{stats.weekScans}</p>
          <p className="text-[10px] text-muted-foreground">识图</p>
        </div>
        <div className="text-center">
          <Star className="w-4 h-4 mx-auto mb-1 text-yellow-500" />
          <p className="text-lg font-bold tabular-nums">{stats.weekFavs}</p>
          <p className="text-[10px] text-muted-foreground">收藏</p>
        </div>
        <div className="text-center">
          <ImageIcon className="w-4 h-4 mx-auto mb-1 text-accent" />
          <p className="text-lg font-bold tabular-nums">{stats.weekPosts}</p>
          <p className="text-[10px] text-muted-foreground">发布</p>
        </div>
      </div>
      {/* Sparkline */}
      <div className="flex items-end justify-between gap-1 h-10">
        {stats.weeklySpark.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-sm bg-primary/70"
              style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 4 : 2, opacity: v > 0 ? 1 : 0.2 }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>7天前</span><span>今天</span>
      </div>
    </Card>
  );
}

function TodoSocialCard({ data, navigate }: { data: ReturnType<typeof useDashboardData>; navigate: (p: string) => void }) {
  const todoCount = data.todos.pendingShares + data.todos.pendingCorrections + data.todos.pendingUsers;
  if (todoCount > 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="w-4 h-4 text-destructive" />
          <span className="text-sm font-semibold">待办事项</span>
          <Badge variant="destructive" className="text-[10px] ml-auto">{todoCount}</Badge>
        </div>
        <div className="space-y-2">
          {data.todos.pendingShares > 0 && (
            <button onClick={() => navigate('/portal')} className="w-full flex items-center gap-2 text-left text-sm py-1.5 hover:text-primary transition-colors">
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

  if (data.social.posts.length === 0) return null;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold flex items-center gap-1.5"><UsersIcon className="w-4 h-4 text-primary" /> 同事最新</span>
        <button onClick={() => navigate('/community')} className="text-[11px] text-muted-foreground hover:text-foreground">
          查看全部 <ChevronRight className="w-3 h-3 inline" />
        </button>
      </div>
      <div className="space-y-2">
        {data.social.posts.map(p => (
          <button
            key={p.id}
            onClick={() => navigate('/community')}
            className="w-full flex items-center gap-3 text-left hover:bg-accent/30 -mx-1 px-1 py-1.5 rounded-md transition-colors"
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
