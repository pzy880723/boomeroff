import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CalendarClock } from 'lucide-react';
import { todayISO, addDaysISO, formatShiftTime, shortDateLabel } from '@/lib/scheduleUtils';
import { cn } from '@/lib/utils';

interface Props {
  userId: string;
  className?: string;
}

interface Row {
  work_date: string;
  shift_code: string;
  shift?: { name: string; start_time: string; end_time: string; color: string | null };
}

export function ShiftBadgeRight({ userId, className }: Props) {
  const [today, setToday] = useState<Row | null>(null);
  const [tomorrow, setTomorrow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const t = todayISO();
    const tm = addDaysISO(t, 1);
    (async () => {
      const { data } = await supabase
        .from('shift_schedules' as any)
        .select('work_date, shift_code')
        .eq('user_id', userId)
        .in('work_date', [t, tm]);
      const { data: shifts } = await supabase
        .from('shop_shifts' as any)
        .select('code, name, start_time, end_time, color');
      const map = new Map<string, any>();
      (shifts || []).forEach((s: any) => map.set(s.code, s));
      const norm = (r: any): Row => ({
        work_date: r.work_date,
        shift_code: r.shift_code,
        shift: map.get(r.shift_code),
      });
      setToday((data || []).find((r: any) => r.work_date === t) ? norm((data as any[])!.find((r: any) => r.work_date === t)) : null);
      setTomorrow((data || []).find((r: any) => r.work_date === tm) ? norm((data as any[])!.find((r: any) => r.work_date === tm)) : null);
      setLoading(false);
    })();
  }, [userId]);

  const renderRow = (label: string, dateISO: string, row: Row | null) => (
    <div className="flex items-center gap-1.5 text-[11px] leading-tight">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-muted-foreground/70 shrink-0">{shortDateLabel(dateISO)}</span>
      {row?.shift ? (
        <>
          <span
            className="px-1.5 py-0.5 rounded text-white font-medium shrink-0"
            style={{ background: row.shift.color || '#f59e0b' }}
          >
            {row.shift_code}
          </span>
          <span className="font-medium tabular-nums truncate">
            {formatShiftTime(row.shift.start_time, row.shift.end_time)}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">休息</span>
      )}
    </div>
  );

  return (
    <div className={cn('rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2 min-w-0 flex flex-col gap-1', className)}>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <CalendarClock className="w-3 h-3" />
        <span>我的排班</span>
      </div>
      {loading ? (
        <div className="text-[11px] text-muted-foreground">加载中…</div>
      ) : (
        <>
          {renderRow('今', todayISO(), today)}
          {renderRow('明', addDaysISO(todayISO(), 1), tomorrow)}
        </>
      )}
    </div>
  );
}
