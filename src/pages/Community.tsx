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
import { normalizeSellingPoints, normalizeTips } from '@/lib/script';
import { Heart, Star, Loader2, Send, Award, Lightbulb, Check } from 'lucide-react';
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
  thumbnail_url: string | null;
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
}

interface ProductDetail {
  description: string | null;
  material: string | null;
  craft: string | null;
  dimensions: string | null;
  condition: string | null;
  selling_points: string[];
  tips: string | null;
  era: string | null;
  origin: string | null;
  image_url: string | null;
}

interface ProfileLite { user_id: string; display_name: string | null; }
interface Comment {
  id: string; user_id: string; content: string; created_at: string;
  profile?: ProfileLite;
}

const cats: Array<ProductCategory | 'all'> = ['all', ...Object.keys(CATEGORY_LABELS) as ProductCategory[]];

export default function Community() {
  const { user, role, loading: authLoading } = useAuth();
  const isAdmin = role === 'admin';
  const [posts, setPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<ProductCategory | 'all'>('all');
  const [active, setActive] = useState<Post | null>(null);
  const [activeDetail, setActiveDetail] = useState<ProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [officialAdded, setOfficialAdded] = useState(false);
  const [savingOfficial, setSavingOfficial] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');

  const loadPosts = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('community_posts').select('*').eq('is_public', true).eq('is_guest', false).order('created_at', { ascending: false });
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
        if (np.is_public && !np.is_guest && (cat === 'all' || np.category === cat)) {
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
        snapshot: {
          name: post.name,
          category: post.category,
          cover_url: post.image_url,
          image_url: post.image_url,
          summary: activeDetail?.description || null,
        },
      });
      setFavs((s) => new Set(s).add(post.product_id!));
      toast.success('已收藏为个人知识');
    }
  };

  const addToOfficial = async () => {
    if (!user || !active || !active.product_id || !isAdmin) return;
    setSavingOfficial(true);
    try {
      const sp = (activeDetail?.selling_points && activeDetail.selling_points.length
        ? activeDetail.selling_points
        : (Array.isArray(active.selling_points) ? (active.selling_points as string[]) : [])) || [];
      const era = activeDetail?.era ?? active.era;
      const origin = activeDetail?.origin ?? active.origin;
      const tips = activeDetail?.tips ?? active.tips;
      const summary = activeDetail?.description ?? null;
      const cover = activeDetail?.image_url ?? active.image_url;

      const [pkRes, ofRes] = await Promise.all([
        supabase.from('product_knowledge').select('id')
          .eq('product_id', active.product_id).limit(1).maybeSingle(),
        supabase.from('official_knowledge').select('id')
          .eq('source_product_id', active.product_id).limit(1).maybeSingle(),
      ]);

      let didSomething = false;

      if (!pkRes.data) {
        const { error } = await supabase.from('product_knowledge').insert({
          product_id: active.product_id,
          category: active.category,
          product_name: active.name,
          selling_points: sp,
          tips: tips || null,
          era: era || null,
          origin: origin || null,
          image_url: cover || null,
          created_by: user.id,
          is_official: true,
        });
        if (error) throw error;
        didSomething = true;
      } else {
        await supabase.from('product_knowledge').update({ is_official: true }).eq('id', pkRes.data.id);
      }

      if (!ofRes.data) {
        const { error: ofErr } = await supabase.from('official_knowledge').insert({
          name: active.name,
          category: active.category,
          summary,
          content: {
            material: activeDetail?.material || null,
            craft: activeDetail?.craft || null,
            dimensions: activeDetail?.dimensions || null,
            condition: activeDetail?.condition || null,
          },
          era: era || null,
          origin: origin || null,
          cover_url: cover || null,
          gallery: cover ? [cover] : [],
          selling_points: sp,
          tips: tips || null,
          source_product_id: active.product_id,
          created_by: user.id,
        });
        if (ofErr) throw ofErr;
        didSomething = true;
      }

      setOfficialAdded(true);
      toast.success(didSomething ? '已收录为官方知识' : '已在官方知识库中');
    } catch (e: any) {
      console.error('[Community→Official] error:', e);
      const code = e?.code || '';
      if (code === '42501' || /row-level security/i.test(e?.message || '')) {
        toast.error('权限不足：仅管理员可收录');
      } else {
        toast.error(e?.message || '收录失败，请稍后重试');
      }
    } finally {
      setSavingOfficial(false);
    }
  };

  const openDetail = async (post: Post) => {
    setActive(post);
    setComments([]);
    setActiveDetail(null);
    setOfficialAdded(false);

    // 评论
    supabase.from('community_comments')
      .select('*').eq('post_id', post.id).order('created_at', { ascending: true }).limit(100)
      .then(async ({ data }) => {
        const list = (data || []) as Comment[];
        const userIds = Array.from(new Set(list.map((c) => c.user_id))).filter((id) => !profiles[id]);
        if (userIds.length) {
          const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
          (profs || []).forEach((p) => { profiles[p.user_id] = p as ProfileLite; });
          setProfiles({ ...profiles });
        }
        setComments(list);
      });

    // 完整商品信息 + admin 的「已收录」状态
    if (post.product_id) {
      setDetailLoading(true);
      const [{ data: prod }, ofRes] = await Promise.all([
        supabase.from('products')
          .select('description, material, craft, dimensions, condition, selling_points, tips, era, origin, image_url')
          .eq('id', post.product_id).maybeSingle(),
        isAdmin
          ? supabase.from('official_knowledge').select('id')
              .eq('source_product_id', post.product_id).limit(1).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      if (prod) {
        setActiveDetail({
          description: prod.description,
          material: prod.material,
          craft: prod.craft,
          dimensions: prod.dimensions,
          condition: prod.condition,
          selling_points: Array.isArray(prod.selling_points) ? prod.selling_points as string[] : [],
          tips: prod.tips,
          era: prod.era,
          origin: prod.origin,
          image_url: prod.image_url,
        });
      }
      setOfficialAdded(!!ofRes?.data);
      setDetailLoading(false);
    }
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

  const rawSellingPoints = (activeDetail?.selling_points && (activeDetail.selling_points as any[]).length)
    ? activeDetail.selling_points
    : (Array.isArray(active?.selling_points) ? active!.selling_points : []);
  const sellingPoints = normalizeSellingPoints(rawSellingPoints);
  const rawTips = activeDetail?.tips ?? active?.tips ?? null;
  const tipsObj = normalizeTips(rawTips);
  const tipsText = tipsObj
    ? [tipsObj.memory, tipsObj.objection].filter(Boolean).join('；')
    : (typeof rawTips === 'string' ? rawTips : null);
  const eraText = activeDetail?.era ?? active?.era ?? null;
  const originText = activeDetail?.origin ?? active?.origin ?? null;

  const specs: Array<{ label: string; value: string | null | undefined }> = [
    { label: '材质', value: activeDetail?.material },
    { label: '工艺', value: activeDetail?.craft },
    { label: '尺寸', value: activeDetail?.dimensions },
    { label: '品相', value: activeDetail?.condition },
  ].filter((s) => !!s.value);

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
                  <div className="rounded-xl overflow-hidden bg-card border border-border/60 shadow-sm cursor-pointer" onClick={() => openDetail(p)}>
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="aspect-square bg-muted" />
                    )}
                    <div className="p-2.5 space-y-2">
                      <p className="text-sm font-medium leading-snug break-words">{p.name}</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{CATEGORY_LABELS[p.category]}</Badge>
                        {p.era && <span className="text-[10px] text-muted-foreground">{p.era}</span>}
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
        <SheetContent side="bottom" className="h-[92vh] flex flex-col p-0">
          {active && (
            <>
              <SheetHeader className="p-4 border-b shrink-0">
                <SheetTitle className="text-left text-base leading-snug break-words">{active.name}</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {active.image_url && <img src={active.image_url} className="w-full rounded-lg" alt={active.name} />}

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{CATEGORY_LABELS[active.category]}</Badge>
                  {eraText && <Badge variant="outline">{eraText}</Badge>}
                  {originText && <Badge variant="outline">{originText}</Badge>}
                </div>

                {/* 详细介绍 */}
                {detailLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> 加载完整介绍…</div>
                ) : activeDetail?.description ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">介绍</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{activeDetail.description}</p>
                  </div>
                ) : null}

                {/* 规格 */}
                {specs.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">规格</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                      {specs.map((s) => (
                        <div key={s.label} className="flex gap-1.5">
                          <span className="text-muted-foreground shrink-0">{s.label}:</span>
                          <span className="break-words">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 卖点 */}
                {sellingPoints.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">卖点</p>
                    <ul className="space-y-1.5">
                      {sellingPoints.map((s, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <span className="text-primary shrink-0">•</span>
                          <span className="leading-relaxed break-words">
                            <span className="text-[10px] text-muted-foreground mr-1">[{s.tag}]</span>
                            {s.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 小贴士 */}
                {tipsText && (
                  <div className="bg-accent/30 rounded-lg p-3 text-sm flex gap-2">
                    <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-accent-foreground" />
                    <p className="leading-relaxed break-words">{tipsText}</p>
                  </div>
                )}

                {/* 操作区 */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={() => toggleLike(active)}>
                      <Heart className={cn('w-4 h-4 mr-1', likes.has(active.id) && 'fill-red-500 text-red-500')} />
                      {active.likes_count}
                    </Button>
                    {active.product_id && (
                      <Button variant="outline" size="sm" onClick={() => toggleFav(active)}>
                        <Star className={cn('w-4 h-4 mr-1', favs.has(active.product_id) && 'fill-yellow-400 text-yellow-400')} />
                        {favs.has(active.product_id) ? '已收藏' : '收藏为个人知识'}
                      </Button>
                    )}
                  </div>

                  {/* 仅 admin：收录到官方 */}
                  {isAdmin && active.product_id && (
                    <Button
                      onClick={addToOfficial}
                      disabled={officialAdded || savingOfficial}
                      className={cn(
                        'w-full h-10 rounded-full gap-2',
                        officialAdded
                          ? 'bg-success text-success-foreground hover:bg-success'
                          : 'bg-gradient-accent text-accent-foreground hover:opacity-95'
                      )}
                    >
                      {savingOfficial ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 收录中…</>
                      ) : officialAdded ? (
                        <><Check className="w-4 h-4" /> 已收录为官方知识</>
                      ) : (
                        <><Award className="w-4 h-4" /> 直接收录为官方知识</>
                      )}
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
                          <p className="text-sm break-words">{c.content}</p>
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
