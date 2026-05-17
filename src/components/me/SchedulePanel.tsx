import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarDays, MapPin, Loader2, Coffee } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { todayISO, addDaysISO, formatShiftTime, shortDateLabel, weekdayLabel } from '@/lib/scheduleUtils';
import { cn } from '@/lib/utils';

interface Shift { code: string; name: string; start_time: string; end_time: string; color: string | null }
interface Sched { work_date: string; shift_code: string; user_id: string }

export function SchedulePanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<Sched[]>([]);
  const [allRows, setAllRows] = useState<Sched[]>([]);
  const [shiftsMap, setShiftsMap] = useState<Map<string, Shift>>(new Map());
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [shopName, setShopName] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const start = todayISO();
  const tomorrow = addDaysISO(start, 1);
  const end = addDaysISO(start, 29);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      // 1) staff profile → shop id
      const { data: sp } = await supabase
        .from('staff_profiles' as any).select('shop_id').eq('user_id', user.id).maybeSingle();
      let sid: string | null = (sp as any)?.shop_id ?? null;
      let sname: string | null = null;
      if (sid) {
        const { data: shop } = await supabase.from('shops' as any).select('name').eq('id', sid).maybeSingle();
        sname = (shop as any)?.name ?? null;
      } else {
        const { data: any1 } = await supabase
          .from('shops' as any).select('id, name').order('sort_order').limit(1).maybeSingle();
        sid = (any1 as any)?.id ?? null;
        sname = (any1 as any)?.name ?? null;
      }
      setShopName(sname);

      // 2) batch
      const [{ data: myRows }, { data: shopRows }, { data: sh }] = await Promise.all([
        supabase.from('shift_schedules' as any)
          .select('work_date, shift_code, user_id')
          .eq('user_id', user.id)
          .gte('work_date', start).lte('work_date', end)
          .order('work_date'),
        sid ? supabase.from('shift_schedules' as any)
          .select('work_date, shift_code, user_id')
          .eq('shop_id', sid)
          .gte('work_date', start).lte('work_date', end)
          : Promise.resolve({ data: [] as any[] } as any),
        supabase.from('shop_shifts' as any).select('code, name, start_time, end_time, color').eq('active', true),
      ]);

      const sMap = new Map<string, Shift>();
      (sh as any[] || []).forEach(s => sMap.set(s.code, s));

      const peerIds = Array.from(new Set(((shopRows as any[]) || [])
        .map(r => r.user_id).filter((id: string) => id && id !== user.id)));
      const pMap = new Map<string, string>();
      if (peerIds.length) {
        const [{ data: pr }, { data: sps }] = await Promise.all([
          supabase.from('profiles').select('user_id, display_name').in('user_id', peerIds),
          supabase.from('staff_profiles' as any).select('user_id, real_name').in('user_id', peerIds),
        ]);
        const realMap = new Map<string, string>();
        (sps as any[] || []).forEach((s: any) => { if (s.real_name) realMap.set(s.user_id, s.real_name); });
        (pr as any[] || []).forEach((p: any) => {
          pMap.set(p.user_id, realMap.get(p.user_id) || p.display_name || '店员');
        });
        realMap.forEach((n, uid) => { if (!pMap.has(uid)) pMap.set(uid, n); });
      }

      setMine((myRows as any) || []);
      setAllRows((shopRows as any) || []);
      setShiftsMap(sMap);
      setNameMap(pMap);
      setLoading(false);
    })();
  }, [user]);

  const todayRow = useMemo(() => mine.find(r => r.work_date === start), [mine, start]);
  const tomorrowRow = useMemo(() => mine.find(r => r.work_date === tomorrow), [mine, tomorrow]);
  const todayShift = todayRow ? shiftsMap.get(todayRow.shift_code) : null;
  const tomorrowShift = tomorrowRow ? shiftsMap.get(tomorrowRow.shift_code) : null;
  const todayPeerCount = useMemo(
    () => allRows.filter(r => r.work_date === start && r.user_id !== user?.id).length,
    [allRows, start, user?.id]
  );

  const displayList = useMemo(() => {
    // 未来 30 天：以 mine 为骨架，没排到的日子也展示一条"休"，这样能看到节奏
    return Array.from({ length: 30 }, (_, i) => {
      const date = addDaysISO(start, i);
      const r = mine.find(x => x.work_date === date) || null;
      const peers = allRows
        .filter(x => x.work_date === date && r && x.shift_code === r.shift_code && x.user_id !== user?.id);
      return { date, row: r, peers };
    });
  }, [mine, allRows, start, user?.id]);

  const shown = showAll ? displayList : displayList.slice(0, 7);
  const workDays = mine.length;

  if (loading) {
    return (
      <Card className="p-6 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const TodayCard = ({ label, row, shift }: { label: string; row: Sched | undefined; shift: Shift | null | undefined }) => (
    <div className={cn(
      'rounded-xl p-3 border transition-colors',
      row && shift ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30'
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] tracking-[0.2em] text-muted-foreground">{label}</span>
        {row && shift ? (
          <span
            className="text-[11px] px-1.5 py-0.5 rounded text-white font-bold"
            style={{ background: shift.color || '#f59e0b' }}
          >
            {shift.code}
          </span>
        ) : (
          <Coffee className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </div>
      {row && shift ? (
        <>
          <p className="text-sm font-semibold truncate">{shift.name}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
            {formatShiftTime(shift.start_time, shift.end_time)}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-muted-foreground">休息</p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">—</p>
        </>
      )}
    </div>
  );

  return (
    <Card className="p-4 space-y-4">
      {/* 头部 */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
          <CalendarDays className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">我的排班</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
            {shopName && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="w-3 h-3" />{shopName}
              </span>
            )}
            <span>未来 30 天上班 <span className="text-foreground font-medium">{workDays}</span> 天</span>
          </div>
        </div>
      </div>

      {/* 今日 / 明日 大卡 */}
      <div className="grid grid-cols-2 gap-2">
        <TodayCard label="今日" row={todayRow} shift={todayShift} />
        <TodayCard label="明日" row={tomorrowRow} shift={tomorrowShift} />
      </div>
      {todayRow && (
        <p className="text-[11px] text-muted-foreground -mt-2">
          今日同店共 {todayPeerCount + 1} 人在岗
        </p>
      )}

      {/* 30 天列表 */}
      <div className="space-y-1">
        <div className="text-[11px] tracking-[0.18em] text-muted-foreground pt-1">未来 30 天</div>
        <div className="divide-y divide-border/60">
          {shown.map(({ date, row, peers }) => {
            const s = row ? shiftsMap.get(row.shift_code) : null;
            const isToday = date === start;
            const isTomorrow = date === tomorrow;
            return (
              <div key={date} className={cn(
                'flex items-center gap-2 py-2 text-[12px]',
                isToday && 'font-medium'
              )}>
                <div className="w-14 shrink-0 text-muted-foreground tabular-nums">
                  {shortDateLabel(date)}
                  <span className="ml-1 text-[10px]">{weekdayLabel(date).replace('周', '')}</span>
                  {isToday && <span className="ml-1 text-[9px] text-primary">今</span>}
                  {isTomorrow && <span className="ml-1 text-[9px] text-accent">明</span>}
                </div>
                {row && s ? (
                  <>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] text-white font-medium shrink-0"
                      style={{ background: s.color || '#f59e0b' }}
                    >
                      {s.code}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      {formatShiftTime(s.start_time, s.end_time)}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate flex-1 text-right">
                      {peers.length === 0
                        ? '仅我'
                        : '同班 ' + peers.slice(0, 3).map(p => nameMap.get(p.user_id) || '店员').join('、')
                          + (peers.length > 3 ? ` 等${peers.length}人` : '')}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] text-muted-foreground/70 flex-1">休</span>
                )}
              </div>
            );
          })}
        </div>
        {displayList.length > 7 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-[11px] text-muted-foreground"
            onClick={() => setShowAll(v => !v)}
          >
            {showAll ? '收起' : `展开全部 30 天`}
          </Button>
        )}
      </div>
    </Card>
  );
}
