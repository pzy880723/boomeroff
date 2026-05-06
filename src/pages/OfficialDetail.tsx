import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Loader2, ArrowLeft, Star, Pencil, Sparkles, Eye, ImageOff,
} from 'lucide-react';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { QuizDialog } from '@/components/library/QuizDialog';
import { KnowledgeRichEditDialog } from '@/components/library/KnowledgeRichEditDialog';

interface Item {
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
  view_count: number;
  favorite_count: number;
  importance_score: number;
  video_url: string | null;
  body: string | null;
  gallery: unknown;
  content: any;
}

export default function OfficialDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const isAdmin = role === 'admin';
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [favored, setFavored] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = async () => {
    if (!id || !user) return;
    setLoading(true);
    const { data } = await supabase.from('official_knowledge').select('*').eq('id', id).maybeSingle();
    setItem(data as unknown as Item | null);
    if (data) {
      void (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
        'increment_official_view', { _id: id },
      );
      const { data: fav } = await supabase
        .from('user_favorites').select('id')
        .eq('user_id', user.id).eq('source_type', 'official').eq('source_id', id).maybeSingle();
      setFavored(!!fav);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [id, user]);

  const toggleFav = async () => {
    if (!user || !item) return;
    if (favored) {
      await supabase.from('user_favorites').delete()
        .eq('user_id', user.id).eq('source_type', 'official').eq('source_id', item.id);
      setFavored(false);
      toast.success('已取消收藏');
    } else {
      await supabase.from('user_favorites').insert({
        user_id: user.id, source_type: 'official', source_id: item.id,
        snapshot: { name: item.name, category: item.category, cover_url: item.cover_url, summary: item.summary },
      });
      setFavored(true);
      toast.success('已收藏');
    }
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!item) return (
    <div className="p-8 text-center text-muted-foreground">
      词条不存在
      <div className="mt-4"><Button variant="outline" onClick={() => navigate('/library')}>返回</Button></div>
    </div>
  );

  const points: Array<{ text: string; tag?: string }> = Array.isArray(item.selling_points)
    ? (item.selling_points as unknown[]).map((p: any) => typeof p === 'string' ? { text: p } : (p?.text ? { text: p.text, tag: p.tag } : null)).filter(Boolean) as any
    : [];
  const gallery: string[] = Array.isArray(item.gallery) ? (item.gallery as string[]).filter(Boolean) : [];
  const isYouTube = item.video_url?.includes('youtube.com') || item.video_url?.includes('youtu.be');
  const isBili = item.video_url?.includes('bilibili.com');

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Hero */}
      <div className="relative w-full bg-muted">
        <div className="aspect-[4/3] w-full max-w-screen-md mx-auto overflow-hidden">
          {item.cover_url ? (
            <img src={item.cover_url} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <ImageOff className="w-8 h-8" />
            </div>
          )}
        </div>
        <button
          onClick={() => navigate('/library')}
          className="absolute top-3 left-3 w-10 h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="absolute top-3 right-3 flex gap-2">
          {isAdmin && (
            <button
              onClick={() => setEditOpen(true)}
              className="w-10 h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
              aria-label="编辑"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={toggleFav}
            className="w-10 h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
            aria-label="收藏"
          >
            <Star className={`w-5 h-5 ${favored ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
          </button>
        </div>
      </div>

      <div className="container mx-auto max-w-screen-md px-4 py-4 space-y-5">
        {/* 标题区 */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold leading-tight">{item.name}</h1>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary">{CATEGORY_LABELS[item.category]}</Badge>
            {item.ip_name && <Badge variant="outline">{item.ip_name}</Badge>}
            {item.era && <Badge variant="outline">{item.era}</Badge>}
            {item.origin && <Badge variant="outline">{item.origin}</Badge>}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{item.view_count}</span>
            <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5" />{item.favorite_count}</span>
          </div>
        </div>

        {/* 简介 */}
        {item.summary && (
          <p className="text-[15px] leading-relaxed text-foreground/90">{item.summary}</p>
        )}

        {/* 视频 */}
        {item.video_url && (
          <Card className="overflow-hidden">
            <div className="aspect-video bg-black">
              {isYouTube || isBili ? (
                <iframe
                  src={item.video_url}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video src={item.video_url} controls poster={item.cover_url || undefined} className="w-full h-full" />
              )}
            </div>
          </Card>
        )}

        {/* 图集 */}
        {gallery.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-2 text-muted-foreground">图集</h2>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
              {gallery.map((url, i) => (
                <button key={i} onClick={() => setLightbox(url)}
                  className="shrink-0 w-28 h-28 rounded-lg overflow-hidden bg-muted border">
                  <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 正文 */}
        {item.body && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground">深度阅读</h2>
            <div className="prose prose-sm max-w-none dark:prose-invert leading-relaxed
              prose-headings:font-semibold prose-p:my-2 prose-li:my-0.5">
              <ReactMarkdown>{item.body}</ReactMarkdown>
            </div>
          </Card>
        )}

        {/* 卖点 */}
        {points.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-2 text-muted-foreground">核心卖点</h2>
            <ul className="space-y-2">
              {points.map((p, i) => (
                <li key={i} className="flex gap-2 text-[15px]">
                  <span className="text-primary mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span className="leading-relaxed">
                    {p.tag && <span className="mr-1.5 text-[10px] px-1.5 py-0.5 rounded bg-accent/30 text-accent-foreground">{p.tag}</span>}
                    {p.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 小贴士 */}
        {item.tips && (
          <Card className="p-4 bg-accent/30 border-accent">
            <div className="text-xs font-semibold text-accent-foreground mb-1">店员小贴士</div>
            <p className="text-sm leading-relaxed">{item.tips}</p>
          </Card>
        )}

        {(!item.body && points.length === 0 && !item.summary) && (
          <div className="text-center text-muted-foreground text-sm py-8">
            该词条还没有详细内容
            {isAdmin && (
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="w-4 h-4 mr-1.5" />补充内容
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部测试入口 */}
      <div className="fixed bottom-16 left-0 right-0 z-20 px-4 py-3 bg-background/95 backdrop-blur border-t">
        <div className="container mx-auto max-w-screen-md flex gap-2">
          <Button variant="outline" className="flex-1" onClick={toggleFav}>
            <Star className={`w-4 h-4 mr-1.5 ${favored ? 'fill-yellow-400 text-yellow-400' : ''}`} />
            {favored ? '已收藏' : '收藏'}
          </Button>
          <Button className="flex-1" onClick={() => setQuizOpen(true)}>
            <Sparkles className="w-4 h-4 mr-1.5" />
            来测一测
          </Button>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      <QuizDialog open={quizOpen} onOpenChange={setQuizOpen} knowledgeId={item.id} isAdmin={isAdmin} />
      {isAdmin && (
        <KnowledgeRichEditDialog open={editOpen} onOpenChange={setEditOpen} item={item} onSaved={load} />
      )}
    </div>
  );
}
