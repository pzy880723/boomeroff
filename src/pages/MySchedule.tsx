import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  todayISO, weekStartISO, weekDays, addDaysISO, weekdayLabel,
  shortDateLabel, formatShiftTime,
} from '@/lib/scheduleUtils';

interface Shift { code: string; name: string; start_time: string; end_time: string; color: string | null; sort_order: number }
interface Sched { work_date: string; shift_code: string; user_id: string }
interface Profile { user_id: string; display_name: string | null }

export default function MySchedule() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => weekStartISO(todayISO()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [scheds, setScheds] = useState<Sched[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const end = addDaysISO(weekStart, 6);
      const [{ data: s }, { data: sc }] = await Promise.all([
        supabase.from('shop_shifts' as any).select('*').eq('active', true).order('sort_order'),
        supabase.from('shift_schedules' as any).select('work_date, shift_code, user_id')
          .gte('work_date', weekStart).lte('work_date', end),
      ]);
      const userIds = Array.from(new Set((sc as any[] || []).map(r => r.user_id)));
      let profMap = new Map<string, string>();
      if (userIds.length) {
        const { data: pr } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
        (pr || []).forEach((p: any) => profMap.set(p.user_id, p.display_name || '店员'));
      }
      setShifts((s as any) || []);
      setScheds((sc as any) || []);
      setProfiles(profMap);
      setLoading(false);
    })();
  }, [weekStart]);

  const myDays = useMemo(() => {
    if (!user) return { work: 0, off: 0 };
    const work = scheds.filter(r => r.user_id === user.id).length;
    return { work, off: 7 - work };
  }, [scheds, user]);

  const cell = (date: string, code: string) => {
    const list = scheds.filter(r => r.work_date === date && r.shift_code === code);
    if (!list.length) return <span className="text-muted-foreground/60 text-xs">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {list.map(r => (
          <span
            key={r.user_id}
            className={`px-1.5 py-0.5 rounded text-[11px] ${r.user_id === user?.id ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted text-foreground'}`}
          >
            {profiles.get(r.user_id) || '店员'}
          </span>
        ))}
      </div>
    );
  };

  return (
    <>
      <PageHeader title="店铺排班" back="/me" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-4">
        <Card className="p-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDaysISO(weekStart, -7))}>
            <ChevronLeft className="w-4 h-4" />上周
          </Button>
          <div className="text-sm font-medium tabular-nums">
            {shortDateLabel(weekStart)} – {shortDateLabel(addDaysISO(weekStart, 6))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDaysISO(weekStart, 7))}>
            下周<ChevronRight className="w-4 h-4" />
          </Button>
        </Card>

        <Card className="p-3">
          <p className="text-xs text-muted-foreground">本周我</p>
          <p className="text-sm">
            上班 <span className="font-semibold text-foreground">{myDays.work}</span> 天 · 休息 <span className="font-semibold text-foreground">{myDays.off}</span> 天
          </p>
        </Card>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  <th className="text-left p-2 text-xs font-medium text-muted-foreground w-20">日期</th>
                  {shifts.map(s => (
                    <th key={s.code} className="text-left p-2 text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: s.color || '#f59e0b' }} />
                        <span>{s.name}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums font-normal">
                        {formatShiftTime(s.start_time, s.end_time)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map(d => (
                  <tr key={d} className="border-b border-border/40">
                    <td className="p-2 text-xs">
                      <div className="font-medium tabular-nums">{shortDateLabel(d)}</div>
                      <div className="text-muted-foreground">{weekdayLabel(d)}</div>
                    </td>
                    {shifts.map(s => (
                      <td key={s.code} className="p-2 align-top">{cell(d, s.code)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}
