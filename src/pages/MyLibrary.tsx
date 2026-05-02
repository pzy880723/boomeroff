import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2, Trash2, ExternalLink, ImageOff, Lightbulb,
  Sparkles, Store, User as UserIcon, RefreshCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CATEGORY_LABELS, CATEGORY_ICONS, ProductCategory } from '@/types';

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
  missing?: boolean;
}

interface PersonalSummary {
  summary: { team_summary: string; personal_advice: string };
  stats: { shop_total: number; mine_total: number; shop_top_cats: string; my_top_cats: string };
  generated_at: string;
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

export default function MyLibrary() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<UnifiedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState<PersonalSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [active, setActive] = useState<UnifiedItem | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    const [favRes, knowRes] = await Promise.all([
      supabase.from('user_favorites').select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(300),
      supabase.from('product_knowledge')
        .select('id, product_id, product_name, category, era, origin, image_url, tips, selling_points, created_at')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false }).limit(300),
    ]);

    const fav: UnifiedItem[] = (favRes.data || []).map((f: any) => {
      const snap = f.snapshot || {};
      const cover = isUsableImage(snap.cover_url) ? snap.cover_url
        : isUsableImage(snap.image_url) ? snap.image_url : null;
      return {
        key: `f:${f.id}`,
        kind: 'favorite',
        favorite_id: f.id,
        source_type: f.source_type,
        source_id: f.source_id,
        category: (snap.category || 'other') as ProductCategory,
        name: snap.name || '未命名',
        cover_url: cover,
        summary: snap.summary || null,
        created_at: f.created_at,
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
    }));

    const merged = [...fav, ...know].sort((a, b) =>
      (b.created_at || '').localeCompare(a.created_at || ''));
    setItems(merged);
    setLoading(false);
  };

  const loadSummary = async (force = false) => {
    if (!user) return;
    setSummaryLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('personal-daily-summary', {
        body: { force },
      });
      if (error) throw error;
      if (data && (data as any).summary) setSummary(data as PersonalSummary);
    } catch (e) {
      console.error('[PersonalSummary] error:', e);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadAll();
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const grouped = useMemo(() => {
    const map = new Map<ProductCategory, UnifiedItem[]>();
    items.forEach((it) => {
      const arr = map.get(it.category) || [];
      arr.push(it);
      map.set(it.category, arr);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [items]);

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

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  return (
    <>
      <PageHeader title="个人知识库" subtitle="你的收藏与自建知识" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-4">

        {/* 顶部：今日学习简报 */}
        <Card className="overflow-hidden border-border/60 bg-gradient-surface shadow-soft">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-accent flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-accent-foreground" />
              </div>
              <div className="font-display text-sm">今日学习简报</div>
            </div>
            <Button
              size="sm" variant="ghost"
              className="h-7 px-2 text-xs gap-1"
              disabled={summaryLoading}
              onClick={() => loadSummary(true)}
            >
              <RefreshCcw className={`w-3 h-3 ${summaryLoading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
          <div className="p-4 space-y-3">
            {summaryLoading && !summary ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                正在生成今日简报...
              </div>
            ) : summary ? (
              <>
                <div className="flex gap-2.5">
                  <Store className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">全店动态</div>
                    <p className="text-sm leading-relaxed">{summary.summary.team_summary}</p>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <UserIcon className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">给你的建议</div>
                    <p className="text-sm leading-relaxed">{summary.summary.personal_advice}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">暂无简报</p>
            )}
          </div>
        </Card>

        {/* 标题 */}
        <div className="flex items-baseline justify-between px-1 pt-1">
          <h2 className="text-sm font-display">我的知识与收藏</h2>
          <span className="text-xs text-muted-foreground tabular-nums">共 {items.length} 条</span>
        </div>

        {/* 按品类分组 */}
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
        ) : (
          <div className="space-y-5">
            {grouped.map(([cat, list]) => {
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
                    {list.map((it) => (
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
                            {it.kind === 'knowledge'
                              ? '我建的'
                              : (SOURCE_LABEL[it.source_type || ''] || '收藏')}
                          </Badge>
                        </div>
                        <div className="p-2.5">
                          <p className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.5rem]">
                            {it.name}
                          </p>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
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
              {active.kind === 'favorite' && active.source_type === 'official' && !detail?.missing && (
                <Button
                  variant="outline" size="sm" className="flex-1 gap-1.5"
                  onClick={() => { navigate('/library'); setActive(null); }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  去官方知识库
                </Button>
              )}
              {active.kind === 'favorite' ? (
                <Button
                  variant="ghost" size="sm"
                  className="flex-1 gap-1.5 text-muted-foreground"
                  onClick={() => active && remove(active)}
                >
                  <Trash2 className="w-3.5 h-3.5" /> 移除收藏
                </Button>
              ) : (
                <p className="flex-1 text-[11px] text-muted-foreground self-center">
                  自建知识请联系管理员在「官方知识」中编辑
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
