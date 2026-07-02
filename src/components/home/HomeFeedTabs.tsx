import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  GraduationCap, Camera, ImageOff, ChevronRight, Loader2,
  Heart, MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { thumbUrl } from '@/lib/imageUrl';
import { CATEGORY_LABELS, type ProductCategory } from '@/types';
import { PostDetailSheet, type Post as CommunityPost } from '@/pages/public/PublicCommunity';


type TabKey = 'my-kb' | 'community';

interface KbCard {
  key: string;
  source_type: 'official' | 'product' | string;
  source_id: string | null;
  name: string;
  cover: string | null;
  meta?: string | null;
  officialRow?: any;
  productRow?: any;
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
  const [kbCards, setKbCards] = useState<KbCard[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [activePost, setActivePost] = useState<CommunityPost | null>(null);
  const [activeKb, setActiveKb] = useState<KbCard | null>(null);

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
              ? supabase.from('official_knowledge').select('*').in('id', officialIds)
              : Promise.resolve({ data: [] as any[] }),
            productIds.length
              ? supabase.from('products').select('*').in('id', productIds)
              : Promise.resolve({ data: [] as any[] }),
          ]);
          const om = new Map<string, any>((officialFresh.data || []).map((r: any) => [r.id, r]));
          const pm = new Map<string, any>((productFresh.data || []).map((r: any) => [r.id, r]));
          const list: KbCard[] = rows.map((f: any) => {
            const snap = f.snapshot || {};
            const src = f.source_type === 'official' ? om.get(f.source_id) : f.source_type === 'product' ? pm.get(f.source_id) : null;
            const name = src?.name || snap?.name || '未命名';
            const cover = (src?.cover_url || src?.image_url || snap?.cover_url || snap?.image_url) as string | null;
            const cat = (src?.category || snap?.category) as ProductCategory | undefined;
            return {
              key: f.id,
              source_type: f.source_type,
              source_id: f.source_id,
              name,
              cover,
              meta: cat ? CATEGORY_LABELS[cat] : null,
              officialRow: f.source_type === 'official' ? src : undefined,
              productRow: f.source_type === 'product' ? src : undefined,
            };
          });
          if (!cancelled) setKbCards(list);
        } else {
          const { data } = await supabase
            .from('community_posts')
            .select('id,image_url,thumbnail_url,name,category,era,origin,selling_points,tips,story,appreciation,description,care_tips,material,craft,dimensions,condition,confidence,rarity,collection_value,market_value,buy_reason,created_at,likes_count,comments_count,is_guest,guest_name,user_id')
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(10);
          if (!cancelled) setPosts((data as any as CommunityPost[]) || []);
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

  const isEmpty = tab === 'my-kb' ? kbCards.length === 0 : posts.length === 0;

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
      ) : isEmpty ? (
        <div className="rounded-2xl border border-dashed border-border/60 py-10 text-center text-xs text-muted-foreground">
          {tab === 'my-kb' ? '还没收藏，去知识库星标你想学的' : '还没人发帖，识别一件商品分享出来吧'}
          <div className="mt-2">
            <Link to={tab === 'my-kb' ? '/library' : '/community'} className="text-primary inline-flex items-center">
              去看看 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      ) : tab === 'my-kb' ? (
        <div className="columns-2 gap-2 [column-fill:_balance]">
          {kbCards.map((c) => (
            <button
              key={c.key}
              onClick={() => setActiveKb(c)}
              className="mb-2 break-inside-avoid block w-full text-left rounded-xl overflow-hidden bg-card border border-border/60 shadow-sm"
            >
              {c.cover ? (
                <img
                  src={thumbUrl(c.cover, 320) || c.cover}
                  alt={c.name}
                  className="w-full h-auto bg-muted block"
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
            </button>
          ))}
        </div>
      ) : (
        <div className="columns-2 gap-2 [column-fill:_balance]">
          {posts.map((p) => {
            const cover = p.thumbnail_url || thumbUrl(p.image_url, 320) || p.image_url;
            return (
              <button
                key={p.id}
                onClick={() => setActivePost(p)}
                className="mb-2 break-inside-avoid block w-full text-left rounded-xl overflow-hidden bg-card border border-border/60 shadow-sm"
              >
                {cover ? (
                  <img
                    src={cover}
                    alt={p.name}
                    className="w-full h-auto bg-muted block"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full bg-muted flex items-center justify-center text-muted-foreground" style={{ aspectRatio: '3 / 4' }}>
                    <ImageOff className="w-5 h-5" />
                  </div>
                )}
                <div className="p-2 space-y-1">
                  <p className="text-[12.5px] font-medium leading-snug line-clamp-2">{p.name}</p>
                  <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                    <span className="truncate">{p.guest_name || '游客'}</span>
                    <span className="inline-flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-0.5"><Heart className="w-3 h-3" />{p.likes_count ?? 0}</span>
                      <span className="inline-flex items-center gap-0.5"><MessageCircle className="w-3 h-3" />{p.comments_count ?? 0}</span>
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* BOOMER 圈 弹窗 (复用公开版详情) */}
      {activePost && <PostDetailSheet post={activePost} onClose={() => setActivePost(null)} />}

      {/* 我的知识 弹窗 */}
      {activeKb && activeKb.source_type === 'product' && activeKb.productRow ? (
        <ProductDetailDialog
          product={activeKb.productRow}
          open
          onOpenChange={(o) => !o && setActiveKb(null)}
        />
      ) : null}

      {activeKb && activeKb.source_type !== 'product' ? (
        <Dialog open onOpenChange={(o) => !o && setActiveKb(null)}>
          <DialogContent className="max-w-md p-0 overflow-hidden max-h-[90vh] flex flex-col">
            <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
              <DialogTitle className="text-base">{activeKb.name}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto px-4 pb-4 space-y-3">
              {activeKb.cover && (
                <img src={activeKb.cover} alt={activeKb.name} className="w-full h-auto rounded-xl bg-muted" />
              )}
              {activeKb.meta && (
                <div className="text-xs text-muted-foreground">{activeKb.meta}</div>
              )}
              {activeKb.officialRow?.description && (
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {activeKb.officialRow.description}
                </p>
              )}
              {activeKb.source_id && (
                <Link
                  to={`/library/${activeKb.source_id}`}
                  onClick={() => setActiveKb(null)}
                  className="inline-flex items-center gap-1 text-xs text-primary"
                >
                  查看完整详情 <ChevronRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
