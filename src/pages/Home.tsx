import { Suspense, lazy, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useNotifications } from '@/hooks/useNotifications';
import {
  Camera, BookOpen, Ticket, Megaphone, CalendarDays,
  Bell, ChevronRight, Sparkles, Clapperboard,
} from 'lucide-react';

const CheckInCard = lazy(() =>
  import('@/components/me/CheckInCard').then(m => ({ default: m.CheckInCard }))
);

interface DailyKb { title?: string; body?: string; source?: string }
interface ActiveActivity { id: string; name: string; cover_url: string | null; ends_at: string | null }

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { items: notes, unreadCount } = useNotifications();
  const [kb, setKb] = useState<DailyKb | null>(null);
  const [acts, setActs] = useState<ActiveActivity[]>([]);
  const [nextShift, setNextShift] = useState<{ work_date: string; shift_code: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    void (async () => {
      const [{ data: dk }, { data: ac }, { data: sh }] = await Promise.all([
        supabase.from('daily_knowledge' as any).select('content').eq('date', today).maybeSingle(),
        supabase.from('activities' as any)
          .select('id, name, cover_url, ends_at')
          .eq('status', 'active')
          .order('starts_at', { ascending: false })
          .limit(3),
        supabase.from('shift_schedules' as any)
          .select('work_date, shift_code')
          .eq('user_id', user.id)
          .gte('work_date', today)
          .order('work_date', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      const content = (dk as any)?.content as DailyKb | undefined;
      setKb(content ?? null);
      setActs(((ac as any[]) || []) as ActiveActivity[]);
      setNextShift((sh as any) ?? null);
    })();
  }, [user]);

  if (authLoading) return null;
  if (!user) return <AuthPage />;

  const shortcuts = [
    { to: '/scan', label: 'AI 识物', Icon: Camera, tone: 'bg-primary text-primary-foreground' },
    { to: '/library', label: '官方知识', Icon: BookOpen, tone: 'bg-foreground text-background' },
    { to: '/me/vouchers', label: '我的券包', Icon: Ticket, tone: 'bg-accent text-accent-foreground' },
    { to: '/me/marketing', label: '营销中心', Icon: Clapperboard, tone: 'bg-secondary text-secondary-foreground' },
  ];

  return (
    <div className="min-h-screen">
      {/* 品牌 Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border/50">
        <div className="mx-auto max-w-screen-md px-4 h-14 flex items-center justify-between">
          <BrandLogo size={22} />
          <Link
            to="/notifications"
            className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted"
            aria-label="通知"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-screen-md px-4 pb-6 pt-3 space-y-4">
        {/* 欢迎条 */}
        <section>
          <h1 className="text-2xl font-bold tracking-tight">
            你好,BOOMER GO
            <span className="ml-2 inline-block align-middle text-primary">
              <Sparkles className="w-5 h-5 inline" />
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">今天也一起把门店跑起来。</p>
        </section>

        {/* 打卡卡片 */}
        <Suspense fallback={<Card className="p-4 h-24 animate-pulse" />}>
          <CheckInCard userId={user.id} />
        </Suspense>

        {/* 快捷入口 */}
        <section>
          <div className="grid grid-cols-4 gap-3">
            {shortcuts.map(({ to, label, Icon, tone }) => (
              <Link key={to} to={to} className="flex flex-col items-center gap-1.5">
                <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-hard ${tone}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <span className="text-[11px] font-medium text-foreground text-center leading-tight">{label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* 排班 */}
        <SectionCard
          title="我的排班"
          action={<Link to="/me" className="text-xs text-muted-foreground flex items-center">全部 <ChevronRight className="w-3 h-3" /></Link>}
          icon={<CalendarDays className="w-4 h-4 text-primary" />}
        >
          {nextShift ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{nextShift.work_date}</p>
                <p className="text-xs text-muted-foreground mt-0.5">下一次班次</p>
              </div>
              <Badge variant="secondary" className="text-sm px-3 py-1">{nextShift.shift_code}</Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">近期暂无排班</p>
          )}
        </SectionCard>

        {/* 每日知识 */}
        {kb?.title && (
          <SectionCard
            title="每日知识"
            icon={<BookOpen className="w-4 h-4 text-primary" />}
            action={<Link to="/library" className="text-xs text-muted-foreground flex items-center">去知识库 <ChevronRight className="w-3 h-3" /></Link>}
          >
            <p className="text-sm font-semibold leading-snug">{kb.title}</p>
            {kb.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{kb.body}</p>}
          </SectionCard>
        )}

        {/* 进行中活动 */}
        {acts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="text-sm font-bold flex items-center gap-1.5">
                <Megaphone className="w-4 h-4 text-primary" /> 门店活动
              </h2>
              <Link to="/me/activities" className="text-xs text-muted-foreground flex items-center">全部 <ChevronRight className="w-3 h-3" /></Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {acts.map(a => (
                <Link key={a.id} to={`/me/activities/${a.id}`}>
                  <Card className="overflow-hidden hover:shadow-hard transition-shadow">
                    {a.cover_url ? (
                      <div className="aspect-[4/3] bg-muted overflow-hidden">
                        <img src={a.cover_url} alt={a.name} loading="lazy" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="aspect-[4/3] bg-gradient-primary" />
                    )}
                    <div className="p-2">
                      <p className="text-xs font-medium line-clamp-2 leading-tight">{a.name}</p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 最新通知预览 */}
        {notes.length > 0 && (
          <SectionCard
            title="最新通知"
            icon={<Bell className="w-4 h-4 text-primary" />}
            action={<Link to="/notifications" className="text-xs text-muted-foreground flex items-center">查看 <ChevronRight className="w-3 h-3" /></Link>}
          >
            <ul className="space-y-2">
              {notes.slice(0, 3).map(n => (
                <li key={n.id} className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{n.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </main>
    </div>
  );
}

function SectionCard({
  title, icon, action, children,
}: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-4 shadow-hard">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold flex items-center gap-1.5">{icon}{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}
