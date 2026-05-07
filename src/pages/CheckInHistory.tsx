import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { ChevronLeft, Flame, Trophy, CalendarDays, CheckCircle2 } from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface CheckIn {
  id: string;
  check_in_date: string;
  checked_at: string;
  streak: number;
  exp_gained: number;
}

export default function CheckInHistory() {
  const { user, loading: authLoading } = useAuth();
  const [list, setList] = useState<CheckIn[]>([]);
  const [stats, setStats] = useState({ current: 0, longest: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [{ data: rows }, { data: exp }] = await Promise.all([
        supabase.from('user_check_ins').select('*').eq('user_id', user.id).order('check_in_date', { ascending: false }).limit(120),
        supabase.from('user_experience').select('current_streak,longest_streak,total_check_ins').eq('user_id', user.id).maybeSingle(),
      ]);
      setList((rows as CheckIn[]) || []);
      setStats({
        current: exp?.current_streak || 0,
        longest: exp?.longest_streak || 0,
        total: exp?.total_check_ins || 0,
      });
      setLoading(false);
    })();
  }, [user]);

  const checkedDates = useMemo(() => list.map(r => {
    const [y, m, d] = r.check_in_date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }), [list]);

  const monthCount = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    return list.filter(r => {
      const [yy, mm] = r.check_in_date.split('-').map(Number);
      return yy === y && (mm - 1) === m;
    }).length;
  }, [list]);

  if (authLoading || !user) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="container mx-auto max-w-screen-md px-3 py-3 flex items-center gap-2">
          <Link to="/me" className="p-1.5 -ml-1.5 hover:bg-accent rounded-lg">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-semibold">我的打卡</h1>
        </div>
      </header>

      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Flame className="w-3.5 h-3.5 text-orange-500" />当前连签</div>
            <p className="text-2xl font-bold mt-1 tabular-nums">{stats.current}<span className="text-sm font-normal text-muted-foreground ml-1">天</span></p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Trophy className="w-3.5 h-3.5 text-yellow-500" />最长连签</div>
            <p className="text-2xl font-bold mt-1 tabular-nums">{stats.longest}<span className="text-sm font-normal text-muted-foreground ml-1">天</span></p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><CalendarDays className="w-3.5 h-3.5 text-primary" />本月打卡</div>
            <p className="text-2xl font-bold mt-1 tabular-nums">{monthCount}<span className="text-sm font-normal text-muted-foreground ml-1">天</span></p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />累计打卡</div>
            <p className="text-2xl font-bold mt-1 tabular-nums">{stats.total}<span className="text-sm font-normal text-muted-foreground ml-1">天</span></p>
          </Card>
        </div>

        <Card className="p-2 flex justify-center">
          <Calendar
            mode="multiple"
            selected={checkedDates}
            modifiersClassNames={{ selected: 'bg-primary text-primary-foreground' }}
            className="pointer-events-none"
          />
        </Card>

        <Card>
          <div className="px-4 py-3 border-b border-border/60">
            <p className="text-sm font-semibold">最近打卡记录</p>
          </div>
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">还没有打卡记录</div>
          ) : (
            <div className="divide-y divide-border/60">
              {list.slice(0, 30).map(r => (
                <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{r.check_in_date}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.checked_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · 第 {r.streak} 天连签
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-primary tabular-nums">+{r.exp_gained}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
