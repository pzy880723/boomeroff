import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarDays, ChevronDown, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { todayISO, addDaysISO, formatShiftTime, weekdayLabel } from '@/lib/scheduleUtils';
import { cn } from '@/lib/utils';

interface Shift { code: string; name: string; start_time: string; end_time: string }
interface Sched { work_date: string; shift_code: string; user_id: string; shop_id: string | null }

type DayItem = {
  date: string;
  row: Sched | null;
  shift: Shift | null;
  shopName: string | null;
};

export function SchedulePanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<Sched[]>([]);
  const [allRows, setAllRows] = useState<Sched[]>([]);
  const [shiftsMap, setShiftsMap] = useState<Map<string, Shift>>(new Map());
  const [shopNameMap, setShopNameMap] = useState<Map<string, string>>(new Map());
  const [peerNameMap, setPeerNameMap] = useState<Map<string, string>>(new Map());
  const [defaultShopName, setDefaultShopName] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const start = todayISO();
  const end = addDaysISO(start, 29);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      const { data: sp } = await supabase
        .from('staff_profiles' as any).select('shop_id').eq('user_id', user.id).maybeSingle();
      const defaultSid: string | null = (sp as any)?.shop_id ?? null;

      const [{ data: myRows }, { data: shopRows }, { data: sh }, { data: shops }] = await Promise.all([
        supabase.from('shift_schedules' as any)
          .select('work_date, shift_code, user_id, shop_id')
          .eq('user_id', user.id)
          .gte('work_date', start).lte('work_date', end)
          .order('work_date'),
        defaultSid ? supabase.from('shift_schedules' as any)
          .select('work_date, shift_code, user_id, shop_id')
          .eq('shop_id', defaultSid)
          .gte('work_date', start).lte('work_date', end)
          : Promise.resolve({ data: [] as any[] } as any),
        supabase.from('shop_shifts' as any).select('code, name, start_time, end_time').eq('active', true),
        supabase.from('shops' as any).select('id, name'),
      ]);

      const sMap = new Map<string, Shift>();
      (sh as any[] || []).forEach(s => sMap.set(s.code, s));

      const shMap = new Map<string, string>();
      (shops as any[] || []).forEach((s: any) => shMap.set(s.id, s.name));
      setDefaultShopName(defaultSid ? shMap.get(defaultSid) || null : null);

      const peerIds = Array.from(new Set(((shopRows as any[]) || [])
        .map((r: any) => r.user_id).filter((id: string) => id && id !== user.id)));
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
      setShopNameMap(shMap);
      setPeerNameMap(pMap);
      setLoading(false);
    })();
  }, [user]);

  const days: DayItem[] = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => {
      const date = addDaysISO(start, i);
      const row = mine.find(x => x.work_date === date) || null;
      const shift = row ? shiftsMap.get(row.shift_code) || null : null;
      const shopName = row?.shop_id ? shopNameMap.get(row.shop_id) || null : null;
      return { date, row, shift, shopName };
    }), [mine, shiftsMap, shopNameMap, start]);

  // 每天 → 按班次分组的同事姓名（排除自己；A→B→C→其它）
  const peersByDate = useMemo(() => {
    const map = new Map<string, { code: string; names: string[] }[]>();
    const byDate = new Map<string, Map<string, Set<string>>>();
    allRows.forEach((r) => {
      if (!r.user_id || r.user_id === user?.id) return;
      const code = (r.shift_code || '').toUpperCase();
      if (!byDate.has(r.work_date)) byDate.set(r.work_date, new Map());
      const codeMap = byDate.get(r.work_date)!;
      if (!codeMap.has(code)) codeMap.set(code, new Set());
      const name = peerNameMap.get(r.user_id) || '店员';
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
  }, [allRows, peerNameMap, user?.id]);

  const workDays = mine.length;
  const first3 = days.slice(0, 3);
  const rest = days.slice(3);

  if (loading) {
    return (
      <Card className="p-6 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-primary font-bold text-lg leading-tight">我的排班</h2>
            <p className="text-muted-foreground text-xs mt-0.5">
              未来 30 天上班 <span className="text-primary font-bold">{workDays}</span> 天
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-accent font-bold tracking-widest" style={{ fontFamily: 'Oswald, sans-serif' }}>
            OFFICIAL SCHEDULE
          </p>
          <p className="text-muted-foreground text-[10px] italic">VINTAGE ARCHIVE</p>
        </div>
      </div>

      {/* 3 ticket rows */}
      <div className="px-3 pb-2 space-y-3">
        {first3.map((d, i) => (
          <TicketRow key={d.date} item={d} index={i} peersByCode={peersByDate.get(d.date) || []} />
        ))}
      </div>

      {/* Expanded list */}
      {showAll && (
        <div className="px-3 pb-2 space-y-3 pt-1 border-t border-border">
          {rest.map((d) => (
            <TicketRow key={d.date} item={d} index={-1} peersByCode={peersByDate.get(d.date) || []} />
          ))}
        </div>
      )}

      {/* Toggle */}
      <button
        type="button"
        onClick={() => setShowAll(v => !v)}
        className="w-full py-4 bg-card border-t border-border flex items-center justify-center gap-2 group hover:bg-secondary/60 transition-colors"
      >
        <span className="text-muted-foreground text-xs font-medium group-hover:text-primary">
          {showAll ? '收起' : '展开后续 27 天排班'}
        </span>
        <ChevronDown className={cn(
          'w-4 h-4 text-accent transition-transform',
          showAll && 'rotate-180'
        )} />
      </button>
    </Card>
  );
}

/* ----------------------------- ticket row ----------------------------- */

function TicketRow({ item, index }: { item: DayItem; index: number }) {
  const { date, row, shift, shopName } = item;
  const isWorking = !!row && !!shift;

  // stub bg
  const stubBg = !isWorking
    ? 'bg-secondary'
    : index === 0
      ? 'bg-accent-soft'
      : index === 1
        ? 'bg-primary'
        : 'bg-accent-soft';

  const stubFg = stubBg === 'bg-primary' ? 'text-primary-foreground' : 'text-primary';
  const stubAccent = stubBg === 'bg-primary' ? 'text-accent' : 'text-muted-foreground';

  const topLabel =
    index === 0 ? 'TODAY' :
    index === 1 ? 'NEXT' :
    index === 2 ? 'UPCOMING' :
    weekdayLabel(date).replace('周', 'WK ').toUpperCase();

  const [, m, d] = date.split('-');
  const dateText = `${parseInt(m, 10)}/${parseInt(d, 10)}`;
  const wd = weekdayLabel(date);

  return (
    <div className="relative flex items-stretch h-20 bg-background rounded-lg border border-border overflow-hidden">
      {/* stub */}
      <div className={cn(
        'w-20 flex flex-col items-center justify-center border-r border-dashed relative shrink-0',
        stubBg,
        stubBg === 'bg-primary' ? 'border-accent/30' : 'border-muted-foreground/30'
      )}>
        <span className={cn('text-[10px] font-bold', stubAccent)} style={{ fontFamily: 'Oswald, sans-serif' }}>
          {topLabel}
        </span>
        <span className={cn('text-xl font-bold leading-tight tabular-nums', stubFg)}>{dateText}</span>
        <span className={cn('text-[10px]', stubAccent)}>{wd}</span>
        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-card rounded-full border border-border" />
        <span className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-card rounded-full border border-border" />
      </div>

      {/* body */}
      <div className="flex-1 flex items-center px-4 min-w-0">
        <div className="flex-1 flex items-center gap-3 min-w-0">
          {isWorking ? (
            <>
              <ShiftBadge code={shift!.code} />
              <span className="text-primary text-sm font-bold tabular-nums tracking-tight whitespace-nowrap">
                {formatShiftTime(shift!.start_time, shift!.end_time)}
              </span>
            </>
          ) : (
            <>
              <span className="px-3 py-1 rounded bg-secondary text-secondary-foreground text-xs font-bold tracking-widest">
                休息
              </span>
              <span className="text-muted-foreground text-sm italic">FREE TIME</span>
            </>
          )}
        </div>
        <div className="text-right shrink-0 ml-2 max-w-[40%]">
          <span className="text-muted-foreground text-[10px] block uppercase tracking-tighter">Location</span>
          <span className="text-primary text-xs font-medium truncate block">
            {shopName || '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

function ShiftBadge({ code }: { code: string }) {
  const u = code.toUpperCase();
  const cls =
    u === 'A' ? 'bg-accent text-accent-foreground' :
    u === 'B' ? 'bg-primary text-accent border border-accent/40' :
    u === 'C' ? 'bg-destructive/85 text-destructive-foreground' :
    'bg-secondary text-secondary-foreground';
  return (
    <span className={cn(
      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
      cls
    )}>
      {u}
    </span>
  );
}

/* ----------------------------- peer strip ----------------------------- */

function PeerStrip({
  day, allRows, peerNameMap, defaultShopName, userId,
}: {
  day: DayItem;
  allRows: Sched[];
  peerNameMap: Map<string, string>;
  defaultShopName: string | null;
  userId: string | undefined;
}) {
  const peers = allRows.filter(r => r.work_date === day.date && r.user_id !== userId);
  if (!peers.length) return null;

  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] tracking-[0.18em] text-muted-foreground">今日同店在岗</span>
        {defaultShopName && (
          <span className="text-[10px] text-muted-foreground">{defaultShopName}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {peers.map((p, i) => (
          <span
            key={`${p.user_id}-${i}`}
            className="inline-flex items-center gap-1 text-[11px] text-primary bg-card border border-border rounded-full px-2 py-0.5"
          >
            <span className="font-medium">{peerNameMap.get(p.user_id) || '店员'}</span>
            <span className="text-[10px] text-accent font-bold">{p.shift_code.toUpperCase()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
