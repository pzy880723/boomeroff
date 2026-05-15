import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface PendingEvent {
  id: string;
  source: string;
  amount: number;
  title: string;
  created_at: string;
}

export type DailyTaskKey =
  | 'daily_first_scan'
  | 'daily_3_scans'
  | 'daily_quiz'
  | 'daily_post';

export interface DailyTask {
  key: DailyTaskKey;
  label: string;
  amount: number;
  progress: number;
  target: number;
  claimed: boolean;
  completed: boolean;
}

function todayShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function dayBoundsISO(): { start: string; end: string } {
  const d = todayShanghai();
  return { start: `${d}T00:00:00+08:00`, end: `${d}T23:59:59.999+08:00` };
}

export function useTasks() {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingEvent[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const claimingRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) { setPending([]); setDailyTasks([]); setLoading(false); return; }
    setLoading(true);
    const uid = user.id;
    const { start, end } = dayBoundsISO();
    const today = todayShanghai();

    const [
      { data: pend },
      { count: scans },
      { count: quiz },
      { count: posts },
      { data: claims },
    ] = await Promise.all([
      supabase.from('exp_pending' as any)
        .select('id, source, amount, title, created_at')
        .eq('user_id', uid).is('claimed_at', null)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('products').select('id', { count: 'exact', head: true })
        .eq('created_by', uid).gte('created_at', start).lte('created_at', end),
      supabase.from('knowledge_test_results').select('id', { count: 'exact', head: true })
        .eq('user_id', uid).not('passed_at', 'is', null)
        .gte('passed_at', start).lte('passed_at', end),
      supabase.from('community_posts').select('id', { count: 'exact', head: true })
        .eq('user_id', uid).gte('created_at', start).lte('created_at', end),
      supabase.from('task_claims' as any).select('task_key')
        .eq('user_id', uid).eq('claim_date', today),
    ]);

    const claimedSet = new Set(((claims as any[]) || []).map(c => c.task_key));
    const sc = scans || 0;
    const qz = quiz || 0;
    const ps = posts || 0;

    const tasks: DailyTask[] = [
      { key: 'daily_first_scan', label: '完成 1 次识别', amount: 5,  progress: Math.min(sc, 1), target: 1, completed: sc >= 1, claimed: claimedSet.has('daily_first_scan') },
      { key: 'daily_3_scans',    label: '完成 3 次识别', amount: 10, progress: Math.min(sc, 3), target: 3, completed: sc >= 3, claimed: claimedSet.has('daily_3_scans') },
      { key: 'daily_quiz',       label: '通过一次知识测试', amount: 15, progress: Math.min(qz, 1), target: 1, completed: qz >= 1, claimed: claimedSet.has('daily_quiz') },
      { key: 'daily_post',       label: '发一条中古圈帖子', amount: 5,  progress: Math.min(ps, 1), target: 1, completed: ps >= 1, claimed: claimedSet.has('daily_post') },
    ];

    setPending(((pend as any[]) || []) as PendingEvent[]);
    setDailyTasks(tasks);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  // realtime: 待领取奖励
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`exp-pending-${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'exp_pending', filter: `user_id=eq.${user.id}` },
        () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  const claimEvent = useCallback(async (id: string): Promise<{ ok: boolean; amount?: number }> => {
    if (claimingRef.current.has(id)) return { ok: false };
    claimingRef.current.add(id);
    setPending(prev => prev.filter(p => p.id !== id));
    const { data, error } = await supabase.rpc('claim_pending_exp' as any, { _id: id });
    claimingRef.current.delete(id);
    const r = data as any;
    if (error || !r?.ok) { void load(); return { ok: false }; }
    return { ok: true, amount: r.amount };
  }, [load]);

  const claimDaily = useCallback(async (key: DailyTaskKey): Promise<{ ok: boolean; amount?: number }> => {
    const { data, error } = await supabase.rpc('claim_daily_task' as any, { _task_key: key });
    const r = data as any;
    if (error || !r?.ok) { void load(); return { ok: false }; }
    setDailyTasks(prev => prev.map(t => t.key === key ? { ...t, claimed: true } : t));
    return { ok: true, amount: r.amount };
  }, [load]);

  const claimAllPending = useCallback(async (): Promise<number> => {
    let total = 0;
    const items = [...pending];
    for (const p of items) {
      const r = await claimEvent(p.id);
      if (r.ok && r.amount) total += r.amount;
    }
    return total;
  }, [pending, claimEvent]);

  const totalUnclaimedExp =
    pending.reduce((s, p) => s + p.amount, 0) +
    dailyTasks.filter(t => t.completed && !t.claimed).reduce((s, t) => s + t.amount, 0);

  const totalUnclaimedCount =
    pending.length + dailyTasks.filter(t => t.completed && !t.claimed).length;

  return {
    loading,
    pending,
    dailyTasks,
    totalUnclaimedCount,
    totalUnclaimedExp,
    claimEvent,
    claimDaily,
    claimAllPending,
    refresh: load,
  };
}
