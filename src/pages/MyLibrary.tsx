import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Loader2, Trash2, ExternalLink, ImageOff, Lightbulb,
  Sparkles, CheckCircle2, ChevronDown, GraduationCap, Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CATEGORY_LABELS, CATEGORY_ICONS, ProductCategory } from '@/types';
import { QuizDialog } from '@/components/library/QuizDialog';
import { KnowledgeCardSections } from '@/components/knowledge/KnowledgeCardSections';
import { pickKnowledgeCard, officialRowToCard, type KnowledgeCard } from '@/lib/knowledgeCard';
import { Wand2 } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';


interface UnifiedItem {
  key: string;
  kind: 'favorite' | 'knowledge';
  favorite_id?: string;
  source_type?: string;
  source_id?: string;
  knowledge_id?: string;
  category: ProductCategory;
  name: string;
  cover_url: string | null;
  summary: string | null;
  era?: string | null;
  origin?: string | null;
  created_at: string;
  passed: boolean;
}

interface DetailData {
  name: string;
  category?: string | null;
  cover_url?: string | null;
  summary?: string | null;
  era?: string | null;
  origin?: string | null;
  selling_points?: any[];
  tips?: string | null;
  card?: KnowledgeCard | null;
  missing?: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  official: '官方',
  recognition: '识别',
  product: '历史',
};

const isUsableImage = (url?: string | null) => {
  if (!url) return false;
  if (url.startsWith('data:') && url.length > 200_000) return false;
  return true;
};

const TODAY_LIMIT = 5;
const TASK_PROGRESS_KEY = 'today-task-progress';
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const readAttempted = (): string[] => {
  try {
    const raw = localStorage.getItem(TASK_PROGRESS_KEY);
    if (!raw) return [];
    const obj = JSON.parse(raw);
    if (obj?.date !== todayStr()) return [];
    return Array.isArray(obj.attemptedKeys) ? obj.attemptedKeys : [];
  } catch { return []; }
};
const writeAttempted = (keys: string[]) => {
  try {
    localStorage.setItem(TASK_PROGRESS_KEY, JSON.stringify({ date: todayStr(), attemptedKeys: Array.from(new Set(keys)) }));
  } catch { /* ignore */ }
};

export default function MyLibrary() {
  const { user, role, loading: authLoading } = useAuth();
  const isAdmin = role === 'admin';
  const [enrichingCard, setEnrichingCard] = useState(false);
  const navigate = useNavigate();
  const [items, setItems] = useState<UnifiedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskExpanded, setTaskExpanded] = useState(false);

  const [active, setActive] = useState<UnifiedItem | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 测验弹窗
  const [quizItem, setQuizItem] = useState<UnifiedItem | null>(null);
  // 今日任务队列模式
  const [taskMode, setTaskMode] = useState(false);
  const [taskQueue, setTaskQueue] = useState<UnifiedItem[]>([]);
  const [taskIdx, setTaskIdx] = useState(0);
  const [attemptedToday, setAttemptedToday] = useState<string[]>(() => readAttempted());

  // 跨日清理
  useEffect(() => {
    const id = setInterval(() => {
      const fresh = readAttempted();
      setAttemptedToday((prev) => (prev.length === fresh.length ? prev : fresh));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    const [favRes, knowRes, resultRes] = await Promise.all([
      supabase.from('user_favorites').select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(300),
      supabase.from('product_knowledge')
        .select('id, product_id, product_name, category, era, origin, image_url, tips, selling_points, created_at')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false }).limit(300),
      supabase.from('knowledge_test_results')
        .select('item_kind, item_id, passed_at')
        .eq('user_id', user.id).limit(1000),
    ]);

    const passedSet = new Set<string>();
    (resultRes.data || []).forEach((r: any) => {
      if (r.passed_at) passedSet.add(`${r.item_kind}:${r.item_id}`);
    });

    const favRows = favRes.data || [];
    // 批量回查源表，避免 snapshot 陈旧（如官方知识改了主图）
    const officialIds = favRows.filter((f: any) => f.source_type === 'official').map((f: any) => f.source_id).filter(Boolean);
    const productIds = favRows.filter((f: any) => f.source_type === 'product').map((f: any) => f.source_id).filter(Boolean);
    const [officialFresh, productFresh] = await Promise.all([
      officialIds.length
        ? supabase.from('official_knowledge').select('id, name, category, cover_url, summary').in('id', officialIds)
        : Promise.resolve({ data: [] as any[] }),
      productIds.length
        ? supabase.from('products').select('id, name, category, image_url, description').in('id', productIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const officialMap = new Map<string, any>();
    (officialFresh.data || []).forEach((r: any) => officialMap.set(r.id, r));
    const productMap = new Map<string, any>();
    (productFresh.data || []).forEach((r: any) => productMap.set(r.id, r));

    const fav: UnifiedItem[] = favRows.map((f: any) => {
      const snap = f.snapshot || {};
      const fresh = f.source_type === 'official'
        ? officialMap.get(f.source_id)
        : f.source_type === 'product' ? productMap.get(f.source_id) : null;
      const freshCover = fresh
        ? (f.source_type === 'official' ? fresh.cover_url : fresh.image_url)
        : null;
      const cover = isUsableImage(freshCover) ? freshCover
        : isUsableImage(snap.cover_url) ? snap.cover_url
        : isUsableImage(snap.image_url) ? snap.image_url : null;
      const freshName = fresh ? fresh.name : null;
      const freshCategory = fresh ? fresh.category : null;
      const freshSummary = fresh
        ? (f.source_type === 'official' ? fresh.summary : fresh.description)
        : null;
      return {
        key: `f:${f.id}`,
        kind: 'favorite',
        favorite_id: f.id,
        source_type: f.source_type,
        source_id: f.source_id,
        category: (freshCategory || snap.category || 'other') as ProductCategory,
        name: freshName || snap.name || '未命名',
        cover_url: cover,
        summary: freshSummary || snap.summary || null,
        created_at: f.created_at,
        passed: passedSet.has(`favorite:${f.id}`),
      };
    });

    const know: UnifiedItem[] = (knowRes.data || []).map((k: any) => ({
      key: `k:${k.id}`,
      kind: 'knowledge',
      knowledge_id: k.id,
      category: k.category as ProductCategory,
      name: k.product_name || '未命名',
      cover_url: isUsableImage(k.image_url) ? k.image_url : null,
      summary: k.tips || null,
      era: k.era,
      origin: k.origin,
      created_at: k.created_at,
      passed: passedSet.has(`knowledge:${k.id}`),
    }));

    const merged = [...fav, ...know].sort((a, b) =>
      (b.created_at || '').localeCompare(a.created_at || ''));
    setItems(merged);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    loadAll();
    const onVis = () => { if (document.visibilityState === 'visible') loadAll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const totalCount = items.length;
  const passedCount = items.filter((i) => i.passed).length;
  const percent = totalCount ? Math.round((passedCount / totalCount) * 100) : 0;
  const pending = useMemo(() => items.filter((i) => !i.passed), [items]);
  const archived = useMemo(() => items.filter((i) => i.passed), [items]);

  // 今日推荐：未通过中按创建时间最早的取 TODAY_LIMIT 条
  const todayList = useMemo(
    () => [...pending].sort((a, b) =>
      (a.created_at || '').localeCompare(b.created_at || '')).slice(0, TODAY_LIMIT),
    [pending],
  );
  const remainingToday = useMemo(
    () => todayList.filter((it) => !attemptedToday.includes(it.key)),
    [todayList, attemptedToday],
  );
  const todayDone = (todayList.length === 0 || remainingToday.length === 0) && totalCount > 0;

  const groupByCategory = (list: UnifiedItem[]) => {
    const map = new Map<ProductCategory, UnifiedItem[]>();
    list.forEach((it) => {
      const arr = map.get(it.category) || [];
      arr.push(it);
      map.set(it.category, arr);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  };
  const pendingGrouped = useMemo(() => groupByCategory(pending), [pending]);
  const archivedGrouped = useMemo(() => groupByCategory(archived), [archived]);

  useEffect(() => {
    if (!active) { setDetail(null); return; }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      const fallback: DetailData = {
        name: active.name,
        category: active.category,
        cover_url: active.cover_url,
        summary: active.summary,
        era: active.era || null,
        origin: active.origin || null,
      };
      try {
        if (active.kind === 'favorite') {
          if (active.source_type === 'official') {
            const { data } = await supabase.from('official_knowledge')
              .select('name, category, cover_url, summary, era, origin, selling_points, tips')
              .eq('id', active.source_id!).maybeSingle();
            if (cancelled) return;
            if (!data) { setDetail({ ...fallback, missing: true }); return; }
            setDetail({
              name: data.name, category: data.category,
              cover_url: data.cover_url || fallback.cover_url,
              summary: data.summary, era: data.era, origin: data.origin,
              selling_points: Array.isArray(data.selling_points) ? data.selling_points : [],
              tips: data.tips,
            });
          } else {
            const { data } = await supabase.from('products')
              .select('name, category, image_url, description, era, origin, selling_points, tips')
              .eq('id', active.source_id!).maybeSingle();
            if (cancelled) return;
            if (!data) { setDetail({ ...fallback, missing: true }); return; }
            setDetail({
              name: data.name, category: data.category,
              cover_url: data.image_url || fallback.cover_url,
              summary: data.description, era: data.era, origin: data.origin,
              selling_points: Array.isArray(data.selling_points) ? data.selling_points : [],
              tips: data.tips,
            });
          }
        } else {
          const { data } = await supabase.from('product_knowledge')
            .select('product_name, category, image_url, era, origin, selling_points, tips')
            .eq('id', active.knowledge_id!).maybeSingle();
          if (cancelled) return;
          if (!data) { setDetail({ ...fallback, missing: true }); return; }
          setDetail({
            name: data.product_name, category: data.category,
            cover_url: data.image_url || fallback.cover_url,
            summary: null, era: data.era, origin: data.origin,
            selling_points: Array.isArray(data.selling_points) ? data.selling_points : [],
            tips: data.tips,
          });
        }
      } catch {
        if (!cancelled) setDetail({ ...fallback, missing: true });
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [active]);

  const remove = async (it: UnifiedItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (it.kind === 'favorite' && it.favorite_id) {
      await supabase.from('user_favorites').delete().eq('id', it.favorite_id);
      setItems((s) => s.filter((x) => x.key !== it.key));
      if (active?.key === it.key) setActive(null);
      toast.success('已从收藏中移除');
    } else {
      toast.info('自建知识请联系管理员调整');
    }
  };

  const itemKindFor = (it: UnifiedItem): 'favorite' | 'knowledge' => it.kind;
  const itemIdFor = (it: UnifiedItem) => it.kind === 'favorite' ? it.favorite_id! : it.knowledge_id!;

  const startTest = (it: UnifiedItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTaskMode(false);
    setQuizItem(it);
  };

  const startTodayTask = () => {
    const queue = remainingToday;
    if (queue.length === 0) {
      toast.success('今日任务已完成 🎉');
      return;
    }
    setTaskQueue(queue);
    setTaskIdx(0);
    setTaskMode(true);
    setQuizItem(queue[0]);
  };

  const markAttempted = (it: UnifiedItem) => {
    setAttemptedToday((prev) => {
      if (prev.includes(it.key)) return prev;
      const next = [...prev, it.key];
      writeAttempted(next);
      return next;
    });
  };

  const handlePassed = async (it: UnifiedItem, score: number, total: number) => {
    if (!user) return;
    await supabase.from('knowledge_test_results').upsert({
      user_id: user.id,
      item_kind: itemKindFor(it),
      item_id: itemIdFor(it),
      source_type: it.source_type ?? null,
      source_id: it.source_id ?? null,
      passed_at: new Date().toISOString(),
      score, total,
      last_attempt_at: new Date().toISOString(),
    }, { onConflict: 'user_id,item_kind,item_id' });
    setItems((s) => s.map((x) => x.key === it.key ? { ...x, passed: true } : x));
    markAttempted(it);
    toast.success('已掌握，归档到个人历史知识 🎉');
  };

  const handleAttempt = async (it: UnifiedItem, score: number, total: number, passed: boolean) => {
    if (!user) return;
    markAttempted(it);
    if (passed) return;
    await supabase.from('knowledge_test_results').upsert({
      user_id: user.id,
      item_kind: itemKindFor(it),
      item_id: itemIdFor(it),
      source_type: it.source_type ?? null,
      source_id: it.source_id ?? null,
      passed_at: null,
      score, total,
      last_attempt_at: new Date().toISOString(),
    }, { onConflict: 'user_id,item_kind,item_id' });
  };

  const exitTask = () => {
    setTaskMode(false);
    setTaskQueue([]);
    setTaskIdx(0);
    setQuizItem(null);
  };

  const handleQuizClose = (open: boolean) => {
    if (open) return;
    exitTask();
  };

  const goNextInTask = () => {
    const next = taskIdx + 1;
    if (next >= taskQueue.length) { exitTask(); return; }
    setTaskIdx(next);
    setQuizItem(null);
    setTimeout(() => setQuizItem(taskQueue[next]), 60);
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  const renderCard = (it: UnifiedItem) => (
    <Card
      key={it.key}
      className="overflow-hidden cursor-pointer active:opacity-80 transition-opacity"
      onClick={() => setActive(it)}
    >
      <div className="aspect-square bg-muted relative">
        {it.cover_url ? (
          <img src={it.cover_url} alt={it.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageOff className="w-6 h-6" />
          </div>
        )}
        <Badge
          className="absolute top-2 left-2 text-[10px]"
          variant={it.kind === 'knowledge' ? 'default' : 'secondary'}
        >
          {it.kind === 'knowledge' ? '我建的' : (SOURCE_LABEL[it.source_type || ''] || '收藏')}
        </Badge>
        {it.passed && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-500/90 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
      <div className="p-2.5 space-y-2">
        <p className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.5rem]">{it.name}</p>
        <Button
          size="sm"
          variant={it.passed ? 'ghost' : 'outline'}
          className="w-full h-7 text-xs gap-1"
          onClick={(e) => startTest(it, e)}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          {it.passed ? '再考一次' : '测验'}
        </Button>
      </div>
    </Card>
  );

  return (
    <>
      <PageHeader title="个人知识库" subtitle="测试通过即归档为历史知识" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-4">

        {/* 顶部：今日测试任务（紧凑单行） */}
        <Card className="overflow-hidden border-border/60 bg-gradient-surface shadow-soft">
          <div
            className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
            onClick={() => setTaskExpanded((v) => !v)}
          >
            <div className="w-6 h-6 rounded-full bg-gradient-accent flex items-center justify-center shrink-0">
              <Sparkles className="w-3 h-3 text-accent-foreground" />
            </div>
            <div className="font-display text-sm shrink-0">今日测试任务</div>
            {todayList.length > 0 && (
              <Progress
                value={Math.round(((todayList.length - remainingToday.length) / todayList.length) * 100)}
                className="h-1.5 w-16 sm:w-24 shrink-0"
              />
            )}
            <Badge variant="outline" className="text-[10px] tabular-nums shrink-0">
              {todayList.length - remainingToday.length}/{todayList.length}
            </Badge>
            <div className="flex-1" />
            {totalCount === 0 ? (
              <span className="text-[11px] text-muted-foreground">去收藏知识</span>
            ) : todayDone ? (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <Trophy className="w-3.5 h-3.5" /> 已全部掌握
              </span>
            ) : (
              <Button
                size="sm"
                className="h-7 px-2.5 text-xs gap-1"
                onClick={(e) => { e.stopPropagation(); startTodayTask(); }}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                开始
              </Button>
            )}
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${taskExpanded ? 'rotate-180' : ''}`}
            />
          </div>

          {taskExpanded && totalCount > 0 && !todayDone && remainingToday.length > 0 && (
            <div className="px-4 pb-3 pt-2 border-t border-border/40">
              <div className="text-[11px] text-muted-foreground mb-1.5 flex items-center justify-between">
                <span>今日剩余 {remainingToday.length} / {todayList.length} 条</span>
                <span>累计：通过 {passedCount} / 共 {totalCount}</span>
              </div>
              <ul className="space-y-1">
                {todayList.map((it) => {
                  const done = attemptedToday.includes(it.key);
                  return (
                    <li
                      key={it.key}
                      className={`text-xs flex items-center gap-1.5 truncate ${done ? 'text-muted-foreground line-through' : 'text-foreground/80'}`}
                    >
                      <span className="text-muted-foreground">·</span>
                      <span className="truncate">{it.name}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>

        {/* 待测试 */}
        <div className="flex items-baseline justify-between px-1 pt-1">
          <h2 className="text-sm font-display">待掌握</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{pending.length} 条</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm space-y-3">
            <p>还没有任何收藏或自建知识</p>
            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={() => navigate('/library')}>逛官方知识</Button>
              <Button size="sm" variant="outline" onClick={() => navigate('/scan')}>去识别商品</Button>
            </div>
          </div>
        ) : pending.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">所有知识都已掌握 🎉</p>
        ) : (
          <div className="space-y-5">
            {pendingGrouped.map(([cat, list]) => {
              const Icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS.other;
              return (
                <section key={cat} className="space-y-2">
                  <header className="flex items-center gap-2 px-1">
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 text-foreground/70" />
                    </div>
                    <h3 className="text-sm font-medium">{CATEGORY_LABELS[cat] || cat}</h3>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{list.length}</span>
                  </header>
                  <div className="grid grid-cols-2 gap-3">
                    {list.map(renderCard)}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* 个人历史知识（已通过） */}
        {archived.length > 0 && (
          <Collapsible className="pt-2">
            <CollapsibleTrigger className="w-full flex items-center justify-between px-1 py-2 group">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-display">个人历史知识</h2>
                <span className="text-xs text-muted-foreground tabular-nums">{archived.length} 条</span>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-5 pt-2">
              {archivedGrouped.map(([cat, list]) => {
                const Icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS.other;
                return (
                  <section key={cat} className="space-y-2">
                    <header className="flex items-center gap-2 px-1">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                        <Icon className="w-3.5 h-3.5 text-foreground/70" />
                      </div>
                      <h3 className="text-sm font-medium">{CATEGORY_LABELS[cat] || cat}</h3>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{list.length}</span>
                    </header>
                    <div className="grid grid-cols-2 gap-3">
                      {list.map(renderCard)}
                    </div>
                  </section>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* 详情弹窗 */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
            <DialogTitle className="text-base flex items-center gap-2">
              {active && (
                <Badge variant={active.kind === 'knowledge' ? 'default' : 'secondary'} className="text-[10px]">
                  {active.kind === 'knowledge'
                    ? '我建的'
                    : (SOURCE_LABEL[active.source_type || ''] || '收藏')}
                </Badge>
              )}
              {active?.passed && (
                <Badge className="text-[10px] bg-emerald-500 hover:bg-emerald-500">已掌握</Badge>
              )}
              <span className="line-clamp-1">{detail?.name || active?.name || '加载中…'}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto px-4 pb-4 space-y-3">
            {detailLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : detail ? (
              <>
                <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                  {isUsableImage(detail.cover_url) ? (
                    <img src={detail.cover_url!} alt={detail.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <ImageOff className="w-10 h-10" />
                    </div>
                  )}
                </div>

                {detail.missing && (
                  <p className="text-xs text-destructive">⚠ 原始资料已被删除，仅显示快照</p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {detail.category && (
                    <Badge variant="outline" className="text-[11px]">
                      {CATEGORY_LABELS[detail.category as ProductCategory] || detail.category}
                    </Badge>
                  )}
                  {detail.era && <Badge variant="outline" className="text-[11px]">{detail.era}</Badge>}
                  {detail.origin && <Badge variant="outline" className="text-[11px]">{detail.origin}</Badge>}
                </div>

                {detail.summary && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{detail.summary}</p>
                )}

                {detail.selling_points && detail.selling_points.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">卖点</p>
                    <ul className="space-y-1.5">
                      {detail.selling_points.map((sp: any, i: number) => {
                        const text = typeof sp === 'string' ? sp : (sp?.text || JSON.stringify(sp));
                        return (
                          <li key={i} className="text-sm flex gap-2">
                            <span className="text-primary shrink-0">•</span>
                            <span className="leading-relaxed">{text}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {detail.tips && (
                  <div className="bg-accent/30 rounded-lg p-3 text-sm flex gap-2">
                    <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-accent-foreground" />
                    <p className="leading-relaxed">{detail.tips}</p>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {active && (
            <div className="border-t px-4 py-3 flex gap-2 shrink-0 bg-background">
              <Button
                size="sm" className="flex-1 gap-1.5"
                onClick={() => active && startTest(active)}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                {active.passed ? '再考一次' : '去测验'}
              </Button>
              {active.kind === 'favorite' && active.source_type === 'official' && !detail?.missing && (
                <Button
                  variant="outline" size="sm" className="gap-1.5"
                  onClick={() => { navigate('/library'); setActive(null); }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              )}
              {active.kind === 'favorite' && (
                <Button
                  variant="ghost" size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => active && remove(active)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 测验弹窗 */}
      {quizItem && (
        <QuizDialog
          open={!!quizItem}
          onOpenChange={handleQuizClose}
          knowledgeId={itemIdFor(quizItem)}
          kind={itemKindFor(quizItem)}
          title={taskMode ? `今日任务 ${taskIdx + 1}/${taskQueue.length} · ${quizItem.name}` : quizItem.name}
          onPassed={(s, t) => handlePassed(quizItem, s, t)}
          onAttempt={(s, t, p) => handleAttempt(quizItem, s, t, p)}
          onExit={exitTask}
          hasNext={taskMode && taskIdx + 1 < taskQueue.length}
          onNext={taskMode ? goNextInTask : undefined}
          taskProgress={taskMode ? { current: taskIdx + 1, total: taskQueue.length } : undefined}
        />
      )}
    </>
  );
}
