import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BookOpen, Loader2, Sparkles, ChevronDown } from 'lucide-react';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { thumbUrl } from '@/lib/imageUrl';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface DailyContent {
  summary?: string;
  highlights?: string[];
  featured?: Array<{ name: string; point: string; image_url?: string | null }>;
}

interface DailyRow {
  date: string;
  content: DailyContent;
}

interface KnowledgeRow {
  id: string;
  product_name: string;
  category: ProductCategory;
  selling_points: string[];
  tips: string | null;
  era: string | null;
  origin: string | null;
  image_url: string | null;
  created_at: string;
}

export function DailyKnowledgeCard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'today' | 'history' | 'category'>('today');

  // 今日
  const [todayContent, setTodayContent] = useState<DailyContent | null>(null);
  const [loadingToday, setLoadingToday] = useState(true);
  const [generating, setGenerating] = useState(false);

  // 历史
  const [history, setHistory] = useState<DailyRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 按品类
  const [category, setCategory] = useState<ProductCategory>('porcelain');
  const [knowledge, setKnowledge] = useState<KnowledgeRow[]>([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!user) return;
    loadOrGenerate();
    loadCategoryCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadOrGenerate = async () => {
    setLoadingToday(true);
    const { data } = await supabase
      .from('daily_knowledge')
      .select('content')
      .eq('date', today)
      .maybeSingle();
    if (data) {
      setTodayContent(data.content as DailyContent);
      setLoadingToday(false);
    } else {
      setLoadingToday(false);
      generate();
    }
  };

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-daily-knowledge', { body: {} });
      if (error) throw error;
      if (data?.content) setTodayContent(data.content as DailyContent);
    } catch (e) {
      console.error('[DailyKnowledge] generate error:', e);
    } finally {
      setGenerating(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('daily_knowledge')
      .select('date, content')
      .order('date', { ascending: false })
      .limit(30);
    setHistory((data || []) as DailyRow[]);
    setLoadingHistory(false);
  };

  const loadCategoryCounts = async () => {
    const { data } = await supabase
      .from('product_knowledge')
      .select('category');
    if (!data) return;
    const counts: Record<string, number> = {};
    data.forEach((r: { category: string }) => {
      counts[r.category] = (counts[r.category] || 0) + 1;
    });
    setCategoryCounts(counts);
  };

  const loadKnowledge = async (cat: ProductCategory) => {
    setLoadingKnowledge(true);
    const { data } = await supabase
      .from('product_knowledge')
      .select('id, product_name, category, selling_points, tips, era, origin, image_url, created_at')
      .eq('category', cat)
      .order('created_at', { ascending: false })
      .limit(50);
    setKnowledge((data || []) as KnowledgeRow[]);
    setLoadingKnowledge(false);
  };

  const handleTabChange = (v: string) => {
    setTab(v as 'today' | 'history' | 'category');
    if (v === 'history' && history.length === 0) loadHistory();
    if (v === 'category' && knowledge.length === 0) loadKnowledge(category);
  };

  const handleCategoryChange = (v: string) => {
    setCategory(v as ProductCategory);
    loadKnowledge(v as ProductCategory);
  };

  const renderDailyContent = (content: DailyContent | null, loading: boolean) => {
    if (loading) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          正在加载...
        </div>
      );
    }
    if (!content) {
      return (
        <div className="text-sm text-muted-foreground">
          <p>暂无知识点。识别一些商品后会自动生成。</p>
          <Button size="sm" variant="outline" className="mt-2 rounded-full" onClick={generate}>
            <Sparkles className="w-3 h-3 mr-1" />
            立即生成
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {content.summary && (
          <p className="text-sm leading-relaxed text-foreground/90">{content.summary}</p>
        )}
        {content.highlights && content.highlights.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-[0.15em] font-medium text-muted-foreground">学习要点</div>
            <ul className="space-y-1.5">
              {content.highlights.map((h, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed">
                  <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-accent" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {content.featured && content.featured.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-[0.15em] font-medium text-muted-foreground">重点商品速记</div>
            <div className="space-y-2">
              {content.featured.map((f, i) => (
                <div key={i} className="flex gap-2 p-2 bg-muted/60 rounded-lg">
                  {f.image_url && (
                    <img src={thumbUrl(f.image_url, 96) || f.image_url} alt={f.name} className="w-12 h-12 rounded-md object-cover shrink-0" loading="lazy" decoding="async" />
                  )}
                  <div className="text-xs min-w-0 flex-1">
                    <div className="font-medium truncate">{f.name}</div>
                    <div className="text-muted-foreground line-clamp-2">{f.point}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 h-9 px-2.5 sm:px-3 relative">
          <BookOpen className="h-4 w-4" />
          <span className="hidden sm:inline">今日知识点</span>
          <span className="sm:hidden">知识</span>
          {todayContent && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(94vw,440px)] p-0 overflow-hidden" align="start" sideOffset={8}>
        <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-surface border-b border-border/60">
          <div className="w-8 h-8 rounded-full bg-gradient-accent flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-accent-foreground" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-[15px] leading-tight">学习中心</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{today}</div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList className="grid grid-cols-3 mx-3 mt-3 h-9">
            <TabsTrigger value="today" className="text-xs">今日</TabsTrigger>
            <TabsTrigger value="history" className="text-xs">历史</TabsTrigger>
            <TabsTrigger value="category" className="text-xs">按品类</TabsTrigger>
          </TabsList>

          <ScrollArea className="max-h-[60vh]">
            <TabsContent value="today" className="p-4 mt-0">
              {generating && !todayContent ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在为今日生成知识点...
                </div>
              ) : (
                renderDailyContent(todayContent, loadingToday)
              )}
            </TabsContent>

            <TabsContent value="history" className="p-4 mt-0 space-y-3">
              {loadingHistory && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  加载中...
                </div>
              )}
              {!loadingHistory && history.length === 0 && (
                <p className="text-sm text-muted-foreground">暂无历史记录</p>
              )}
              {history.map((row) => (
                <details key={row.date} className="group rounded-lg border border-border/60 bg-muted/30">
                  <summary className="flex items-center justify-between px-3 py-2 cursor-pointer list-none">
                    <div className="text-sm font-medium tabular-nums">{row.date}</div>
                    <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-3 pb-3 pt-1 border-t border-border/60">
                    {renderDailyContent(row.content, false)}
                  </div>
                </details>
              ))}
            </TabsContent>

            <TabsContent value="category" className="p-4 mt-0 space-y-3">
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                      {categoryCounts[c] ? ` (${categoryCounts[c]})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {loadingKnowledge && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  加载中...
                </div>
              )}

              {!loadingKnowledge && knowledge.length === 0 && (
                <p className="text-sm text-muted-foreground">该品类暂无知识点</p>
              )}

              <div className="space-y-2">
                {knowledge.map((k) => (
                  <div key={k.id} className="p-2.5 bg-muted/40 rounded-lg space-y-1.5">
                    <div className="flex gap-2">
                      {k.image_url && (
                        <img src={thumbUrl(k.image_url, 96) || k.image_url} alt={k.product_name} className="w-12 h-12 rounded-md object-cover shrink-0" loading="lazy" decoding="async" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{k.product_name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {[k.era, k.origin].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                    </div>
                    {Array.isArray(k.selling_points) && k.selling_points.length > 0 && (
                      <ul className="space-y-1 pl-1">
                        {k.selling_points.slice(0, 3).map((p, i) => (
                          <li key={i} className="flex gap-1.5 text-xs leading-relaxed">
                            <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-accent" />
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {k.tips && (
                      <div className="text-[11px] text-muted-foreground bg-background/60 rounded px-2 py-1 mt-1">
                        💡 {k.tips}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
