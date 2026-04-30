import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, Star, ExternalLink, ImageOff, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CATEGORY_LABELS, ProductCategory } from '@/types';

interface FavItem {
  id: string;
  source_type: string;
  source_id: string;
  snapshot: {
    name?: string;
    category?: string;
    cover_url?: string | null;
    image_url?: string | null;
    summary?: string | null;
  };
  created_at: string;
}

interface DetailData {
  name: string;
  category?: string | null;
  cover_url?: string | null;
  summary?: string | null;
  era?: string | null;
  origin?: string | null;
  selling_points?: string[];
  tips?: string | null;
  missing?: boolean;
}

const TYPE_LABEL: Record<string, string> = { official: '官方', recognition: '识别', product: '历史' };

const isUsableImage = (url?: string | null) => {
  if (!url) return false;
  // 旧数据可能存了大体积 base64，直接当无效图忽略
  if (url.startsWith('data:') && url.length > 200_000) return false;
  return true;
};

export default function MyLibrary() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [active, setActive] = useState<FavItem | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      let q = supabase.from('user_favorites').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (filter !== 'all') q = q.eq('source_type', filter);
      const { data } = await q.limit(200);
      setItems((data || []) as unknown as FavItem[]);
      setLoading(false);
    })();
  }, [user, filter]);

  // 打开详情时按来源回查
  useEffect(() => {
    if (!active) { setDetail(null); return; }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      const snap = active.snapshot || {};
      const fallback: DetailData = {
        name: snap.name || '未命名',
        category: snap.category,
        cover_url: isUsableImage(snap.cover_url || snap.image_url) ? (snap.cover_url || snap.image_url) : null,
        summary: snap.summary || null,
      };
      try {
        if (active.source_type === 'official') {
          const { data } = await supabase
            .from('official_knowledge')
            .select('name, category, cover_url, summary, era, origin, selling_points, tips')
            .eq('id', active.source_id)
            .maybeSingle();
          if (cancelled) return;
          if (!data) { setDetail({ ...fallback, missing: true }); return; }
          setDetail({
            name: data.name,
            category: data.category,
            cover_url: data.cover_url || fallback.cover_url,
            summary: data.summary,
            era: data.era,
            origin: data.origin,
            selling_points: Array.isArray(data.selling_points) ? data.selling_points as string[] : [],
            tips: data.tips,
          });
        } else {
          const { data } = await supabase
            .from('products')
            .select('name, category, image_url, description, era, origin, selling_points, tips')
            .eq('id', active.source_id)
            .maybeSingle();
          if (cancelled) return;
          if (!data) { setDetail({ ...fallback, missing: true }); return; }
          setDetail({
            name: data.name,
            category: data.category,
            cover_url: data.image_url || fallback.cover_url,
            summary: data.description,
            era: data.era,
            origin: data.origin,
            selling_points: Array.isArray(data.selling_points) ? data.selling_points as string[] : [],
            tips: data.tips,
          });
        }
      } catch (e) {
        if (!cancelled) setDetail({ ...fallback, missing: true });
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [active]);

  const remove = async (it: FavItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await supabase.from('user_favorites').delete().eq('id', it.id);
    setItems((s) => s.filter((x) => x.id !== it.id));
    if (active?.id === it.id) setActive(null);
    toast.success('已移除');
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  return (
    <>
      <PageHeader title="个人知识库" subtitle="收藏的好物与识别记录" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="official">官方</TabsTrigger>
            <TabsTrigger value="recognition">识别</TabsTrigger>
            <TabsTrigger value="product">历史</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">
            还没有收藏，去官方知识库或识别商品后收藏吧
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((it) => {
              const cover = isUsableImage(it.snapshot?.cover_url) ? it.snapshot?.cover_url
                : isUsableImage(it.snapshot?.image_url) ? it.snapshot?.image_url
                : null;
              return (
                <Card
                  key={it.id}
                  className="overflow-hidden cursor-pointer active:opacity-80 transition-opacity"
                  onClick={() => setActive(it)}
                >
                  <div className="aspect-square bg-muted relative">
                    {cover ? (
                      <img src={cover} alt={it.snapshot?.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <ImageOff className="w-6 h-6" />
                      </div>
                    )}
                    <Badge className="absolute top-2 left-2 text-[10px]" variant="secondary">
                      {TYPE_LABEL[it.source_type] || it.source_type}
                    </Badge>
                  </div>
                  <div className="p-2.5">
                    <p className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.5rem]">
                      {it.snapshot?.name || '未命名'}
                    </p>
                  </div>
                </Card>
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
                <Badge variant="secondary" className="text-[10px]">
                  {TYPE_LABEL[active.source_type] || active.source_type}
                </Badge>
              )}
              <span className="line-clamp-1">{detail?.name || active?.snapshot?.name || '加载中…'}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto px-4 pb-4 space-y-3">
            {detailLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : detail ? (
              <>
                {/* 大图 */}
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
                  <p className="text-xs text-destructive">⚠ 原始资料已被删除，仅显示收藏快照</p>
                )}

                {/* 基本信息 */}
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

                {/* 卖点 */}
                {detail.selling_points && detail.selling_points.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">卖点</p>
                    <ul className="space-y-1.5">
                      {detail.selling_points.map((sp, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <span className="text-primary shrink-0">•</span>
                          <span className="leading-relaxed">{sp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 小贴士 */}
                {detail.tips && (
                  <div className="bg-accent/30 rounded-lg p-3 text-sm flex gap-2">
                    <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-accent-foreground" />
                    <p className="leading-relaxed">{detail.tips}</p>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* 底部操作 */}
          {active && (
            <div className="border-t px-4 py-3 flex gap-2 shrink-0 bg-background">
              {active.source_type === 'official' && !detail?.missing && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => { navigate('/library'); setActive(null); }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  去官方知识库
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 gap-1.5 text-muted-foreground"
                onClick={() => active && remove(active)}
              >
                <Trash2 className="w-3.5 h-3.5" /> 移除收藏
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
