import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useNotifications } from '@/hooks/useNotifications';
import {
  ChevronRight, CalendarDays, Megaphone, Flame, Check, Sparkles, Target, QrCode,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppGrid } from '@/components/home/AppGrid';
import { HomeFeedTabs } from '@/components/home/HomeFeedTabs';
import bannerDefault from '@/assets/banner-default.jpg';
import brandWordmark from '@/assets/boomer-go-wordmark.png.asset.json';
import xhsIcon from '@/assets/icon-xhs-activity.png';

interface ActiveActivity { id: string; name: string; cover_url: string | null; ends_at: string | null; voucher_id?: string | null }
interface StoreOkr {
  id: string; title: string; objective: string | null;
  key_results: any; tags: string[] | null;
}


function todayShanghai(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function daysLeft(ends: string | null): string | null {
  if (!ends) return null;
  const diff = new Date(ends).getTime() - Date.now();
  if (diff <= 0) return '已结束';
  const d = Math.ceil(diff / 86400000);
  if (d <= 1) return '今日截止';
  return `剩 ${d} 天`;
}

function okrProgress(kr: any): number {
  if (!Array.isArray(kr) || !kr.length) return 0;
  const done = kr.filter((k: any) => k?.done || k?.completed || (typeof k?.progress === 'number' && k.progress >= 100)).length;
  return Math.round((done / kr.length) * 100);
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { items: notes } = useNotifications();

  const [name, setName] = useState<string>('店员');
  const [encouragement, setEncouragement] = useState<string>('今天也把每一位进店的客人当作朋友。');
  const [nextShift, setNextShift] = useState<{ work_date: string; shift_code: string } | null>(null);
  const [act, setAct] = useState<ActiveActivity | null>(null);
  const [okrs, setOkrs] = useState<StoreOkr[]>([]);
  
  const [checkedToday, setCheckedToday] = useState(false);
  const [checking, setChecking] = useState(false);
  const [bannerNote, setBannerNote] = useState<{ id: string; title: string; image_url?: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    const today = todayShanghai();

    void (async () => {
      const [{ data: profile }, { data: sp }, { data: sh }, { data: chk }] =
        await Promise.all([
          supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
          supabase.from('staff_profiles' as any).select('real_name, shop_id').eq('user_id', user.id).maybeSingle(),
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
      setNextShift((sh as any) ?? null);
      setCheckedToday(!!chk);

      const shopId = (sp as any)?.shop_id as string | undefined;

      // 活动：只显示本店店员创建的（activities 无 shop_id 字段，按 created_by 交集过滤）
      let activityQuery = supabase.from('activities' as any)
        .select('id, name, cover_url, ends_at, voucher_id, created_by')
        .eq('status', 'active')
        .order('starts_at', { ascending: false })
        .limit(6);
      const { data: ac } = await activityQuery;
      let list = ((ac as any[]) || []) as (ActiveActivity & { created_by: string })[];
      if (shopId && list.length) {
        const uids = Array.from(new Set(list.map(a => a.created_by).filter(Boolean)));
        if (uids.length) {
          const { data: mates } = await supabase.from('staff_profiles' as any)
            .select('user_id').eq('shop_id', shopId).in('user_id', uids);
          const set = new Set(((mates as any[]) || []).map(m => m.user_id));
          list = list.filter(a => set.has(a.created_by));
        }
      }
      setAct(list[0] ?? null);

      // OKR：当前周期 + 本店
      if (shopId) {
        const { data: ok } = await supabase.from('operation_okrs' as any)
          .select('id, title, objective, key_results, tags')
          .eq('shop_id', shopId)
          .lte('period_start', today)
          .gte('period_end', today)
          .order('created_at', { ascending: false })
          .limit(3);
        setOkrs(((ok as any[]) || []) as StoreOkr[]);
      }

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

  // Banner：只取「资讯」分类最新一条
  useEffect(() => {
    if (!notes.length) { setBannerNote(null); return; }
    const b = notes.find((n) => (n as any).category === 'news');
    if (b) setBannerNote({ id: b.id, title: b.title, image_url: (b as any).image_url });
    else setBannerNote(null);
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
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border/50 safe-top">
        <div className="mx-auto max-w-screen-md px-4 h-12 flex items-center justify-between">
          <h1 className="text-base font-semibold tracking-tight">仪表盘</h1>
          <img src={brandWordmark.url} alt="BOOMER GO" className="h-4 w-auto object-contain select-none" draggable={false} />
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
          <p className="text-sm text-muted-foreground mt-2 text-left leading-relaxed">
            <Sparkles className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-primary" />
            {encouragement}
          </p>
        </section>

        {/* Banner */}
        <Link
          to={bannerNote?.id ? `/notifications?tab=news&open=${bannerNote.id}` : '/notifications?tab=news'}
          className="block relative rounded-2xl overflow-hidden border border-border/60 aspect-[16/6] bg-muted"
        >
          <img
            src={bannerNote?.image_url || bannerDefault}
            alt={bannerNote?.title || 'BOOMER GO'}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          {bannerNote?.title && (
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
              <p className="text-white text-sm font-semibold line-clamp-1">{bannerNote.title}</p>
            </div>
          )}
        </Link>

        {/* 我的排班（无排班则整卡隐藏） */}
        {nextShift && (
          <SectionCard
            title="我的排班"
            icon={<CalendarDays className="w-4 h-4 text-primary" />}
            action={<Link to="/me" className="text-xs text-muted-foreground flex items-center">全部 <ChevronRight className="w-3 h-3" /></Link>}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{nextShift.work_date}</p>
                <p className="text-xs text-muted-foreground mt-0.5">下一次班次</p>
              </div>
              <Badge variant="secondary" className="text-sm px-3 py-1">{nextShift.shift_code}</Badge>
            </div>
          </SectionCard>
        )}

        {/* 正在进行的活动（横向条幅） */}
        {act && (
          <section>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="text-sm font-bold flex items-center gap-1.5">
                <Megaphone className="w-4 h-4 text-primary" /> 正在进行的活动
              </h2>
              <Link to="/me/activities" className="text-xs text-muted-foreground flex items-center">全部 <ChevronRight className="w-3 h-3" /></Link>
            </div>
            <Card className="flex items-center gap-3 p-2.5 border-border/60 hover:border-primary/40 transition-colors">
              <Link to={`/me/activities/${act.id}`} className="w-14 h-14 rounded-xl overflow-hidden bg-muted shrink-0 block">
                <img
                  src={act.cover_url || xhsIcon}
                  alt={act.name}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </Link>
              <Link to={`/me/activities/${act.id}`} className="flex-1 min-w-0 block">
                <p className="text-sm font-semibold line-clamp-1">{act.name}</p>
                {daysLeft(act.ends_at) && (
                  <p className="text-xs text-muted-foreground mt-1">{daysLeft(act.ends_at)}</p>
                )}
              </Link>
              <Link to={act.voucher_id ? `/me/vouchers?activity=${act.id}` : `/me/activities/${act.id}?tab=redeem`}>
                <Button size="sm" className="h-8 px-3 rounded-full text-xs shrink-0">
                  <QrCode className="w-3.5 h-3.5 mr-1" />去核销
                </Button>
              </Link>
            </Card>
          </section>
        )}

        {/* 我的应用 */}
        <AppGrid />

        {/* 门店管理 / OKR */}
        {okrs.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="text-sm font-bold flex items-center gap-1.5">
                <Target className="w-4 h-4 text-primary" /> 门店管理
              </h2>
              <Link to="/store/okr" className="text-xs text-muted-foreground flex items-center">更多 <ChevronRight className="w-3 h-3" /></Link>
            </div>
            <Card className="divide-y divide-border/60 border-border/60 overflow-hidden">
              {okrs.map(o => {
                const p = okrProgress(o.key_results);
                return (
                  <Link key={o.id} to={`/store/okr/${o.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-muted/50 transition-colors">
                    <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Target className="w-4 h-4" strokeWidth={1.75} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold line-clamp-1">{o.title}</p>
                      {o.objective && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{o.objective}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-primary tabular-nums">{p}%</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                );
              })}
            </Card>
          </section>
        )}

        {/* 我的知识 / BOOMER 圈 双 Tab 瀑布流 */}
        <HomeFeedTabs />
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
