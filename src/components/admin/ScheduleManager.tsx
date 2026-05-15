import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, ChevronLeft, ChevronRight, Sparkles, Eraser, Settings2, Plus, X, Store, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  todayISO, weekStartISO, weekDays, addDaysISO, weekdayLabel, shortDateLabel, formatShiftTime, buildUserColorMap,
} from '@/lib/scheduleUtils';
import { StaffProfileDialog } from './StaffProfileDialog';
import { cn } from '@/lib/utils';

interface Shift { code: string; name: string; start_time: string; end_time: string; color: string | null; sort_order: number; shop_id?: string | null }
interface Sched { id?: string; work_date: string; shift_code: string; user_id: string; source?: string; shop_id?: string | null }
interface User {
  user_id: string;
  display_name: string;
  allowed_shop_ids?: string[];
  shop_id?: string | null;
  available_weekdays?: number[];
  blocked_weekdays?: number[];
  blocked_shifts?: string[];
  max_per_week?: number;
  day_offs?: string[];
}
interface Shop { id: string; name: string }

export function ScheduleManager() {
  const [weekStart, setWeekStart] = useState(() => weekStartISO(todayISO()));
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState<string>('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [scheds, setScheds] = useState<Sched[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [profileFor, setProfileFor] = useState<User | null>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [swapFirst, setSwapFirst] = useState<Sched | null>(null);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  // 同门店所有出现的员工（含已排但已离开列表的用户）按稳定顺序生成唯一颜色
  const userColorMap = useMemo(() => {
    const ids = [
      ...users.map(u => u.user_id),
      ...scheds.map(s => s.user_id).filter(id => !users.find(u => u.user_id === id)),
    ];
    return buildUserColorMap(ids);
  }, [users, scheds]);
  const colorOf = (uid: string) => userColorMap.get(uid) || { bg: 'hsl(0 0% 92%)', fg: 'hsl(0 0% 25%)', border: 'hsl(0 0% 75%)' };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('shops' as any).select('id, name').eq('active', true).order('sort_order').order('name');
      const list = (data as any) || [];
      setShops(list);
      if (list.length && !shopId) setShopId(list[0].id);
    })();
  }, []);

  const refresh = async () => {
    if (!shopId) { setLoading(false); return; }
    setLoading(true);
    const end = addDaysISO(weekStart, 6);
    const [{ data: s }, { data: sc }, { data: roles }, { data: profs }] = await Promise.all([
      supabase.from('shop_shifts' as any).select('*').eq('active', true).or(`shop_id.eq.${shopId},shop_id.is.null`).order('sort_order'),
      supabase.from('shift_schedules' as any).select('*').eq('shop_id', shopId).gte('work_date', weekStart).lte('work_date', end),
      supabase.from('user_roles').select('user_id').eq('suspended', false),
      supabase.from('staff_profiles' as any).select('user_id, allowed_shop_ids, shop_id, real_name, available_weekdays, blocked_weekdays, blocked_shifts, max_per_week'),
    ]);
    const userIds = (roles || []).map((r: any) => r.user_id);
    const profMap = new Map<string, any>();
    (profs || []).forEach((p: any) => profMap.set(p.user_id, p));
    const { data: dayOffs } = userIds.length
      ? await supabase.from('staff_day_offs' as any).select('user_id, off_date, shop_id').in('user_id', userIds).gte('off_date', weekStart).lte('off_date', end)
      : { data: [] as any[] };
    const dayOffMap = new Map<string, string[]>();
    (dayOffs || []).forEach((o: any) => {
      if (o.shop_id && o.shop_id !== shopId) return;
      const arr = dayOffMap.get(o.user_id) || [];
      arr.push(o.off_date);
      dayOffMap.set(o.user_id, arr);
    });
    let usrs: User[] = [];
    if (userIds.length) {
      const { data: pr } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
      usrs = (pr || []).map((p: any) => {
        const sp = profMap.get(p.user_id) || {};
        return {
          user_id: p.user_id,
          display_name: (sp.real_name && String(sp.real_name).trim()) || p.display_name || '店员',
          allowed_shop_ids: sp.allowed_shop_ids || [],
          shop_id: sp.shop_id || null,
          available_weekdays: sp.available_weekdays || [0,1,2,3,4,5,6],
          blocked_weekdays: sp.blocked_weekdays || [],
          blocked_shifts: sp.blocked_shifts || [],
          max_per_week: sp.max_per_week ?? 5,
          day_offs: dayOffMap.get(p.user_id) || [],
        };
      });
      usrs = usrs.filter(u =>
        (u.allowed_shop_ids && u.allowed_shop_ids.length === 0 && !u.shop_id)
        || (u.allowed_shop_ids && u.allowed_shop_ids.includes(shopId))
        || u.shop_id === shopId
      );
    }
    setShifts((s as any) || []);
    setScheds((sc as any) || []);
    setUsers(usrs);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, [weekStart, shopId]);

  const dowOf = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  };

  const weekCountOf = (userId: string, excludeDate?: string) =>
    scheds.filter(r => r.user_id === userId && r.work_date !== excludeDate).length;

  const validateAssign = (date: string, code: string, user: User, opts: { ignoreMax?: boolean } = {}): { hard: string[]; soft: string[] } => {
    const hard: string[] = [];
    const soft: string[] = [];
    const wd = dowOf(date);
    if (user.available_weekdays && !user.available_weekdays.includes(wd)) {
      soft.push(`${user.display_name} 的可上班星期不包含 ${weekdayLabel(date)}`);
    }
    if (user.blocked_weekdays && user.blocked_weekdays.includes(wd)) {
      soft.push(`${user.display_name} 的固定休息日是 ${weekdayLabel(date)}`);
    }
    if (user.blocked_shifts && user.blocked_shifts.includes(code)) {
      soft.push(`${user.display_name} 不排该班次`);
    }
    if (user.day_offs && user.day_offs.includes(date)) {
      soft.push(`${user.display_name} 当天为禁排日`);
    }
    if (!opts.ignoreMax) {
      const cnt = weekCountOf(user.user_id, date);
      const cap = typeof user.max_per_week === 'number' ? user.max_per_week : 5;
      if (cnt + 1 > Math.min(cap, 5)) {
        hard.push(`${user.display_name} 本周已排 ${cnt} 天，已达上限 ${Math.min(cap, 5)} 天（每周最多 5 天）`);
      }
    }
    return { hard, soft };
  };

  const addAssign = async (date: string, code: string, userId: string) => {
    const user = users.find(u => u.user_id === userId);
    if (user) {
      const { hard, soft } = validateAssign(date, code, user);
      if (hard.length) { toast.error(hard.join('；')); return; }
      if (soft.length) {
        const msg = `该排班违反以下规则：\n\n• ${soft.join('\n• ')}\n\n确定要强制排班吗？`;
        if (!window.confirm(msg)) { toast.error('已取消，未排班'); return; }
        toast.warning('已强制排班，已忽略规则限制');
      }
    }
    const exists = scheds.find(r => r.work_date === date && r.user_id === userId);
    if (exists) {
      const { error } = await supabase.from('shift_schedules' as any).update({ shift_code: code, source: 'manual', shop_id: shopId }).eq('id', exists.id);
      if (error) { toast.error('排班失败：' + error.message); return; }
      setScheds(prev => prev.map(r => r.id === exists.id ? { ...r, shift_code: code, source: 'manual', shop_id: shopId } : r));
    } else {
      const { data, error } = await supabase.from('shift_schedules' as any)
        .insert({ work_date: date, shift_code: code, user_id: userId, source: 'manual', shop_id: shopId })
        .select().single();
      if (error) { toast.error('排班失败：' + error.message); return; }
      setScheds(prev => [...prev, data as any]);
    }
  };

  const removeAssign = async (id?: string) => {
    if (!id) return;
    const { error } = await supabase.from('shift_schedules' as any).delete().eq('id', id);
    if (error) { toast.error('删除失败：' + error.message); return; }
    setScheds(prev => prev.filter(r => r.id !== id));
  };

  const clearWeek = async () => {
    if (!confirm('确认清空该门店本周所有排班？')) return;
    const { error } = await supabase.from('shift_schedules' as any).delete().eq('shop_id', shopId).gte('work_date', weekStart).lte('work_date', addDaysISO(weekStart, 6));
    if (error) { toast.error('清空失败：' + error.message); return; }
    setScheds([]);
  };

  const aiGenerate = async () => {
    if (!shopId) { toast.error('请先选择门店'); return; }
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-schedule', {
        body: { week_start: weekStart, shop_id: shopId, overwrite: false },
      });
      if (error) throw error;
      toast.success(`AI 排班完成，新增 ${data?.count ?? 0} 条（仅填补空缺）`);
      refresh();
    } catch (e: any) {
      toast.error('AI 排班失败：' + (e?.message || String(e)));
    } finally {
      setAiBusy(false);
    }
  };

  const toggleSwap = () => {
    setSwapMode(v => !v);
    setSwapFirst(null);
  };

  const handleChipClick = async (r: Sched) => {
    if (!swapMode) return;
    if (!swapFirst) { setSwapFirst(r); return; }
    if (swapFirst.id === r.id) { setSwapFirst(null); return; }
    if (swapFirst.user_id === r.user_id) {
      toast.error('两个班次属于同一员工，无需互换');
      setSwapFirst(null);
      return;
    }
    const a = swapFirst, b = r;
    const userA = users.find(u => u.user_id === a.user_id);
    const userB = users.find(u => u.user_id === b.user_id);
    // 互换后：A 的位置变成 B 的人，反之亦然。校验时排除原日期防止重复计数。
    const issues: string[] = [];
    if (userB) {
      const v = validateAssign(a.work_date, a.shift_code, userB, { ignoreMax: true });
      issues.push(...v.soft, ...v.hard);
    }
    if (userA) {
      const v = validateAssign(b.work_date, b.shift_code, userA, { ignoreMax: true });
      issues.push(...v.soft, ...v.hard);
    }
    const confirmMsg = `换班：\n• ${userA?.display_name} 的「${a.work_date} ${a.shift_code}」\n  ↔\n• ${userB?.display_name} 的「${b.work_date} ${b.shift_code}」\n\n${issues.length ? '注意违规：\n• ' + issues.join('\n• ') + '\n\n' : ''}确认互换？`;
    if (!window.confirm(confirmMsg)) { setSwapFirst(null); return; }

    // 用临时 user_id 规避 (work_date,user_id) 唯一约束冲突
    const tmpUid = '00000000-0000-0000-0000-000000000000';
    const { error: e1 } = await supabase.from('shift_schedules' as any).update({ user_id: tmpUid }).eq('id', a.id);
    if (e1) { toast.error('换班失败：' + e1.message); setSwapFirst(null); return; }
    const { error: e2 } = await supabase.from('shift_schedules' as any).update({ user_id: a.user_id }).eq('id', b.id);
    if (e2) { toast.error('换班失败：' + e2.message); setSwapFirst(null); return; }
    const { error: e3 } = await supabase.from('shift_schedules' as any).update({ user_id: b.user_id }).eq('id', a.id);
    if (e3) { toast.error('换班失败：' + e3.message); setSwapFirst(null); return; }

    setScheds(prev => prev.map(x => {
      if (x.id === a.id) return { ...x, user_id: b.user_id };
      if (x.id === b.id) return { ...x, user_id: a.user_id };
      return x;
    }));
    setSwapFirst(null);
    toast.success('已互换');
  };

  const cell = (date: string, code: string) => {
    const list = scheds.filter(r => r.work_date === date && r.shift_code === code);
    const usedToday = scheds.filter(r => r.work_date === date).map(r => r.user_id);
    const candidates = users.filter(u => !usedToday.includes(u.user_id));
    return (
      <div className="flex flex-wrap gap-1 items-center min-h-7">
        {list.map(r => {
          const u = users.find(x => x.user_id === r.user_id);
          const c = colorOf(r.user_id);
          const selected = swapFirst?.id === r.id;
          return (
            <span
              key={r.id}
              onClick={() => swapMode && handleChipClick(r)}
              style={{ background: c.bg, color: c.fg, borderColor: r.source === 'ai' ? 'hsl(38 95% 55%)' : c.border }}
              className={cn(
                'text-[11px] rounded pl-1.5 pr-0.5 py-0.5 flex items-center gap-0.5 border',
                r.source === 'ai' && 'border-2',
                swapMode && 'cursor-pointer hover:ring-2 hover:ring-primary/50',
                selected && 'ring-2 ring-primary',
              )}
            >
              {u?.display_name || '店员'}
              {!swapMode && (
                <button onClick={(e) => { e.stopPropagation(); removeAssign(r.id); }} className="hover:bg-black/10 rounded p-0.5"><X className="w-3 h-3" /></button>
              )}
            </span>
          );
        })}
        {!swapMode && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="w-6 h-6 rounded-full border border-dashed border-border/80 text-muted-foreground hover:bg-muted flex items-center justify-center"><Plus className="w-3 h-3" /></button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1">
              {candidates.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-1.5">无可选员工</p>
              ) : candidates.map(u => {
                const cnt = weekCountOf(u.user_id);
                const cap = Math.min(typeof u.max_per_week === 'number' ? u.max_per_week : 5, 5);
                const full = cnt >= cap;
                const c = colorOf(u.user_id);
                return (
                  <button
                    key={u.user_id}
                    disabled={full}
                    onClick={() => addAssign(date, code, u.user_id)}
                    className={cn('w-full text-left px-2 py-1.5 text-sm rounded flex items-center gap-2', full ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted')}
                  >
                    <span className="w-3 h-3 rounded-full border" style={{ background: c.bg, borderColor: c.border }} />
                    <span className="flex-1">{u.display_name}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{cnt}/{cap}</span>
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 mr-1">
          <Store className="w-4 h-4 text-muted-foreground" />
          <Select value={shopId} onValueChange={setShopId}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="选择门店" /></SelectTrigger>
            <SelectContent>
              {shops.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(addDaysISO(weekStart, -7))}><ChevronLeft className="w-4 h-4" /></Button>
        <div className="text-sm font-medium tabular-nums px-2">
          {shortDateLabel(weekStart)} – {shortDateLabel(addDaysISO(weekStart, 6))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(addDaysISO(weekStart, 7))}><ChevronRight className="w-4 h-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(weekStartISO(todayISO()))}>本周</Button>
        <div className="flex-1" />
        <Button size="sm" onClick={aiGenerate} disabled={aiBusy || !shopId || swapMode}>
          {aiBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
          AI 智能排班
        </Button>
        <Button variant={swapMode ? 'default' : 'outline'} size="sm" onClick={toggleSwap} disabled={!shopId}>
          <ArrowLeftRight className="w-4 h-4 mr-1" />{swapMode ? '退出换班' : '换班'}
        </Button>
        <Button variant="outline" size="sm" onClick={clearWeek} disabled={!shopId || swapMode}><Eraser className="w-4 h-4 mr-1" />清空本周</Button>
      </div>

      {swapMode && (
        <Card className="p-2 text-xs bg-primary/5 border-primary/30">
          换班模式：{swapFirst ? '请点击第二个要互换的班次' : '请点击第一个要互换的班次'}
        </Card>
      )}

      {!shopId ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">请先在「门店管理」创建门店</Card>
      ) : loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : shifts.length === 0 ? (
        <Card className="p-6 text-sm text-center space-y-2">
          <p className="text-muted-foreground">{shops.find(s => s.id === shopId)?.name || '该门店'} 还未配置班次。</p>
          <p className="text-xs text-muted-foreground">请到上方「班次设置」标签页为该店新增班次后再进行排班。</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="text-left p-2 text-xs font-medium text-muted-foreground w-20">日期</th>
                {shifts.map(s => (
                  <th key={s.code} className="text-left p-2 text-xs font-medium">
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: s.color || '#f59e0b' }} />{s.name}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums font-normal">{formatShiftTime(s.start_time, s.end_time)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(d => (
                <tr key={d} className="border-b border-border/40">
                  <td className="p-2 text-xs align-top"><div className="font-medium tabular-nums">{shortDateLabel(d)}</div><div className="text-muted-foreground">{weekdayLabel(d)}</div></td>
                  {shifts.map(s => <td key={s.code} className="p-2 align-top">{cell(d, s.code)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5"><Settings2 className="w-4 h-4" />员工排班属性</h3>
          <p className="text-xs text-muted-foreground">点击员工可设置门店、禁排日、不排班次等</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {users.length === 0 && <p className="text-xs text-muted-foreground">该门店暂无可排员工，请在员工资料中将"可上班门店"包含本店</p>}
          {users.map(u => {
            const c = colorOf(u.user_id);
            const cnt = weekCountOf(u.user_id);
            const cap = Math.min(typeof u.max_per_week === 'number' ? u.max_per_week : 5, 5);
            return (
              <Button key={u.user_id} variant="outline" size="sm" onClick={() => setProfileFor(u)} className="gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full border" style={{ background: c.bg, borderColor: c.border }} />
                {u.display_name}
                <span className="text-[10px] tabular-nums text-muted-foreground">{cnt}/{cap}</span>
              </Button>
            );
          })}
        </div>
      </Card>

      {profileFor && (
        <StaffProfileDialog
          open={!!profileFor}
          onOpenChange={(o) => !o && setProfileFor(null)}
          userId={profileFor.user_id}
          displayName={profileFor.display_name}
          shifts={shifts}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
