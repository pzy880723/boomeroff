import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import {
  Loader2, Camera, Wand2, BookOpen, MessagesSquare, Bell,
  ChevronRight, MapPin, Sparkles, Megaphone, Ticket,
} from 'lucide-react';
import { CheckInCard } from '@/components/me/CheckInCard';
import { LevelCard } from '@/components/me/LevelCard';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { useNotifications } from '@/hooks/useNotifications';
import { format } from 'date-fns';

interface ShiftInfo {
  start: string; end: string; name: string; partners: string[];
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const notif = useNotifications();
  const [displayName, setDisplayName] = useState('');
  const [shopName, setShopName] = useState<string | null>(null);
  const [totalExp, setTotalExp] = useState(0);
  const [expRefreshKey, setExpRefreshKey] = useState(0);
  const [shift, setShift] = useState<ShiftInfo | null>(null);
  const [activities, setActivities] = useState<Array<{ id: string; name: string; cover_url: string | null; ends_at: string | null }>>([]);
  const [dailyKnowledge, setDailyKnowledge] = useState<{ title: string; body: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: profile }, { data: sp }, { data: exp }] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
        supabase.from('staff_profiles' as any).select('shop_id, real_name').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_experience').select('total_exp').eq('user_id', user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setDisplayName((sp as any)?.real_name || profile?.display_name || user.email?.split('@')[0] || '店员');
      setTotalExp((exp as any)?.total_exp || 0);

      const sid = (sp as any)?.shop_id;
      const today = new Date().toISOString().slice(0, 10);

      const [shopRes, myShiftRes, allShiftRes, shiftsRes, actsRes, dkRes] = await Promise.all([
        sid
          ? supabase.from('shops' as any).select('name').eq('id', sid).maybeSingle()
          : Promise.resolve({ data: null } as any),
        supabase.from('shift_schedules' as any)
          .select('shift_code, shop_id, user_id')
          .eq('user_id', user.id).eq('work_date', today).maybeSingle(),
        sid
          ? supabase.from('shift_schedules' as any)
              .select('shift_code, user_id').eq('shop_id', sid).eq('work_date', today)
          : Promise.resolve({ data: [] } as any),
        supabase.from('shop_shifts' as any).select('code, name, start_time, end_time').eq('active', true),
        supabase.from('activities' as any)
          .select('id, name, cover_url, ends_at, starts_at, status')
          .eq('status', 'published')
          .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`)
          .order('created_at', { ascending: false })
          .limit(6),
        supabase.from('daily_knowledge' as any).select('content, date').order('date', { ascending: false }).limit(1).maybeSingle(),
      ]);

      if (cancelled) return;

      setShopName((shopRes as any)?.data?.name || null);

      const shiftMap = new Map<string, any>();
      ((shiftsRes as any).data || []).forEach((s: any) => shiftMap.set(s.code, s));
      const myShift = (myShiftRes as any).data;
      if (myShift?.shift_code) {
        const s = shiftMap.get(myShift.shift_code);
        const partnerIds = ((allShiftRes as any).data || [])
          .filter((r: any) => r.user_id !== user.id && r.shift_code === myShift.shift_code)
          .map((r: any) => r.user_id).slice(0, 3);
        let partners: string[] = [];
        if (partnerIds.length) {
          const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', partnerIds);
          const nameMap = new Map((profs || []).map((p: any) => [p.user_id, p.display_name]));
          partners = partnerIds.map((id: string) => nameMap.get(id) || '同事').filter(Boolean);
        }
        setShift({
          name: s?.name || myShift.shift_code,
          start: s?.start_time?.slice(0, 5) || '',
          end: s?.end_time?.slice(0, 5) || '',
          partners,
        });
      } else {
        setShift(null);
      }

      setActivities(((actsRes as any).data || []).slice(0, 6));

      const dk = (dkRes as any).data;
      if (dk?.content) {
        const c = typeof dk.content === 'string' ? JSON.parse(dk.content) : dk.content;
        setDailyKnowledge({ title: c.title || '今日一课', body: c.body || c.content || c.text || '' });
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, expRefreshKey]);

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  return (
    <div className="container mx-auto max-w-[420px] px-4 pt-4 pb-32 space-y-4">
      {/* 品牌栏 */}
      <header className="flex items-end justify-between pb-1">
        <div className="flex flex-col gap-1">
          <BrandLogo size={22} />
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span className="font-medium text-foreground">{shopName || '未分配门店'}</span>
            <span>·</span>
            <span>{displayName}</span>
          </div>
        </div>
        <Link
          to="/notifications"
          className="relative w-10 h-10 rounded-2xl border-hard bg-white flex items-center justify-center shadow-hard-sm press-hard"
          aria-label="通知"
        >
          <Bell className="w-4 h-4" />
          {notif.unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
              {notif.unreadCount > 9 ? '9+' : notif.unreadCount}
            </span>
          )}
        </Link>
      </header>

      {/* 打卡卡片 */}
      <CheckInCard userId={user.id} onChanged={() => setExpRefreshKey(k => k + 1)} />

      {/* 我的今日排班 */}
      <Card className="p-4 border-hard shadow-hard rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-primary">TODAY</span>
            <h3 className="text-sm font-bold">我的今日排班</h3>
          </div>
          <Link to="/me" className="text-[11px] text-muted-foreground flex items-center gap-0.5">
            查看月历 <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {shift ? (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-num font-bold">{shift.start}</span>
              <span className="text-muted-foreground text-lg">→</span>
              <span className="text-3xl font-num font-bold">{shift.end}</span>
              <Badge variant="secondary" className="ml-auto rounded-md font-bold">{shift.name}</Badge>
            </div>
            {shift.partners.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                今日搭档：<span className="text-foreground font-medium">{shift.partners.join(' · ')}</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">今日一人当值</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">今天没有排班,好好休息 🌿</p>
        )}
      </Card>

      {/* 门店进行中活动 */}
      {activities.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold">门店进行中活动</h3>
            </div>
            <Link to="/me/activities" className="text-[11px] text-muted-foreground flex items-center gap-0.5">
              全部 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
            {activities.map((a) => (
              <Link
                key={a.id}
                to={`/me/activities/${a.id}`}
                className="shrink-0 w-[240px] snap-start rounded-2xl border-hard shadow-hard-sm bg-white overflow-hidden press-hard"
              >
                <div className="h-24 bg-gradient-primary flex items-center justify-center relative overflow-hidden">
                  {a.cover_url ? (
                    <img src={a.cover_url} alt={a.name} className="w-full h-full object-cover" />
                  ) : (
                    <Ticket className="w-10 h-10 text-white/80" />
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold line-clamp-1">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {a.ends_at ? `${format(new Date(a.ends_at), 'MM/dd')} 结束` : '长期活动'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 最新通知 Top 3 */}
      {notif.items.length > 0 && (
        <Card className="p-4 border-hard shadow-hard-sm rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold">最新通知</h3>
            </div>
            <Link to="/notifications" className="text-[11px] text-muted-foreground flex items-center gap-0.5">
              全部 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {notif.items.slice(0, 3).map((n) => (
              <li key={n.id} className="py-2 flex items-start gap-2">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${n.read ? 'bg-muted-foreground/30' : 'bg-primary'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold line-clamp-1">{n.title}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{n.body}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {format(new Date(n.created_at), 'MM/dd')}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 每日知识卡 */}
      {dailyKnowledge && (
        <Card className="p-4 border-hard shadow-hard rounded-2xl bg-primary text-primary-foreground">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">DAILY KNOWLEDGE</span>
          </div>
          <p className="text-base font-bold mb-1 line-clamp-2">{dailyKnowledge.title}</p>
          <p className="text-xs opacity-90 line-clamp-3">{dailyKnowledge.body}</p>
        </Card>
      )}

      {/* 等级 */}
      <LevelCard totalExp={totalExp} />

      {/* 快捷入口 4 宫格 */}
      <div>
        <h3 className="text-sm font-bold px-1 mb-2">快捷入口</h3>
        <div className="grid grid-cols-4 gap-3">
          <ShortcutTile to="/scan" Icon={Camera} label="AI识别" />
          <ShortcutTile to="/me/marketing" Icon={Wand2} label="营销中心" />
          <ShortcutTile to="/library" Icon={BookOpen} label="官方知识" />
          <ShortcutTile to="/me/qa" Icon={MessagesSquare} label="顾客Q&A" />
        </div>
      </div>
    </div>
  );
}

function ShortcutTile({ to, Icon, label }: { to: string; Icon: typeof Camera; label: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border-hard shadow-hard-sm bg-white press-hard"
    >
      <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </span>
      <span className="text-[11px] font-bold">{label}</span>
    </Link>
  );
}
