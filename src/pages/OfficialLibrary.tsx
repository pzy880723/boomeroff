import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CATEGORY_LABELS, CATEGORY_ORDER, CATEGORY_ICONS, ProductCategory } from '@/types';
import { Loader2, Search, Star, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface OfficialItem {
  id: string;
  name: string;
  category: ProductCategory;
  ip_name: string | null;
  summary: string | null;
  era: string | null;
  origin: string | null;
  cover_url: string | null;
  selling_points: unknown;
  tips: string | null;
}

const categoriesAll: Array<ProductCategory | 'all'> = ['all', ...CATEGORY_ORDER];

export default function OfficialLibrary() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<OfficialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [cat, setCat] = useState<ProductCategory | 'all'>('all');
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<OfficialItem | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      let q = supabase.from('official_knowledge').select('*').order('created_at', { ascending: false });
      if (cat !== 'all') q = q.eq('category', cat);
      if (keyword.trim()) q = q.or(`name.ilike.%${keyword}%,ip_name.ilike.%${keyword}%,summary.ilike.%${keyword}%`);
      const { data } = await q.limit(60);
      setItems((data || []) as OfficialItem[]);
      setLoading(false);

      const { data: fav } = await supabase
        .from('user_favorites')
        .select('source_id')
        .eq('user_id', user.id)
        .eq('source_type', 'official');
      setFavoritedIds(new Set((fav || []).map((f) => f.source_id)));
    })();
  }, [user, cat, keyword]);

  const toggleFav = async (item: OfficialItem) => {
    if (!user) return;
    if (favoritedIds.has(item.id)) {
      await supabase.from('user_favorites').delete()
        .eq('user_id', user.id).eq('source_type', 'official').eq('source_id', item.id);
      setFavoritedIds((s) => { const n = new Set(s); n.delete(item.id); return n; });
      toast.success('已取消收藏');
    } else {
      await supabase.from('user_favorites').insert({
        user_id: user.id, source_type: 'official', source_id: item.id,
        snapshot: { name: item.name, category: item.category, cover_url: item.cover_url, summary: item.summary },
      });
      setFavoritedIds((s) => new Set(s).add(item.id));
      toast.success('已收藏到个人知识库');
    }
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  return (
    <>
      <PageHeader title="官方知识库" subtitle="按品类与 IP 学习中古好物" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索名称 / IP / 简介"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
          {categoriesAll.map((c) => {
            const active = cat === c;
            const Icon = c === 'all' ? LayoutGrid : CATEGORY_ICONS[c];
            const label = c === 'all' ? '全部' : CATEGORY_LABELS[c];
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-accent'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] leading-tight truncate max-w-full">{label}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">
            暂无内容，去后台添加官方词条吧
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((it) => (
              <Card key={it.id} className="overflow-hidden cursor-pointer group" onClick={() => setDetail(it)}>
                <div className="aspect-square bg-muted relative">
                  {it.cover_url ? (
                    <img src={it.cover_url} alt={it.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">无图</div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFav(it); }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/90 backdrop-blur flex items-center justify-center"
                  >
                    <Star className={`w-4 h-4 ${favoritedIds.has(it.id) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                  </button>
                </div>
                <div className="p-2.5 space-y-1">
                  <p className="text-sm font-medium leading-tight truncate">{it.name}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{CATEGORY_LABELS[it.category]}</Badge>
                    {it.ip_name && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{it.ip_name}</Badge>}
                  </div>
                  {it.era && <p className="text-[11px] text-muted-foreground truncate">{it.era}</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.name}</DialogTitle>
              </DialogHeader>
              {detail.cover_url && <img src={detail.cover_url} className="w-full rounded-lg aspect-square object-cover" alt={detail.name} />}
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">{CATEGORY_LABELS[detail.category]}</Badge>
                {detail.ip_name && <Badge variant="outline">{detail.ip_name}</Badge>}
                {detail.era && <Badge variant="outline">{detail.era}</Badge>}
                {detail.origin && <Badge variant="outline">{detail.origin}</Badge>}
              </div>
              {detail.summary && <p className="text-sm text-muted-foreground">{detail.summary}</p>}
              {Array.isArray(detail.selling_points) && detail.selling_points.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold">核心卖点</p>
                  <ul className="text-sm space-y-1 list-disc list-inside">
                    {(detail.selling_points as string[]).map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
              {detail.tips && (
                <div className="bg-muted rounded-lg p-3 text-sm">
                  <span className="font-semibold">小贴士：</span>{detail.tips}
                </div>
              )}
              <Button onClick={() => toggleFav(detail)} className="w-full" variant={favoritedIds.has(detail.id) ? 'outline' : 'default'}>
                <Star className={`w-4 h-4 mr-2 ${favoritedIds.has(detail.id) ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                {favoritedIds.has(detail.id) ? '已收藏' : '收藏到个人知识库'}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
