import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

type TabKey = 'my-kb' | 'community';

interface KbCard {
  key: string;
  source_type: 'official' | 'product' | string;
  source_id: string | null;
  name: string;
  cover: string | null;
  meta?: string | null;
}

interface CommunityCard {
  id: string;
  name: string;
  cover: string | null;
  likes_count: number;
  comments_count: number;
  guest_name: string | null;
}

const PREF_KEY = 'home-feed-tab';
const PAGE = 30;

export function HomeFeedTabs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>(() => {
    try {
      const v = localStorage.getItem(PREF_KEY);
      return v === 'community' ? 'community' : 'my-kb';
    } catch { return 'my-kb'; }
  });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [kbCards, setKbCards] = useState<KbCard[]>([]);
  const [posts, setPosts] = useState<CommunityCard[]>([]);
  const [kbDone, setKbDone] = useState(false);
  const [postsDone, setPostsDone] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, tab); } catch { /* ignore */ }
  }, [tab]);

  // 首屏加载 — 优先用 snapshot 快出图, 再异步补最新数据
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!user) return;
      setLoading(true);
      setKbDone(false); setPostsDone(false);
      try {
        if (tab === 'my-kb') {
          const { data: favs } = await supabase
            .from('user_favorites')
            .select('id, source_type, source_id, snapshot, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(PAGE);
          const rows = (favs || []) as any[];
          if (cancelled) return;
          // 立刻用 snapshot 渲染
          const list: KbCard[] = rows.map((f: any) => {
            const snap = f.snapshot || {};
            const cat = snap?.category as ProductCategory | undefined;
            return {
              key: f.id,
              source_type: f.source_type,
              source_id: f.source_id,
              name: snap?.name || '未命名',
              cover: (snap?.cover_url || snap?.image_url) as string | null,
              meta: cat ? CATEGORY_LABELS[cat] : null,
            };
          });
          setKbCards(list);
          setKbDone(rows.length < PAGE);
          setLoading(false);

          // 异步用最新数据回填 (无 cover / 无 name 的项)
          const need = rows.filter((r: any) => !(r.snapshot?.cover_url || r.snapshot?.image_url));
          const officialIds = need.filter(r => r.source_type === 'official').map(r => r.source_id).filter(Boolean);
          const productIds = need.filter(r => r.source_type === 'product').map(r => r.source_id).filter(Boolean);
          if (officialIds.length || productIds.length) {
            const [of, pr] = await Promise.all([
              officialIds.length ? supabase.from('official_knowledge').select('id,name,cover_url,category').in('id', officialIds) : Promise.resolve({ data: [] as any[] }),
              productIds.length ? supabase.from('products').select('id,name,image_url,category').in('id', productIds) : Promise.resolve({ data: [] as any[] }),
            ]);
            if (cancelled) return;
            const om = new Map<string, any>((of.data || []).map((r: any) => [r.id, r]));
            const pm = new Map<string, any>((pr.data || []).map((r: any) => [r.id, r]));
            setKbCards(prev => prev.map(c => {
              if (c.cover) return c;
              const src = c.source_type === 'official' ? om.get(c.source_id!) : c.source_type === 'product' ? pm.get(c.source_id!) : null;
              if (!src) return c;
              const cat = src.category as ProductCategory | undefined;
              return {
                ...c,
                name: c.name === '未命名' ? (src.name || c.name) : c.name,
                cover: (src.cover_url || src.image_url) as string | null,
                meta: c.meta || (cat ? CATEGORY_LABELS[cat] : null),
              };
            }));
          }
        } else {
          const { data } = await supabase
            .from('community_posts')
            .select('id,image_url,thumbnail_url,name,likes_count,comments_count,guest_name,created_at')
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(PAGE);
          if (cancelled) return;
          const list: CommunityCard[] = (data || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            cover: p.thumbnail_url || thumbUrl(p.image_url, 320) || p.image_url,
            likes_count: p.likes_count ?? 0,
            comments_count: p.comments_count ?? 0,
            guest_name: p.guest_name || null,
          }));
          setPosts(list);
          setPostsDone((data || []).length < PAGE);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, user]);

  const loadMore = async () => {
    if (!user || loadingMore) return;
    setLoadingMore(true);
    try {
      if (tab === 'my-kb') {
        const last = kbCards.at(-1);
        const { data: favs } = await supabase
          .from('user_favorites')
          .select('id, source_type, source_id, snapshot, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .lt('created_at', (last as any)?.created_at || new Date().toISOString())
          .limit(PAGE);
        const rows = (favs || []) as any[];
        const more: KbCard[] = rows.map((f: any) => {
          const snap = f.snapshot || {};
          const cat = snap?.category as ProductCategory | undefined;
          return {
            key: f.id,
            source_type: f.source_type,
            source_id: f.source_id,
            name: snap?.name || '未命名',
            cover: (snap?.cover_url || snap?.image_url) as string | null,
            meta: cat ? CATEGORY_LABELS[cat] : null,
          };
        });
        setKbCards(prev => [...prev, ...more]);
        setKbDone(rows.length < PAGE);
      } else {
        const last = posts.at(-1);
        const { data } = await supabase
          .from('community_posts')
          .select('id,image_url,thumbnail_url,name,likes_count,comments_count,guest_name,created_at')
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .lt('created_at', (last as any)?.created_at || new Date().toISOString())
          .limit(PAGE);
        const more: CommunityCard[] = (data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          cover: p.thumbnail_url || thumbUrl(p.image_url, 320) || p.image_url,
          likes_count: p.likes_count ?? 0,
          comments_count: p.comments_count ?? 0,
          guest_name: p.guest_name || null,
        }));
        setPosts(prev => [...prev, ...more]);
        setPostsDone((data || []).length < PAGE);
      }
    } finally {
      setLoadingMore(false);
    }
  };

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
      <Link to="/community">
        <Button size="sm" variant="secondary" className="h-7 px-2.5 text-xs rounded-full">
          <Camera className="w-3.5 h-3.5 mr-1" />去 BOOMER 圈
        </Button>
      </Link>
    );
  }, [tab]);

  const isEmpty = tab === 'my-kb' ? kbCards.length === 0 : posts.length === 0;
  const done = tab === 'my-kb' ? kbDone : postsDone;

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
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-border/60 bg-card">
              <div className="aspect-square bg-muted animate-pulse" />
              <div className="p-2 space-y-1">
                <div className="h-3 w-3/4 bg-muted rounded animate-pulse" />
                <div className="h-2.5 w-1/2 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
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
        <div className="grid grid-cols-2 gap-2">
          {kbCards.map((c) => {
            const to = c.source_type === 'official'
              ? `/library/${c.source_id}`
              : c.source_type === 'product'
                ? `/my-library?product=${c.source_id}`
                : '/my-library';
            return (
              <Link
                key={c.key}
                to={to}
                className="block rounded-xl overflow-hidden bg-card border border-border/60 shadow-sm"
              >
                {c.cover ? (
                  <img
                    src={thumbUrl(c.cover, 320) || c.cover}
                    alt={c.name}
                    className="w-full aspect-square object-cover bg-muted block"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full aspect-square bg-muted flex items-center justify-center text-muted-foreground">
                    <ImageOff className="w-5 h-5" />
                  </div>
                )}
                <div className="p-2">
                  <p className="text-[12.5px] font-medium leading-snug line-clamp-2">{c.name}</p>
                  {c.meta && <p className="text-[10.5px] text-muted-foreground mt-0.5">{c.meta}</p>}
                </div>
              </Link>
            );
          })}
        </div>

      ) : (
        <div className="grid grid-cols-2 gap-2">
          {posts.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/community?post=${p.id}`)}
              className="block w-full text-left rounded-xl overflow-hidden bg-card border border-border/60 shadow-sm"
            >
              {p.cover ? (
                <img
                  src={p.cover}
                  alt={p.name}
                  className="w-full aspect-square object-cover bg-muted block"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="w-full aspect-square bg-muted flex items-center justify-center text-muted-foreground">
                  <ImageOff className="w-5 h-5" />
                </div>
              )}
              <div className="p-2 space-y-1">
                <p className="text-[12.5px] font-medium leading-snug line-clamp-2">{p.name}</p>
                <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                  <span className="truncate">{p.guest_name || '店员'}</span>
                  <span className="inline-flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-0.5"><Heart className="w-3 h-3" />{p.likes_count}</span>
                    <span className="inline-flex items-center gap-0.5"><MessageCircle className="w-3 h-3" />{p.comments_count}</span>
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && !isEmpty && (
        <div className="mt-3 flex justify-center">
          {done ? (
            <span className="text-[11px] text-muted-foreground">— 到底啦 —</span>
          ) : (
            <Button variant="outline" size="sm" className="h-7 rounded-full text-xs" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '加载更多'}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
