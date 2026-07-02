import { useEffect, useState } from 'react';
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
  Bell, ChevronRight, CalendarDays, Megaphone, Flame, Check, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppGrid } from '@/components/home/AppGrid';
import bannerDefault from '@/assets/banner-default.jpg';

interface ActiveActivity { id: string; name: string; cover_url: string | null; ends_at: string | null }

function todayShanghai(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { items: notes, unreadCount } = useNotifications();

  const [name, setName] = useState<string>('店员');
  const [encouragement, setEncouragement] = useState<string>('今天也把每一位进店的客人当作朋友。');
  const [nextShift, setNextShift] = useState<{ work_date: string; shift_code: string } | null>(null);
  const [acts, setActs] = useState<ActiveActivity[]>([]);
  const [checkedToday, setCheckedToday] = useState(false);
  const [checking, setChecking] = useState(false);
  const [bannerNote, setBannerNote] = useState<{ id: string; title: string; image_url?: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    const today = todayShanghai();

    void (async () => {
      const [{ data: profile }, { data: sp }, { data: ac }, { data: sh }, { data: chk }] =
        await Promise.all([
          supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
          supabase.from('staff_profiles' as any).select('real_name').eq('user_id', user.id).maybeSingle(),
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
          supabase.from('user_check_ins').select('id').eq('user_id', user.id).eq('check_in_date', today).maybeSingle(),
        ]);

      setName((sp as any)?.real_name || profile?.display_name || user.email?.split('@')[0] || '店员');
      setActs(((ac as any[]) || []) as ActiveActivity[]);
      setNextShift((sh as any) ?? null);
      setCheckedToday(!!chk);
    })();

    // 每日鼓励
    void (async () => {
      const { data: hit } = await supabase
        .from('daily_encouragement' as any)
        .select('text')
        .eq('date', today)
        .maybeSingle();
      if ((hit as any)?.text) {
        setEncouragement((hit as any).text);
      } else {
        try {
          const { data } = await supabase.functions.invoke('generate-daily-encouragement');
          if ((data as any)?.text) setEncouragement((data as any).text);
        } catch { /* ignore */ }
      }
    })();
  }, [user]);

  // Banner：取最新一条 category='banner' 或最新未读通知
  useEffect(() => {
    if (!notes.length) return;
    const b = notes.find((n) => (n as any).category === 'banner') || notes[0];
    if (b) setBannerNote({ id: b.id, title: b.title, image_url: (b as any).image_url });
  }, [notes]);

  const handleCheckIn = async () => {
    if (checkedToday || checking) return;
    setChecking(true);
    const { data, error } = await supabase.rpc('perform_check_in');
    setChecking(false);
    if (error) { toast.error('打卡失败：' + error.message); return; }
    const r = data as any;
    if (r?.already) toast.info('今天已经签到啦');
    else toast.success(`打卡成功 +${r?.exp_gained || 5} 经验`);
    setCheckedToday(true);
  };

  if (authLoading) return null;
  if (!user) return <AuthPage />;

  return (
    <div className="min-h-screen">
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

      <main className="mx-auto max-w-screen-md px-4 pb-6 pt-3 space-y-5">
        {/* 问候 + 快速打卡 */}
        <section>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold tracking-tight truncate">
              你好，{name}
            </h1>
            <Button
              size="sm"
              onClick={handleCheckIn}
              disabled={checking || checkedToday}
              className="h-8 px-3 rounded-full text-xs font-medium shrink-0"
              variant={checkedToday ? 'secondary' : 'default'}
            >
              {checkedToday ? (
                <><Check className="w-3.5 h-3.5 mr-1" />今日已打卡</>
              ) : (
                <><Flame className="w-3.5 h-3.5 mr-1" />{checking ? '打卡中' : '快速打卡'}</>
              )}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1.5 flex items-start gap-1.5">
            <Sparkles className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
            <span className="flex-1">{encouragement}</span>
          </p>
        </section>

        {/* Banner */}
        <Link
          to={bannerNote ? `/notifications` : '/notifications'}
          className="block relative rounded-2xl overflow-hidden border border-border/60 aspect-[16/6] bg-muted"
        >
          <img
            src={bannerNote?.image_url || bannerDefault}
            alt={bannerNote?.title || 'BOOMER-OFF'}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          {bannerNote?.title && (
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
              <p className="text-white text-sm font-semibold line-clamp-1">{bannerNote.title}</p>
            </div>
          )}
        </Link>

        {/* 我的排班 */}
        <SectionCard
          title="我的排班"
          icon={<CalendarDays className="w-4 h-4 text-primary" />}
          action={<Link to="/me/schedule" className="text-xs text-muted-foreground flex items-center">全部 <ChevronRight className="w-3 h-3" /></Link>}
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

        {/* 应用图标网格 */}
        <AppGrid />

        {/* 门店活动 */}
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
                  <Card className="overflow-hidden border-border/60">
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
      </main>
    </div>
  );
}

function SectionCard({
  title, icon, action, children,
}: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-4 border-border/60">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold flex items-center gap-1.5">{icon}{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}
