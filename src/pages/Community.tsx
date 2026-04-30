import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { Heart, MessageCircle, Star, Loader2, Send } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Post {
  id: string;
  user_id: string;
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
}

interface ProfileLite { user_id: string; display_name: string | null; }
interface Comment {
  id: string; user_id: string; content: string; created_at: string;
  profile?: ProfileLite;
}

const cats: Array<ProductCategory | 'all'> = ['all', ...Object.keys(CATEGORY_LABELS) as ProductCategory[]];

export default function Community() {
  const { user, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<ProductCategory | 'all'>('all');
  const [active, setActive] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');

  const loadPosts = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('community_posts').select('*').eq('is_public', true).order('created_at', { ascending: false });
    if (cat !== 'all') q = q.eq('category', cat);
    const { data: postsData } = await q.limit(60);
    const list = (postsData || []) as Post[];
    setPosts(list);

    const userIds = Array.from(new Set(list.map((p) => p.user_id)));
    if (userIds.length) {
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
      const map: Record<string, ProfileLite> = {};
      (profs || []).forEach((p) => { map[p.user_id] = p as ProfileLite; });
      setProfiles(map);
    }

    if (user) {
      const ids = list.map((p) => p.id);
      if (ids.length) {
        const { data: myLikes } = await supabase.from('community_likes')
          .select('post_id').eq('user_id', user.id).in('post_id', ids);
        setLikes(new Set((myLikes || []).map((l) => l.post_id)));
      }
      const { data: myFavs } = await supabase.from('user_favorites')
        .select('source_id').eq('user_id', user.id).eq('source_type', 'recognition');
      setFavs(new Set((myFavs || []).map((f) => f.source_id)));
    }
    setLoading(false);
  }, [cat, user]);

  useEffect(() => { if (user) loadPosts(); }, [user, loadPosts]);

  // realtime
  useEffect(() => {
    const ch = supabase.channel('community-posts-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_posts' }, (payload) => {
        const np = payload.new as Post;
        if (np.is_public && (cat === 'all' || np.category === cat)) {
          setPosts((p) => [np, ...p]);
          if (!profiles[np.user_id]) {
            supabase.from('profiles').select('user_id, display_name').eq('user_id', np.user_id).single()
              .then(({ data }) => data && setProfiles((m) => ({ ...m, [np.user_id]: data as ProfileLite })));
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cat, profiles]);

  const toggleLike = async (post: Post) => {
    if (!user) return;
    const liked = likes.has(post.id);
    if (liked) {
      await supabase.from('community_likes').delete().eq('post_id', post.id).eq('user_id', user.id);
      setLikes((s) => { const n = new Set(s); n.delete(post.id); return n; });
      setPosts((ps) => ps.map((p) => p.id === post.id ? { ...p, likes_count: Math.max(p.likes_count - 1, 0) } : p));
    } else {
      await supabase.from('community_likes').insert({ post_id: post.id, user_id: user.id });
      setLikes((s) => new Set(s).add(post.id));
      setPosts((ps) => ps.map((p) => p.id === post.id ? { ...p, likes_count: p.likes_count + 1 } : p));
    }
  };

  const toggleFav = async (post: Post) => {
    if (!user || !post.product_id) return;
    if (favs.has(post.product_id)) {
      await supabase.from('user_favorites').delete()
        .eq('user_id', user.id).eq('source_type', 'recognition').eq('source_id', post.product_id);
      setFavs((s) => { const n = new Set(s); n.delete(post.product_id!); return n; });
      toast.success('已取消收藏');
    } else {
      await supabase.from('user_favorites').insert({
        user_id: user.id, source_type: 'recognition', source_id: post.product_id,
        snapshot: { name: post.name, category: post.category, image_url: post.image_url },
      });
      setFavs((s) => new Set(s).add(post.product_id!));
      toast.success('已收藏');
    }
  };

  const openDetail = async (post: Post) => {
    setActive(post);
    setComments([]);
    const { data } = await supabase.from('community_comments')
      .select('*').eq('post_id', post.id).order('created_at', { ascending: true }).limit(100);
    const list = (data || []) as Comment[];
    const userIds = Array.from(new Set(list.map((c) => c.user_id))).filter((id) => !profiles[id]);
    if (userIds.length) {
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
      (profs || []).forEach((p) => { profiles[p.user_id] = p as ProfileLite; });
      setProfiles({ ...profiles });
    }
    setComments(list);
  };

  const submitComment = async () => {
    if (!user || !active || !commentText.trim()) return;
    const text = commentText.trim();
    setCommentText('');
    const { data, error } = await supabase.from('community_comments')
      .insert({ post_id: active.id, user_id: user.id, content: text }).select().single();
    if (error) { toast.error('评论失败'); return; }
    setComments((c) => [...c, data as Comment]);
    setPosts((ps) => ps.map((p) => p.id === active.id ? { ...p, comments_count: p.comments_count + 1 } : p));
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  return (
    <>
      <PageHeader title="中古圈" subtitle="发现别人的中古好物" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {cats.map((c) => (
            <Badge
              key={c} variant={cat === c ? 'default' : 'outline'}
              className="cursor-pointer shrink-0 px-3 py-1"
              onClick={() => setCat(c)}
            >
              {c === 'all' ? '全部' : CATEGORY_LABELS[c]}
            </Badge>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : posts.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">还没有动态，识别一件商品分享出来吧</div>
        ) : (
          <div className="columns-2 gap-3 [column-fill:_balance]">
            {posts.map((p) => {
              const prof = profiles[p.user_id];
              const liked = likes.has(p.id);
              const faved = p.product_id ? favs.has(p.product_id) : false;
              return (
                <div key={p.id} className="mb-3 break-inside-avoid">
                  <div className="rounded-xl overflow-hidden bg-card border border-border/60 shadow-sm" onClick={() => openDetail(p)}>
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="aspect-square bg-muted" />
                    )}
                    <div className="p-2.5 space-y-2">
                      <p className="text-sm font-medium leading-tight line-clamp-2">{p.name}</p>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{CATEGORY_LABELS[p.category]}</Badge>
                        {p.era && <span className="text-[10px] text-muted-foreground truncate">{p.era}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[10px]">{(prof?.display_name || '?').charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="text-[11px] text-muted-foreground truncate flex-1">{prof?.display_name || '匿名'}</span>
                        <button onClick={(e) => { e.stopPropagation(); toggleLike(p); }} className="flex items-center gap-0.5 text-muted-foreground">
                          <Heart className={cn('w-3.5 h-3.5', liked && 'fill-red-500 text-red-500')} />
                          <span className="text-[11px] tabular-nums">{p.likes_count}</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); toggleFav(p); }} className="flex items-center text-muted-foreground">
                          <Star className={cn('w-3.5 h-3.5', faved && 'fill-yellow-400 text-yellow-400')} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent side="bottom" className="h-[90vh] flex flex-col p-0">
          {active && (
            <>
              <SheetHeader className="p-4 border-b shrink-0">
                <SheetTitle className="text-left">{active.name}</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {active.image_url && <img src={active.image_url} className="w-full rounded-lg" alt={active.name} />}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{CATEGORY_LABELS[active.category]}</Badge>
                  {active.era && <Badge variant="outline">{active.era}</Badge>}
                  {active.origin && <Badge variant="outline">{active.origin}</Badge>}
                </div>
                {Array.isArray(active.selling_points) && (active.selling_points as string[]).length > 0 && (
                  <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                    {(active.selling_points as string[]).map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                )}
                {active.tips && <div className="bg-muted rounded-lg p-3 text-sm">{active.tips}</div>}

                <div className="flex items-center gap-3 pt-2 border-t">
                  <Button variant="outline" size="sm" onClick={() => toggleLike(active)}>
                    <Heart className={cn('w-4 h-4 mr-1', likes.has(active.id) && 'fill-red-500 text-red-500')} />
                    {active.likes_count}
                  </Button>
                  {active.product_id && (
                    <Button variant="outline" size="sm" onClick={() => toggleFav(active)}>
                      <Star className={cn('w-4 h-4 mr-1', favs.has(active.product_id) && 'fill-yellow-400 text-yellow-400')} />
                      收藏
                    </Button>
                  )}
                </div>

                <div className="space-y-3 pt-2">
                  <p className="text-sm font-semibold">评论 {active.comments_count}</p>
                  {comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">还没有评论，来抢沙发</p>
                  ) : (
                    comments.map((c) => (
                      <div key={c.id} className="flex gap-2">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarFallback className="text-xs">{(profiles[c.user_id]?.display_name || '?').charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">{profiles[c.user_id]?.display_name || '匿名'}</p>
                          <p className="text-sm">{c.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="p-3 border-t shrink-0 flex gap-2 safe-bottom">
                <Input
                  value={commentText} onChange={(e) => setCommentText(e.target.value)}
                  placeholder="写下你的评论…"
                  onKeyDown={(e) => { if (e.key === 'Enter') submitComment(); }}
                />
                <Button size="icon" onClick={submitComment} disabled={!commentText.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
