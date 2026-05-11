import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { Loader2, Camera, X } from 'lucide-react';
import { normalizeSellingPoints } from '@/lib/script';

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
    <div className="container max-w-screen-md py-3 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">中古圈</h1>
        <Link to="/u" className="text-xs text-primary inline-flex items-center gap-1">
          <Camera className="w-3.5 h-3.5" /> 我也拍一张
        </Link>
      </div>

      <div className="flex gap-1.5 overflow-x-auto -mx-3 px-3 pb-1">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`shrink-0 px-3 py-1 text-xs rounded-full border transition-colors ${
              cat === c
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {c === 'all' ? '全部' : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            还没有帖子，去 <Link to="/u" className="text-primary underline">拍一张</Link> 试试吧
          </CardContent>
        </Card>
      ) : (
        <div className="masonry-2col">
          {posts.map((post) => (
            <button
              key={post.id}
              onClick={() => setActive(post)}
              className="masonry-item block w-full text-left rounded-xl overflow-hidden bg-card border border-border/60 shadow-soft hover:shadow-md transition-shadow"
            >
              {post.image_url ? (
                <img
                  src={post.image_url}
                  alt={post.name}
                  loading="lazy"
                  className="w-full h-auto block bg-muted"
                />
              ) : (
                <div className="w-full aspect-square bg-muted" />
              )}
              <div className="p-2.5 space-y-1">
                <div className="text-[13px] font-medium leading-snug line-clamp-2">{post.name}</div>
                {(post.era || post.origin) && (
                  <div className="text-[11px] text-muted-foreground line-clamp-1">
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
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto safe-top safe-bottom">
      <div className="sticky top-0 z-10 flex items-center justify-between px-3 h-12 border-b border-border/60 bg-background/95 backdrop-blur">
        <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-muted" aria-label="关闭">
          <X className="w-5 h-5" />
        </button>
        <Link
          to="/u"
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground"
        >
          <Camera className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
          我也来拍一拍
        </Link>
      </div>
      {post.image_url && (
        <img src={post.image_url} alt={post.name} className="w-full bg-muted" />
      )}
      <div className="container max-w-screen-md py-4 space-y-3">
        <h2 className="text-lg font-semibold leading-tight">{post.name}</h2>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-0.5 rounded-full bg-muted">{CATEGORY_LABELS[post.category]}</span>
          {post.era && <span>{post.era}</span>}
          {post.origin && <span>{post.origin}</span>}
        </div>
        {sp.length > 0 && (
          <ul className="space-y-1.5 pt-1">
            {sp.map((s, i) => (
              <li key={i} className="text-sm text-foreground/85 leading-relaxed">
                · {typeof s === 'string' ? s : s.text}
              </li>
            ))}
          </ul>
        )}
        {post.tips && (
          <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/40">
            <CardContent className="p-3 text-[13px] leading-relaxed text-amber-900 dark:text-amber-100 whitespace-pre-wrap">
              {post.tips}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
