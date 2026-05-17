import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { usePermissions } from './usePermissions';
import { todayISO, addDaysISO } from '@/lib/scheduleUtils';

export interface DashShift { code: string; name: string; start_time: string; end_time: string; color: string | null }
export interface DashSchedItem { work_date: string; shift_code: string; user_id?: string }
export interface DashColleague { user_id: string; display_name: string; avatar_url: string | null; shift_code: string; shift_color: string | null }
export interface DashLearning {
  sop: { id: string; title: string; body: string } | null;
  qa: { id: string; title: string; body: string } | null;
  daily: { content: any } | null;
}
export interface DashStats {
  weekScans: number;
  prevWeekScans: number;
  weekFavs: number;
  weekPosts: number;
  weeklySpark: number[]; // 7 days, oldest -> newest
}
export interface DashTodos {
  pendingCorrections: number;
  pendingShares: number;
  pendingUsers: number;
}
export interface DashSocial {
  posts: { id: string; name: string; thumbnail_url: string | null; image_url: string | null; display_name: string | null; avatar_url: string | null }[];
}

export interface DashData {
  loading: boolean;
  profile: { display_name: string; avatar_url: string | null } | null;
  todayShift: DashShift | null;
  nextShift: { date: string; shift: DashShift | null } | null;
  weekShifts: { date: string; shift: DashShift | null }[]; // 7 days from today
  colleaguesToday: DashColleague[];
  shopName: string | null;
  totalExp: number;
  currentStreak: number;
  checkedToday: boolean;
  learning: DashLearning;
  stats: DashStats;
  todos: DashTodos;
  social: DashSocial;
  refresh: () => Promise<void>;
}

function todayShanghai() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// 模块级缓存：60s 内重复打开抽屉直接命中缓存，后台静默刷新
type CachedDash = Omit<DashData, 'loading' | 'refresh'>;
const dashCache = new Map<string, { data: CachedDash; ts: number }>();
const CACHE_TTL_MS = 60 * 1000;

export function useDashboardData(enabled: boolean): DashData {
  const { user } = useAuth();
  const { permissions } = usePermissions();
  const isAdmin = permissions.has('correction.review') || permissions.has('user.create');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CachedDash>(() => {
    const cached = user ? dashCache.get(user.id) : null;
    return cached?.data ?? {
      profile: null,
      todayShift: null,
      nextShift: null,
      weekShifts: [],
      colleaguesToday: [],
      shopName: null,
      totalExp: 0,
      currentStreak: 0,
      checkedToday: false,
      learning: { sop: null, qa: null, daily: null },
      stats: { weekScans: 0, prevWeekScans: 0, weekFavs: 0, weekPosts: 0, weeklySpark: [0, 0, 0, 0, 0, 0, 0] },
      todos: { pendingCorrections: 0, pendingShares: 0, pendingUsers: 0 },
      social: { posts: [] },
    };
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const start = todayISO();
    const end = addDaysISO(start, 29);
    const today = todayShanghai();
    const weekAgo = addDaysISO(today, -6);
    const twoWeekAgo = addDaysISO(today, -13);
    // isAdmin 来自外层 props，避免 can 函数引用变化触发重 load

    const [
      { data: profile },
      { data: rows },
      { data: shifts },
      { data: exp },
      { data: ci },
      { data: sopRows },
      { data: qaRows },
      { data: daily },
      { count: weekScans },
      { count: prevWeekScans },
      { count: weekFavs },
      { count: weekPosts },
      { data: scanRows },
      { data: socialPosts },
      { data: pendingPosts },
    ] = await Promise.all([
      supabase.from('profiles').select('display_name, avatar_url').eq('user_id', user.id).maybeSingle(),
      supabase.from('shift_schedules' as any)
        .select('work_date, shift_code, user_id, shop_id')
        .eq('user_id', user.id)
        .gte('work_date', start).lte('work_date', end),
      supabase.from('shop_shifts' as any).select('code, name, start_time, end_time, color').eq('active', true),
      supabase.from('user_experience').select('total_exp, current_streak').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_check_ins').select('id').eq('user_id', user.id).eq('check_in_date', today).maybeSingle(),
      supabase.from('shop_kb_entries' as any).select('id, title, body').eq('type', 'sop').limit(20),
      supabase.from('shop_kb_entries' as any).select('id, title, body').eq('type', 'qa').limit(20),
      supabase.from('daily_knowledge').select('content').eq('date', today).maybeSingle(),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('created_by', user.id).gte('created_at', `${weekAgo}T00:00:00+08:00`),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('created_by', user.id).gte('created_at', `${twoWeekAgo}T00:00:00+08:00`).lt('created_at', `${weekAgo}T00:00:00+08:00`),
      supabase.from('user_favorites').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', `${weekAgo}T00:00:00+08:00`),
      supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', `${weekAgo}T00:00:00+08:00`),
      supabase.from('products').select('created_at').eq('created_by', user.id).gte('created_at', `${weekAgo}T00:00:00+08:00`),
      supabase.from('community_posts').select('id, name, thumbnail_url, image_url, user_id').eq('is_public', true).neq('user_id', user.id).order('created_at', { ascending: false }).limit(3),
      isAdmin
        ? supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('is_public', false)
        : Promise.resolve({ data: null, count: 0 } as any),
    ]);

    const sMap = new Map<string, DashShift>();
    (shifts as any[] || []).forEach(s => sMap.set(s.code, s));

    const myRows = ((rows as any[]) || []) as (DashSchedItem & { shop_id?: string | null })[];
    const todayRow = myRows.find(r => r.work_date === today);
    const futureRow = myRows.find(r => r.work_date > today);
    const todayShift = todayRow ? sMap.get(todayRow.shift_code) || null : null;

    // 7-day week (today + 6)
    const weekShifts = Array.from({ length: 7 }, (_, i) => {
      const d = addDaysISO(today, i);
      const r = myRows.find(x => x.work_date === d);
      return { date: d, shift: r ? sMap.get(r.shift_code) || null : null };
    });

    // Today colleagues = same shop today (all shifts), excluding self
    let colleaguesToday: DashColleague[] = [];
    let shopName: string | null = null;
    let shopId: string | null = (todayRow as any)?.shop_id ?? null;
    if (!shopId) {
      const { data: sp } = await supabase
        .from('staff_profiles' as any)
        .select('shop_id')
        .eq('user_id', user.id)
        .maybeSingle();
      shopId = (sp as any)?.shop_id ?? null;
    }
    if (shopId) {
      const { data: shopRow } = await supabase
        .from('shops' as any).select('name').eq('id', shopId).maybeSingle();
      shopName = (shopRow as any)?.name ?? null;

      const { data: peerRows } = await supabase
        .from('shift_schedules' as any)
        .select('user_id, shift_code')
        .eq('work_date', today)
        .eq('shop_id', shopId)
        .neq('user_id', user.id);
      const peers = ((peerRows as any[]) || []).filter(r => r.user_id);
      const peerIds = Array.from(new Set(peers.map(r => r.user_id)));
      if (peerIds.length) {
        const [{ data: peerProfiles }, { data: peerStaff }] = await Promise.all([
          supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', peerIds),
          supabase.from('staff_profiles' as any).select('user_id, real_name').in('user_id', peerIds),
        ]);
        const realMap = new Map<string, string>();
        (peerStaff as any[] || []).forEach(s => { if (s.real_name) realMap.set(s.user_id, s.real_name); });
        const profMap = new Map<string, any>();
        (peerProfiles as any[] || []).forEach(p => profMap.set(p.user_id, p));
        colleaguesToday = peers.map(r => {
          const p = profMap.get(r.user_id);
          const shift = sMap.get(r.shift_code);
          return {
            user_id: r.user_id,
            display_name: realMap.get(r.user_id) || p?.display_name || '店员',
            avatar_url: p?.avatar_url || null,
            shift_code: r.shift_code,
            shift_color: shift?.color ?? null,
          };
        });
      }
    }

    // Sparkline: count per day
    const spark = Array(7).fill(0);
    (scanRows as any[] || []).forEach(r => {
      const d = (r.created_at as string).slice(0, 10);
      const idx = 6 - Math.min(6, Math.max(0, Math.floor((Date.parse(today) - Date.parse(d)) / 86400000)));
      if (idx >= 0 && idx < 7) spark[idx]++;
    });

    // Social posts: enrich with user profiles
    let socialEnriched: DashSocial['posts'] = [];
    const sps = (socialPosts as any[] || []);
    if (sps.length) {
      const uids = Array.from(new Set(sps.map(p => p.user_id).filter(Boolean)));
      const { data: ups } = uids.length
        ? await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', uids)
        : { data: [] as any[] };
      const upMap = new Map<string, any>();
      (ups as any[] || []).forEach(u => upMap.set(u.user_id, u));
      socialEnriched = sps.map(p => ({
        id: p.id,
        name: p.name,
        thumbnail_url: p.thumbnail_url,
        image_url: p.image_url,
        display_name: upMap.get(p.user_id)?.display_name || null,
        avatar_url: upMap.get(p.user_id)?.avatar_url || null,
      }));
    }

    // Random pick from sop/qa
    const pickRand = <T,>(arr: T[]): T | null => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;

    const nextData: CachedDash = {
      profile: profile as any || { display_name: user.email?.split('@')[0] || '店员', avatar_url: null },
      todayShift,
      nextShift: futureRow ? { date: futureRow.work_date, shift: sMap.get(futureRow.shift_code) || null } : null,
      weekShifts,
      colleaguesToday,
      shopName,
      totalExp: exp?.total_exp || 0,
      currentStreak: exp?.current_streak || 0,
      checkedToday: !!ci,
      learning: {
        sop: pickRand((sopRows as any[] || []).map(r => ({ id: r.id, title: r.title, body: r.body }))),
        qa: pickRand((qaRows as any[] || []).map(r => ({ id: r.id, title: r.title, body: r.body }))),
        daily: daily ? { content: (daily as any).content } : null,
      },
      stats: {
        weekScans: weekScans || 0,
        prevWeekScans: prevWeekScans || 0,
        weekFavs: weekFavs || 0,
        weekPosts: weekPosts || 0,
        weeklySpark: spark,
      },
      todos: {
        pendingCorrections: 0,
        pendingShares: (pendingPosts as any)?.count || 0,
        pendingUsers: 0,
      },
      social: { posts: socialEnriched },
    };
    if (user) dashCache.set(user.id, { data: nextData, ts: Date.now() });
    setData(nextData);
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    if (!enabled || !user) return;
    const cached = dashCache.get(user.id);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      // 命中缓存：直接显示，不再触发 load
      setData(cached.data);
      setLoading(false);
      return;
    }
    void load();
  }, [enabled, user, load]);

  return { ...data, loading, refresh: load };
}
