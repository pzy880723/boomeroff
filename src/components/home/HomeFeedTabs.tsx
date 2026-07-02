import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { GraduationCap, Camera, ImageOff, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { thumbUrl } from '@/lib/imageUrl';
import { CATEGORY_LABELS, type ProductCategory } from '@/types';

type TabKey = 'my-kb' | 'community';

interface FeedCard {
  id: string;
  to: string;
  name: string;
  cover: string | null;
  meta?: string | null;
}

const PREF_KEY = 'home-feed-tab';

export function HomeFeedTabs() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>(() => {
    try {
      const v = localStorage.getItem(PREF_KEY);
      return v === 'community' ? 'community' : 'my-kb';
    } catch { return 'my-kb'; }
  });
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<FeedCard[]>([]);

  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, tab); } catch { /* ignore */ }
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!user) return;
      setLoading(true);
      try {
        if (tab === 'my-kb') {
          const { data: favs } = await supabase
            .from('user_favorites')
            .select('id, source_type, source_id, snapshot, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10);
          const rows = (favs || []) as any[];
          const officialIds = rows.filter(r => r.source_type === 'official').map(r => r.source_id).filter(Boolean);
          const productIds = rows.filter(r => r.source_type === 'product').map(r => r.source_id).filter(Boolean);
          const [officialFresh, productFresh] = await Promise.all([
            officialIds.length
              ? supabase.from('official_knowledge').select('id, name, cover_url, category').in('id', officialIds)
              : Promise.resolve({ data: [] as any[] }),
            productIds.length
              ? supabase.from('products').select('id, name, image_url, category').in('id', productIds)
              : Promise.resolve({ data: [] as any[] }),
          ]);
          const om = new Map<string, any>((officialFresh.data || []).map((r: any) => [r.id, r]));
          const pm = new Map<string, any>((productFresh.data || []).map((r: any) => [r.id, r]));
          const list: FeedCard[] = rows.map((f: any) => {
            const snap = f.snapshot || {};
            const src = f.source_type === 'official' ? om.get(f.source_id) : f.source_type === 'product' ? pm.get(f.source_id) : null;
            const name = src?.name || snap?.name || '未命名';
            const cover = (src?.cover_url || src?.image_url || snap?.cover_url || snap?.image_url) as string | null;
            const cat = (src?.category || snap?.category) as ProductCategory | undefined;
            return {
              id: f.id,
              to: '/my-library',
              name,
              cover,
              meta: cat ? CATEGORY_LABELS[cat] : null,
            };
          });
          if (!cancelled) setCards(list);
        } else {
          const { data: posts } = await supabase
            .from('community_posts')
            .select('id, name, image_url, thumbnail_url, category')
            .eq('is_public', true)
            .eq('is_guest', false)
            .order('created_at', { ascending: false })
            .limit(10);
          const list: FeedCard[] = ((posts as any[]) || []).map((p) => ({
            id: p.id,
            to: '/community',
            name: p.name || '未命名',
            cover: p.thumbnail_url || p.image_url || null,
            meta: p.category ? CATEGORY_LABELS[p.category as ProductCategory] : null,
          }));
          if (!cancelled) setCards(list);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, user]);

  const rightAction = useMemo(() => {
    if (tab === 'my-kb') {
      return (
        <Link to="/my-library">
          <Button size="sm" variant="secondary" className="h-7 px-2.5 text-xs rounded-full">
            <GraduationCap className="w-3.5 h-3.5 mr-1" />测试一下
          </Button>
        </Link>
      );
    }
    return (
      <Link to="/scan">
        <Button size="sm" variant="secondary" className="h-7 px-2.5 text-xs rounded-full">
          <Camera className="w-3.5 h-3.5 mr-1" />发一条
        </Button>
      </Link>
    );
  }, [tab]);

  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="inline-flex rounded-full bg-muted p-0.5 text-xs">
          <button
            onClick={() => setTab('my-kb')}
            className={cn(
              'px-3 h-7 rounded-full font-medium transition-colors',
              tab === 'my-kb' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground',
            )}
          >我的知识</button>
          <button
            onClick={() => setTab('community')}
            className={cn(
              'px-3 h-7 rounded-full font-medium transition-colors',
              tab === 'community' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground',
            )}
          >BOOMER 圈</button>
        </div>
        {rightAction}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 py-10 text-center text-xs text-muted-foreground">
          {tab === 'my-kb' ? '还没收藏，去知识库星标你想学的' : '还没人发帖，识别一件商品分享出来吧'}
          <div className="mt-2">
            <Link to={tab === 'my-kb' ? '/library' : '/community'} className="text-primary inline-flex items-center">
              去看看 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="columns-2 gap-2 [column-fill:_balance]">
          {cards.map((c) => (
            <Link
              key={c.id}
              to={c.to}
              className="mb-2 break-inside-avoid block rounded-xl overflow-hidden bg-card border border-border/60 shadow-sm"
            >
              {c.cover ? (
                <img
                  src={thumbUrl(c.cover, 240) || c.cover}
                  alt={c.name}
                  className="w-full h-auto bg-muted"
                  style={{ aspectRatio: '3 / 4' }}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="w-full bg-muted flex items-center justify-center text-muted-foreground" style={{ aspectRatio: '3 / 4' }}>
                  <ImageOff className="w-5 h-5" />
                </div>
              )}
              <div className="p-2">
                <p className="text-[12.5px] font-medium leading-snug line-clamp-2">{c.name}</p>
                {c.meta && <p className="text-[10.5px] text-muted-foreground mt-0.5">{c.meta}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
