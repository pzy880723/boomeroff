import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Loader2, ChevronLeft, ChevronRight, Sparkles, Eraser, Settings2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  todayISO, weekStartISO, weekDays, addDaysISO, weekdayLabel, shortDateLabel, formatShiftTime,
} from '@/lib/scheduleUtils';
import { StaffProfileDialog } from './StaffProfileDialog';
import { cn } from '@/lib/utils';

interface Shift { code: string; name: string; start_time: string; end_time: string; color: string | null; sort_order: number }
interface Sched { id?: string; work_date: string; shift_code: string; user_id: string; source?: string }
interface User { user_id: string; display_name: string }

export function ScheduleManager() {
  const [weekStart, setWeekStart] = useState(() => weekStartISO(todayISO()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [scheds, setScheds] = useState<Sched[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [profileFor, setProfileFor] = useState<User | null>(null);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const refresh = async () => {
    setLoading(true);
    const end = addDaysISO(weekStart, 6);
    const [{ data: s }, { data: sc }, { data: roles }] = await Promise.all([
      supabase.from('shop_shifts' as any).select('*').eq('active', true).order('sort_order'),
      supabase.from('shift_schedules' as any).select('*').gte('work_date', weekStart).lte('work_date', end),
      supabase.from('user_roles').select('user_id').eq('suspended', false),
    ]);
    const userIds = (roles || []).map((r: any) => r.user_id);
    let usrs: User[] = [];
    if (userIds.length) {
      const { data: pr } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
      usrs = (pr || []).map((p: any) => ({ user_id: p.user_id, display_name: p.display_name || '店员' }));
    }
    setShifts((s as any) || []);
    setScheds((sc as any) || []);
    setUsers(usrs);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, [weekStart]);

  const addAssign = async (date: string, code: string, userId: string) => {
    const exists = scheds.find(r => r.work_date === date && r.user_id === userId);
    if (exists) {
      // already assigned this day in another shift — replace
      await supabase.from('shift_schedules' as any).update({ shift_code: code, source: 'manual' }).eq('id', exists.id);
    } else {
      await supabase.from('shift_schedules' as any).insert({ work_date: date, shift_code: code, user_id: userId, source: 'manual' });
    }
    refresh();
  };

  const removeAssign = async (id?: string) => {
    if (!id) return;
    await supabase.from('shift_schedules' as any).delete().eq('id', id);
    refresh();
  };

  const clearWeek = async () => {
    if (!confirm('确认清空本周所有排班？')) return;
    await supabase.from('shift_schedules' as any).delete().gte('work_date', weekStart).lte('work_date', addDaysISO(weekStart, 6));
    refresh();
  };

  const aiGenerate = async () => {
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-schedule', {
        body: { week_start: weekStart, overwrite: true },
      });
      if (error) throw error;
      toast.success(`AI 排班完成，共 ${data?.count ?? 0} 条`);
      refresh();
    } catch (e: any) {
      toast.error('AI 排班失败：' + (e?.message || String(e)));
    } finally {
      setAiBusy(false);
    }
  };

  const cell = (date: string, code: string) => {
    const list = scheds.filter(r => r.work_date === date && r.shift_code === code);
    const usedToday = scheds.filter(r => r.work_date === date).map(r => r.user_id);
    const candidates = users.filter(u => !usedToday.includes(u.user_id));
    return (
      <div className="flex flex-wrap gap-1 items-center min-h-7">
        {list.map(r => {
          const u = users.find(x => x.user_id === r.user_id);
          return (
            <span key={r.id} className={cn('text-[11px] rounded pl-1.5 pr-0.5 py-0.5 flex items-center gap-0.5',
              r.source === 'ai' ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200' : 'bg-muted')}>
              {u?.display_name || '店员'}
              <button onClick={() => removeAssign(r.id)} className="hover:bg-black/10 rounded p-0.5"><X className="w-3 h-3" /></button>
            </span>
          );
        })}
        <Popover>
          <PopoverTrigger asChild>
            <button className="w-6 h-6 rounded-full border border-dashed border-border/80 text-muted-foreground hover:bg-muted flex items-center justify-center"><Plus className="w-3 h-3" /></button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1">
            {candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-1.5">无可选员工</p>
            ) : candidates.map(u => (
              <button key={u.user_id} onClick={() => addAssign(date, code, u.user_id)}
                className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded">
                {u.display_name}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setWeekStart(addDaysISO(weekStart, -7))}><ChevronLeft className="w-4 h-4" /></Button>
        <div className="text-sm font-medium tabular-nums px-2">
          {shortDateLabel(weekStart)} – {shortDateLabel(addDaysISO(weekStart, 6))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(addDaysISO(weekStart, 7))}><ChevronRight className="w-4 h-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(weekStartISO(todayISO()))}>本周</Button>
        <div className="flex-1" />
        <Button size="sm" onClick={aiGenerate} disabled={aiBusy}>
          {aiBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
          AI 智能排班
        </Button>
        <Button variant="outline" size="sm" onClick={clearWeek}><Eraser className="w-4 h-4 mr-1" />清空本周</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
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
        </div>
        <div className="flex flex-wrap gap-2">
          {users.map(u => (
            <Button key={u.user_id} variant="outline" size="sm" onClick={() => setProfileFor(u)}>{u.display_name}</Button>
          ))}
        </div>
      </Card>

      {profileFor && (
        <StaffProfileDialog
          open={!!profileFor}
          onOpenChange={(o) => !o && setProfileFor(null)}
          userId={profileFor.user_id}
          displayName={profileFor.display_name}
          shifts={shifts}
        />
      )}
    </div>
  );
}
