import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import {
  todayISO, addDaysISO, weekdayLabel, shortDateLabel, formatShiftTime,
} from '@/lib/scheduleUtils';

interface Shift { code: string; name: string; start_time: string; end_time: string; color: string | null }
interface Sched { work_date: string; shift_code: string; user_id: string; shop_id: string | null }

export function MyScheduleList() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<Sched[]>([]);
  const [allInRange, setAllInRange] = useState<Sched[]>([]);
  const [shifts, setShifts] = useState<Map<string, Shift>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [shopId, setShopId] = useState<string | null>(null);

  const start = todayISO();
  const end = addDaysISO(start, 29);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      // 我的 shop
      const { data: sp } = await supabase
        .from('staff_profiles' as any)
        .select('shop_id')
        .eq('user_id', user.id)
        .maybeSingle();
      let sid: string | null = (sp as any)?.shop_id ?? null;
      if (!sid) {
        const { data: anyShop } = await supabase
          .from('shops' as any).select('id').order('sort_order').limit(1).maybeSingle();
        sid = (anyShop as any)?.id ?? null;
      }
      setShopId(sid);

      // 我的排班
      const { data: my } = await supabase
        .from('shift_schedules' as any)
        .select('work_date, shift_code, user_id, shop_id')
        .eq('user_id', user.id)
        .gte('work_date', start).lte('work_date', end)
        .order('work_date');

      // 同店全部排班 (用于查同事)
      let allRows: any[] = [];
      if (sid) {
        const { data } = await supabase
          .from('shift_schedules' as any)
          .select('work_date, shift_code, user_id, shop_id')
          .eq('shop_id', sid)
          .gte('work_date', start).lte('work_date', end);
        allRows = data || [];
      }

      // shifts
      const { data: sh } = await supabase
        .from('shop_shifts' as any).select('code, name, start_time, end_time, color').eq('active', true);
      const sMap = new Map<string, Shift>();
      (sh || []).forEach((s: any) => sMap.set(s.code, s));

      // 同事 profiles：优先使用真实姓名（staff_profiles.real_name），否则回退到 display_name
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
        // 兜底：profiles 缺失但 staff_profiles 有
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

      {mine.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">近 30 天暂无排班</Card>
      ) : (
        <div className="space-y-2">
          {mine.map((r) => {
            const s = shifts.get(r.shift_code);
            const colleagues = allInRange
              .filter(x => x.work_date === r.work_date && x.user_id !== user?.id);
            return (
              <Card key={r.work_date} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-14">
                    <div className="text-base font-semibold tabular-nums">{shortDateLabel(r.work_date)}</div>
                    <div className="text-xs text-muted-foreground">{weekdayLabel(r.work_date)}</div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {s ? (
                        <>
                          <span className="px-1.5 py-0.5 rounded text-[11px] text-white font-medium"
                            style={{ background: s.color || '#f59e0b' }}>{r.shift_code}</span>
                          <span className="text-sm font-medium tabular-nums">{formatShiftTime(s.start_time, s.end_time)}</span>
                          <span className="text-xs text-muted-foreground truncate">{s.name}</span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">{r.shift_code}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[11px] text-muted-foreground shrink-0">同班同事</span>
                      {colleagues.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground/70">仅我一人</span>
                      ) : colleagues.map(c => {
                        const cs = shifts.get(c.shift_code);
                        return (
                          <span key={c.user_id + c.shift_code}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-muted flex items-center gap-1"
                            title={cs ? `${cs.name} ${formatShiftTime(cs.start_time, cs.end_time)}` : c.shift_code}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cs?.color || '#f59e0b' }} />
                            {profiles.get(c.user_id) || '店员'}
                            <span className="text-muted-foreground/70">{c.shift_code}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
