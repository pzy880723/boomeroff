import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Loader2, ChevronDown } from 'lucide-react';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  todayISO, addDaysISO, nextNDays, weekdayLabel, shortDateLabel, formatShiftTime,
} from '@/lib/scheduleUtils';
import { cn } from '@/lib/utils';

interface Shift { code: string; name: string; start_time: string; end_time: string; color: string | null; sort_order: number }
interface Sched { work_date: string; shift_code: string; user_id: string }
interface Holiday { date: string; name: string; full_staff_off: boolean; intern_works: boolean }

export function ShopScheduleList() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [scheds, setScheds] = useState<Sched[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [holidays, setHolidays] = useState<Map<string, Holiday>>(new Map());
  const [shopName, setShopName] = useState<string>('');

  const start = todayISO();
  const days = useMemo(() => nextNDays(start, 30), [start]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const end = addDaysISO(start, 29);

      const { data: sp } = await supabase
        .from('staff_profiles' as any).select('shop_id').eq('user_id', user.id).maybeSingle();
      let sid: string | null = (sp as any)?.shop_id ?? null;
      if (!sid) {
        const { data: anyShop } = await supabase
          .from('shops' as any).select('id, name').order('sort_order').limit(1).maybeSingle();
        sid = (anyShop as any)?.id ?? null;
        if (anyShop) setShopName((anyShop as any).name);
      } else {
        const { data: shop } = await supabase
          .from('shops' as any).select('name').eq('id', sid).maybeSingle();
        setShopName((shop as any)?.name || '');
      }

      if (!sid) { setLoading(false); return; }

      const [{ data: sh }, { data: sc }, { data: hd }] = await Promise.all([
        supabase.from('shop_shifts' as any).select('*').eq('active', true).order('sort_order'),
        supabase.from('shift_schedules' as any)
          .select('work_date, shift_code, user_id')
          .eq('shop_id', sid)
          .gte('work_date', start).lte('work_date', end),
        supabase.from('shop_holidays' as any)
          .select('date, name, full_staff_off, intern_works')
          .gte('date', start).lte('date', end),
      ]);

      const userIds = Array.from(new Set((sc as any[] || []).map(r => r.user_id))).filter(Boolean);
      const pMap = new Map<string, string>();
      if (userIds.length) {
        const { data: pr } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
        (pr || []).forEach((p: any) => pMap.set(p.user_id, p.display_name || '店员'));
      }

      const hMap = new Map<string, Holiday>();
      (hd || []).forEach((h: any) => hMap.set(h.date, h));

      setShifts((sh as any) || []);
      setScheds((sc as any) || []);
      setProfiles(pMap);
      setHolidays(hMap);
      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <p className="text-xs text-muted-foreground">门店</p>
        <p className="text-sm font-semibold">{shopName || '本店'} · 未来 30 天</p>
      </Card>

      <Accordion type="single" collapsible defaultValue={start} className="space-y-2">
        {days.map((d) => {
          const dayRows = scheds.filter(r => r.work_date === d);
          const holiday = holidays.get(d);
          return (
            <AccordionItem key={d} value={d} className="border-0">
              <Card className="overflow-hidden">
                <AccordionTrigger className="px-3 py-2.5 hover:no-underline [&>svg]:hidden group">
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-14 text-left shrink-0">
                      <div className="text-sm font-semibold tabular-nums">{shortDateLabel(d)}</div>
                      <div className="text-[11px] text-muted-foreground">{weekdayLabel(d)}</div>
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                      {holiday && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
                          {holiday.name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">在岗 {dayRows.length} 人</span>
                    </div>
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3 pt-0">
                  {dayRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">
                      {holiday ? (holiday.full_staff_off ? (holiday.intern_works ? '全员休 · 仅实习生在岗' : '全员休') : '节假日') : '无人排班'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {shifts.map(s => {
                        const inShift = dayRows.filter(r => r.shift_code === s.code);
                        if (inShift.length === 0) return null;
                        return (
                          <div key={s.code}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="px-1.5 py-0.5 rounded text-[11px] text-white font-medium"
                                style={{ background: s.color || '#f59e0b' }}>{s.code}</span>
                              <span className="text-xs font-medium">{s.name}</span>
                              <span className="text-[11px] text-muted-foreground tabular-nums">{formatShiftTime(s.start_time, s.end_time)}</span>
                            </div>
                            <div className="flex flex-wrap gap-1 pl-1">
                              {inShift.map(r => (
                                <span key={r.user_id}
                                  className={cn('text-[11px] px-1.5 py-0.5 rounded',
                                    r.user_id === user?.id ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted')}>
                                  {profiles.get(r.user_id) || '店员'}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </AccordionContent>
              </Card>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
