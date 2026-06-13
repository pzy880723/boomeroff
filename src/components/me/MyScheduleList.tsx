import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import {
  todayISO, addDaysISO, nextNDays, weekdayLabel, shortDateLabel, formatShiftTime,
} from '@/lib/scheduleUtils';
import { cn } from '@/lib/utils';

interface Shift { code: string; name: string; start_time: string; end_time: string; color: string | null }
interface Sched { work_date: string; shift_code: string; user_id: string; shop_id: string | null }

export function MyScheduleList() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<Sched[]>([]);
  const [allInRange, setAllInRange] = useState<Sched[]>([]);
  const [shifts, setShifts] = useState<Map<string, Shift>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());

  const start = todayISO();
  const end = addDaysISO(start, 29);
  const tomorrow = addDaysISO(start, 1);
  const days = useMemo(() => nextNDays(start, 30), [start]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      // 我的 shop:优先 staff_profiles,否则取第一个门店兜底
      const { data: sp } = await supabase
        .from('staff_profiles' as any)
        .select('shop_id')
        .eq('user_id', user.id)
        .maybeSingle();
      let sid: string | null = (sp as any)?.shop_id ?? null;
      if (!sid) {
        const { data: anyShop } = await supabase
          .from('shops' as any).select('id').eq('active', true).order('sort_order').limit(1).maybeSingle();
        sid = (anyShop as any)?.id ?? null;
      }

      // 我的排班
      const { data: my } = await supabase
        .from('shift_schedules' as any)
        .select('work_date, shift_code, user_id, shop_id')
        .eq('user_id', user.id)
        .gte('work_date', start).lte('work_date', end)
        .order('work_date');

      // 同店+本人排班里出现的所有门店,30 天全部排班
      const shopIds = Array.from(new Set([
        ...(sid ? [sid] : []),
        ...(((my as any[]) || []).map((r: any) => r.shop_id).filter(Boolean) as string[]),
      ]));
      let allRows: any[] = [];
      if (shopIds.length) {
        const { data } = await supabase
          .from('shift_schedules' as any)
          .select('work_date, shift_code, user_id, shop_id')
          .in('shop_id', shopIds)
          .gte('work_date', start).lte('work_date', end);
        allRows = data || [];
      }

      // shifts
      const { data: sh } = await supabase
        .from('shop_shifts' as any).select('code, name, start_time, end_time, color').eq('active', true);
      const sMap = new Map<string, Shift>();
      (sh || []).forEach((s: any) => sMap.set(s.code, s));

      // 同事姓名:优先 staff_profiles.real_name,否则 display_name
      const userIds = Array.from(new Set(allRows.map(r => r.user_id))).filter(Boolean);
      const pMap = new Map<string, string>();
      if (userIds.length) {
        const [{ data: pr }, { data: sps }] = await Promise.all([
          supabase.from('profiles').select('user_id, display_name').in('user_id', userIds),
          supabase.from('staff_profiles' as any).select('user_id, real_name').in('user_id', userIds),
        ]);
        const realMap = new Map<string, string>();
        (sps as any[] || []).forEach((s: any) => { if (s.real_name) realMap.set(s.user_id, s.real_name); });
        (pr || []).forEach((p: any) => {
          pMap.set(p.user_id, realMap.get(p.user_id) || p.display_name || '店员');
        });
        realMap.forEach((name, uid) => { if (!pMap.has(uid)) pMap.set(uid, name); });
      }

      setMine((my as any) || []);
      setAllInRange(allRows);
      setShifts(sMap);
      setProfiles(pMap);
      setLoading(false);
    })();
  }, [user]);

  const summary = useMemo(() => ({ work: mine.length, off: 30 - mine.length }), [mine]);

  // 每天 → 同店按班次分组的同事(排除自己;A→B→C→其它)
  const peersByDate = useMemo(() => {
    const map = new Map<string, { code: string; names: string[] }[]>();
    const byDate = new Map<string, Map<string, Set<string>>>();
    allInRange.forEach((r) => {
      if (!r.user_id || r.user_id === user?.id) return;
      const code = (r.shift_code || '').toUpperCase();
      if (!byDate.has(r.work_date)) byDate.set(r.work_date, new Map());
      const codeMap = byDate.get(r.work_date)!;
      if (!codeMap.has(code)) codeMap.set(code, new Set());
      const name = profiles.get(r.user_id) || '店员';
      codeMap.get(code)!.add(name);
    });
    const codeOrder = (c: string) => (c === 'A' ? 0 : c === 'B' ? 1 : c === 'C' ? 2 : 3);
    byDate.forEach((codeMap, date) => {
      const groups = Array.from(codeMap.entries())
        .sort((a, b) => codeOrder(a[0]) - codeOrder(b[0]) || a[0].localeCompare(b[0]))
        .map(([code, names]) => ({ code, names: Array.from(names).sort() }));
      map.set(date, groups);
    });
    return map;
  }, [allInRange, profiles, user?.id]);

  const codeColor = (c: string) =>
    c === 'A' ? 'text-amber-600 dark:text-amber-400' :
    c === 'B' ? 'text-sky-600 dark:text-sky-400' :
    c === 'C' ? 'text-rose-600 dark:text-rose-400' :
    'text-muted-foreground';

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <p className="text-xs text-muted-foreground">未来 30 天</p>
        <p className="text-sm">
          上班 <span className="font-semibold text-foreground">{summary.work}</span> 天 ·
          休息 <span className="font-semibold text-foreground">{summary.off}</span> 天
        </p>
      </Card>

      <div className="space-y-2">
        {days.map((d) => {
          const myRow = mine.find(x => x.work_date === d);
          const s = myRow ? shifts.get(myRow.shift_code) : null;
          const groups = peersByDate.get(d) || [];
          const isTomorrow = d === tomorrow;
          return (
            <Card
              key={d}
              className={cn('p-3', !myRow && 'bg-muted/30')}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'shrink-0 w-14 flex flex-col items-center',
                    isTomorrow && 'bg-foreground text-background rounded-lg py-2 px-1',
                  )}
                >
                  {isTomorrow && (
                    <div className="text-base font-bold leading-tight mb-1">明天</div>
                  )}
                  <div className={cn(
                    'text-base font-semibold tabular-nums',
                    isTomorrow && 'text-background text-sm',
                  )}>
                    {shortDateLabel(d)}
                  </div>
                  <div className={cn('text-xs', isTomorrow ? 'text-background/70' : 'text-muted-foreground')}>
                    {weekdayLabel(d)}
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {myRow && s ? (
                      <>
                        <span className="px-1.5 py-0.5 rounded text-[11px] text-white font-medium"
                          style={{ background: s.color || '#f59e0b' }}>{myRow.shift_code}</span>
                        <span className="text-sm font-medium tabular-nums">
                          {formatShiftTime(s.start_time, s.end_time)}
                        </span>
                        <span className="text-xs truncate text-muted-foreground">
                          {s.name}
                        </span>
                      </>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-widest bg-secondary text-secondary-foreground">
                        休息
                      </span>
                    )}
                  </div>
                  {groups.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground/70">
                      门店当日无排班
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {groups.map(g => (
                        <div key={g.code} className="text-[11px] leading-snug">
                          <span className={cn('font-bold mr-1', codeColor(g.code))}>{g.code} 班</span>
                          <span className="text-muted-foreground">
                            · {g.names.join('、')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );

        })}
      </div>
    </div>
  );
}
