import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { MyScheduleList } from '@/components/me/MyScheduleList';
import { ShopScheduleList } from '@/components/me/ShopScheduleList';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { todayISO, addDaysISO, formatShiftTime, shortDateLabel, weekdayLabel } from '@/lib/scheduleUtils';
import { cn } from '@/lib/utils';

interface Shift { code: string; name: string; start_time: string; end_time: string; color: string | null }
interface Sched { work_date: string; shift_code: string }

export function SchedulePanel() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [todayShift, setTodayShift] = useState<Shift | null>(null);
  const [workCount, setWorkCount] = useState(0);
  const [next, setNext] = useState<{ date: string; shift: Shift | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const start = todayISO();
      const end = addDaysISO(start, 29);
      const [{ data: rows }, { data: sh }] = await Promise.all([
        supabase.from('shift_schedules' as any)
          .select('work_date, shift_code')
          .eq('user_id', user.id)
          .gte('work_date', start).lte('work_date', end)
          .order('work_date'),
        supabase.from('shop_shifts' as any)
          .select('code, name, start_time, end_time, color').eq('active', true),
      ]);
      const sMap = new Map<string, Shift>();
      (sh as any[] || []).forEach(s => sMap.set(s.code, s));
      const list = ((rows as any[]) || []) as Sched[];
      const today = list.find(r => r.work_date === start);
      setTodayShift(today ? sMap.get(today.shift_code) || null : null);
      setWorkCount(list.length);
      const future = list.find(r => r.work_date > start);
      setNext(future ? { date: future.work_date, shift: sMap.get(future.shift_code) || null } : null);
      setLoading(false);
    })();
  }, [user]);

  const todayLabel = loading
    ? '加载中…'
    : todayShift
      ? `今日 ${todayShift.name} ${formatShiftTime(todayShift.start_time, todayShift.end_time)}`
      : '今日休息';

  const subLabel = loading
    ? ' '
    : next
      ? `未来30天上班 ${workCount} 天 · 下一班 ${shortDateLabel(next.date)} ${weekdayLabel(next.date)}${next.shift ? ' ' + next.shift.name : ''}`
      : workCount > 0
        ? `未来30天上班 ${workCount} 天`
        : '近期暂无排班';

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/10 transition-colors">
            <div className="shrink-0 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">我的排班</span>
                <span
                  className="text-[11px] px-1.5 py-0.5 rounded text-white font-medium tabular-nums"
                  style={{ background: todayShift?.color || (todayShift ? '#f59e0b' : 'hsl(var(--muted-foreground) / 0.5)') }}
                >
                  {todayShift ? todayShift.code : '休'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{todayLabel}</p>
              <p className="text-[11px] text-muted-foreground/80 truncate">{subLabel}</p>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', open && 'rotate-180')} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 sm:px-4 sm:pb-4 border-t border-border/60 pt-3">
            <Tabs defaultValue="me" className="space-y-3">
              <TabsList className="grid w-full grid-cols-2 h-9">
                <TabsTrigger value="me" className="text-xs">我的</TabsTrigger>
                <TabsTrigger value="shop" className="text-xs">门店</TabsTrigger>
              </TabsList>
              <TabsContent value="me" className="m-0">
                {open && <MyScheduleList />}
              </TabsContent>
              <TabsContent value="shop" className="m-0">
                {open && <ShopScheduleList />}
              </TabsContent>
            </Tabs>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
