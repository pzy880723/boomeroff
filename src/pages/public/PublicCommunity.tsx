import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { Loader2, Camera, X, ImageOff } from 'lucide-react';
import { normalizeSellingPoints } from '@/lib/script';
import { Card, CardContent } from '@/components/ui/card';

interface Post {
  id: string;
  image_url: string | null;
  name: string;
  category: ProductCategory;
  era: string | null;
  origin: string | null;
  selling_points: unknown;
  tips: string | null;
  created_at: string;
  is_guest?: boolean;
  guest_name?: string | null;
  user_id?: string | null;
}

const cats: Array<ProductCategory | 'all'> = [
  'all', 'jp_porcelain', 'eu_porcelain', 'anime_toy', 'luxury', 'walkman', 'ccd', 'other',
];

export default function PublicCommunity() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<ProductCategory | 'all'>('all');
  const [active, setActive] = useState<Post | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('community_posts')
      .select('id,image_url,name,category,era,origin,selling_points,tips,created_at,is_guest,guest_name,user_id')
      .eq('is_public', true)
      .eq('is_guest', true)
      .order('created_at', { ascending: false })
      .limit(80);
    if (cat !== 'all') q = q.eq('category', cat);
    const { data } = await q;
    setPosts((data || []) as Post[]);
    setLoading(false);
  }, [cat]);

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
      <div className="flex gap-1.5 overflow-x-auto -mx-3 px-3 pb-1 scrollbar-hide">
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
        <div className="masonry-2col">
          {posts.map((post) => (
            <button
              key={post.id}
              onClick={() => setActive(post)}
              className="masonry-item group block w-full text-left rounded-2xl overflow-hidden bg-card ring-1 ring-border/50 shadow-soft hover:shadow-elevated hover:ring-border transition-all"
            >
              <div className="relative">
                {post.image_url ? (
                  <img
                    src={post.image_url}
                    alt={post.name}
                    loading="lazy"
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
          ))}
        </div>
      )}

      {active && <PostDetailSheet post={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function PostDetailSheet({ post, onClose }: { post: Post; onClose: () => void }) {
  const sp = normalizeSellingPoints(post.selling_points as any);
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto safe-top safe-bottom animate-fade-in">
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
      {post.image_url && (
        <img src={post.image_url} alt={post.name} className="w-full bg-muted" />
      )}
      <div className="container max-w-screen-md py-5 space-y-4">
        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            {CATEGORY_LABELS[post.category]}
          </div>
          <h2 className="mt-1 font-display text-[22px] leading-tight tracking-tight">{post.name}</h2>
          {(post.era || post.origin) && (
            <div className="mt-1.5 text-[12px] text-muted-foreground tracking-wide">
              {[post.era, post.origin].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>

        {sp.length > 0 && (
          <ul className="space-y-2 pt-1 border-t border-border/40 pt-3">
            {sp.map((s, i) => (
              <li key={i} className="text-[13.5px] text-foreground/85 leading-relaxed flex gap-2.5">
                <span className="font-display text-[11px] text-accent tabular-nums shrink-0 mt-1">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{typeof s === 'string' ? s : s.text}</span>
              </li>
            ))}
          </ul>
        )}

        {post.tips && (
          <div className="rounded-2xl bg-accent/8 ring-1 ring-accent/20 p-4 text-[13px] leading-relaxed text-foreground/85 whitespace-pre-wrap">
            {post.tips}
          </div>
        )}
      </div>
    </div>
  );
}
