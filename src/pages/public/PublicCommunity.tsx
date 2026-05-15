import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { Camera, X, ImageOff, Heart, MessageCircle, MessageSquareHeart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { GuestProductCard } from '@/components/recognition/GuestProductCard';
import shopWechatQr from '@/assets/shop-wechat-qr.png';

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

interface Post {
  id: string;
  image_url: string | null;
  thumbnail_url: string | null;
  name: string;
  category: ProductCategory;
  era: string | null;
  origin: string | null;
  selling_points: unknown;
  tips: string | null;
  story?: string | null;
  appreciation?: string | null;
  description?: string | null;
  care_tips?: string | null;
  material?: string | null;
  craft?: string | null;
  dimensions?: string | null;
  condition?: string | null;
  confidence?: number | null;
  rarity?: number | null;
  collection_value?: string | null;
  market_value?: string | null;
  buy_reason?: string | null;
  created_at: string;
  likes_count?: number;
  comments_count?: number;
  is_guest?: boolean;
  guest_name?: string | null;
  user_id?: string | null;
}

const cats: Array<ProductCategory | 'all'> = [
  'all', 'jp_porcelain', 'eu_porcelain', 'anime_toy', 'luxury', 'walkman', 'ccd', 'other',
];

export default function PublicCommunity() {
  const PAGE_SIZE = 24;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cat, setCat] = useState<ProductCategory | 'all'>('all');
  const [active, setActive] = useState<Post | null>(null);

  const fetchPage = useCallback(async (offset: number) => {
    let q = supabase.from('community_posts')
      .select('id,image_url,thumbnail_url,name,category,era,origin,selling_points,tips,story,appreciation,description,care_tips,material,craft,dimensions,condition,confidence,rarity,collection_value,market_value,buy_reason,created_at,likes_count,comments_count,is_guest,guest_name,user_id')
      .eq('is_public', true)
      .eq('is_guest', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (cat !== 'all') q = q.eq('category', cat);
    const { data } = await q;
    return (data || []) as Post[];
  }, [cat]);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const rows = await fetchPage(0);
    setPosts(rows);
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const rows = await fetchPage(posts.length);
    setPosts((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setLoadingMore(false);
  }, [fetchPage, posts.length, loadingMore, hasMore]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  return (
    <div className="container max-w-screen-md py-4 space-y-4">
      {/* 头图 */}
      <header className="px-1">
        <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">Community Feed</div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="font-display text-[24px] leading-tight tracking-tight">中古圈</h1>
          <Link
            to="/u"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            <Camera className="w-3.5 h-3.5" /> 我也拍一张
          </Link>
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground leading-relaxed">
          顾客们随手拍到的中古好物，像逛市集一样滑动浏览。
        </p>
      </header>

      {/* 分类筛选 */}
      <div className="flex gap-1.5 overflow-x-auto -mx-3 px-3 pb-1">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`shrink-0 px-3.5 py-1.5 text-[12px] rounded-full transition-all ${
              cat === c
                ? 'bg-foreground text-background font-medium shadow-soft'
                : 'bg-card text-muted-foreground ring-1 ring-border/60 hover:text-foreground'
            }`}
          >
            {c === 'all' ? '全部' : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {/* 内容 */}
      {loading ? (
        <div className="masonry-2col">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="masonry-item rounded-2xl bg-muted animate-pulse"
              style={{ height: 160 + (i % 3) * 60 }}
            />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <ImageOff className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              还没有人分享过呢
            </p>
            <Link
              to="/u"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full bg-foreground text-background"
            >
              <Camera className="w-3.5 h-3.5" /> 来发第一张
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="masonry-2col">
          {posts.map((post, idx) => {
            const src = post.thumbnail_url || post.image_url;
            const eager = idx < 4;
            return (
            <button
              key={post.id}
              onClick={() => setActive(post)}
              className="masonry-item group block w-full text-left rounded-2xl overflow-hidden bg-card ring-1 ring-border/50 shadow-soft hover:shadow-elevated hover:ring-border transition-all"
            >
              <div className="relative">
                {src ? (
                  <img
                    src={src}
                    alt={post.name}
                    loading={eager ? 'eager' : 'lazy'}
                    decoding="async"
                    // @ts-expect-error fetchpriority is a valid HTML attribute
                    fetchpriority={eager ? 'high' : 'low'}
                    className="w-full h-auto block bg-muted transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="w-full aspect-square bg-muted" />
                )}
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-background/80 backdrop-blur text-[10px] font-medium ring-1 ring-border/60">
                  {CATEGORY_LABELS[post.category]}
                </span>
              </div>
              <div className="p-3 space-y-1.5">
                <div className="text-[13px] font-medium leading-snug line-clamp-2">{post.name}</div>
                {(post.era || post.origin) && (
                  <div className="text-[11px] text-muted-foreground line-clamp-1 tracking-wide">
                    {[post.era, post.origin].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </button>
            );
          })}
        </div>
        {hasMore && (
          <div className="flex justify-center pt-3 pb-1">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-5 h-10 rounded-full bg-card ring-1 ring-border/60 text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60"
            >
              {loadingMore ? '加载中…' : '加载更多'}
            </button>
          </div>
        )}
        </>
      )}

      {active && <PostDetailSheet post={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function PostDetailSheet({ post, onClose }: { post: Post; onClose: () => void }) {
  const cardData = {
    name: post.name,
    category: post.category,
    era: post.era,
    origin: post.origin,
    material: post.material,
    craft: post.craft,
    dimensions: post.dimensions,
    condition: post.condition,
    sellingPoints: post.selling_points,
    story: post.story,
    appreciation: post.appreciation,
    description: post.description,
    careTips: post.care_tips,
    tips: post.tips,
    confidence: post.confidence,
    rarity: post.rarity,
    collectionValue: post.collection_value,
    marketValue: post.market_value,
    buyReason: post.buy_reason,
  };

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto safe-top safe-bottom animate-fade-in">
      {/* 顶部条 */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-3 h-12 border-b border-border/40 bg-background/85 backdrop-blur-xl">
        <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors" aria-label="关闭">
          <X className="w-5 h-5" />
        </button>
        <Link
          to="/u"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-foreground text-background"
        >
          <Camera className="w-3.5 h-3.5" />
          我也来拍一拍
        </Link>
      </div>

      <div className="container max-w-screen-md py-5 space-y-6">
        {/* 编辑式卡 */}
        <GuestProductCard result={cardData} imageUrl={post.image_url} />

        {/* 帖子元信息 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-muted-foreground tracking-wide px-1">
          <span>{post.guest_name || '游客'} · {timeAgo(post.created_at)}</span>
          <span className="inline-flex items-center gap-1"><Heart className="w-3 h-3" /> {post.likes_count ?? 0}</span>
          <span className="inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {post.comments_count ?? 0}</span>
        </div>

        {/* 喜欢这件? 加店铺微信 */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-primary text-primary-foreground p-6 mx-1 shadow-elevated">
          <div className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-accent/25 blur-3xl pointer-events-none" />
          <div className="absolute -left-6 -top-6 w-28 h-28 rounded-full bg-accent/10 blur-2xl pointer-events-none" />
          <div className="relative flex flex-col items-center text-center space-y-4">
            <div className="space-y-1.5">
              <div className="text-[10px] tracking-[0.22em] uppercase opacity-80">Take It Home</div>
              <h3 className="font-display text-[20px] leading-tight tracking-tight inline-flex items-center gap-1.5">
                <MessageSquareHeart className="w-5 h-5" /> 喜欢这件中古？
              </h3>
              <p className="text-[12.5px] leading-relaxed opacity-85 max-w-[20rem] mx-auto">
                长按下方二维码，添加店铺微信，和店员聊聊这件物件的细节、价格与到店时间。
              </p>
            </div>
            <div className="rounded-2xl bg-white p-3 shadow-soft">
              <img
                src={shopWechatQr}
                alt="店铺微信二维码"
                className="block w-40 h-40 object-contain select-none"
                draggable={false}
              />
            </div>
            <div className="text-[11px] opacity-80 tracking-wide">
              长按二维码 · 识别添加微信
            </div>
          </div>
        </section>

        {/* 底部行动 */}
        <div className="grid grid-cols-2 gap-2.5 px-1 pb-2">
          <button
            onClick={onClose}
            className="h-11 rounded-2xl bg-card ring-1 ring-border/60 text-[13px] font-medium hover:bg-muted transition-colors"
          >
            返回中古圈
          </button>
          <Link
            to="/u"
            onClick={onClose}
            className="h-11 rounded-2xl bg-foreground text-background text-[13px] font-medium inline-flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
          >
            <Camera className="w-3.5 h-3.5" /> 我也拍一张
          </Link>
        </div>
      </div>
    </div>
  );
}
