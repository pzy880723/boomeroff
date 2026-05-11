import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { normalizeSellingPoints } from '@/lib/script';
import { Heart, MessageSquare, Loader2, Camera } from 'lucide-react';
import { toast } from 'sonner';

interface Post {
  id: string;
  user_id: string | null;
  product_id: string | null;
  image_url: string | null;
  name: string;
  category: ProductCategory;
  era: string | null;
  origin: string | null;
  selling_points: unknown;
  tips: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  is_public: boolean;
  is_guest?: boolean;
  guest_name?: string | null;
}

interface ProfileLite { user_id: string; display_name: string | null; }

const cats: Array<ProductCategory | 'all'> = ['all', 'jp_porcelain', 'eu_porcelain', 'anime_toy', 'luxury', 'walkman', 'ccd', 'other'];

export default function PublicCommunity() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<ProductCategory | 'all'>('all');

  const loadPosts = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('community_posts').select('*').eq('is_public', true)
      .order('created_at', { ascending: false }).limit(60);
    if (cat !== 'all') q = q.eq('category', cat);
    const { data } = await q;
    const list = (data || []) as Post[];
    setPosts(list);

    const userIds = Array.from(new Set(list.map((p) => p.user_id).filter(Boolean))) as string[];
    if (userIds.length) {
      const { data: profs } = await supabase.from('profiles')
        .select('user_id, display_name').in('user_id', userIds);
      const map: Record<string, ProfileLite> = {};
      (profs || []).forEach((p) => { map[p.user_id] = p as ProfileLite; });
      setProfiles(map);
    }
    setLoading(false);
  }, [cat]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const fmtTime = (s: string) => {
    const d = new Date(s);
    const diff = Date.now() - d.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return `${m} 分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小时前`;
    return d.toLocaleDateString('zh-CN');
  };

  const authorName = (post: Post) => {
    if (post.is_guest) return post.guest_name || '游客';
    if (post.user_id && profiles[post.user_id]?.display_name) return profiles[post.user_id].display_name!;
    return '店员';
  };

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
        <ul className="space-y-3">
          {posts.map((post) => {
            const sp = normalizeSellingPoints(post.selling_points as any).slice(0, 2);
            const isGuest = !!post.is_guest;
            return (
              <li key={post.id}>
                <Card>
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className={isGuest
                          ? 'bg-muted text-muted-foreground text-xs font-medium'
                          : 'bg-gradient-primary text-primary-foreground text-xs font-medium'}>
                          {isGuest ? '游' : authorName(post).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate flex items-center gap-1.5">
                          {authorName(post)}
                          {isGuest && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">游客</span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{fmtTime(post.created_at)}</div>
                      </div>
                      <Badge variant="outline" className="text-[11px]">{CATEGORY_LABELS[post.category]}</Badge>
                    </div>

                    {post.image_url && (
                      <div className="-mx-3">
                        <img
                          src={post.image_url}
                          alt={post.name}
                          loading="lazy"
                          className="w-full max-h-72 object-cover bg-muted"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="text-sm font-semibold">{post.name}</div>
                      {(post.era || post.origin) && (
                        <div className="text-xs text-muted-foreground">
                          {[post.era, post.origin].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {sp.length > 0 && (
                        <ul className="text-xs text-muted-foreground space-y-0.5 pt-1">
                          {sp.map((s, i) => (
                            <li key={i}>· {typeof s === 'string' ? s : s.text}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => toast('登录店员账号即可点赞 / 评论', { description: '游客模式仅限浏览' })}
                      >
                        <Heart className="w-3.5 h-3.5" /> {post.likes_count}
                      </button>
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => toast('登录店员账号即可点赞 / 评论', { description: '游客模式仅限浏览' })}
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> {post.comments_count}
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pt-2 text-center">
        <Button asChild variant="outline" size="sm">
          <Link to="/scan">想点赞/评论？登录店员账号 →</Link>
        </Button>
      </div>
    </div>
  );
}
