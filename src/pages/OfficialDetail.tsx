import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSpeech } from '@/hooks/useSpeech';
import { AuthPage } from '@/components/auth/AuthPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Loader2, ArrowLeft, Star, Pencil, Sparkles, Eye, ImageOff,
  Quote, Volume2, Square, Copy, Wand2, BookOpen, ChevronDown, ChevronUp,
} from 'lucide-react';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { QuizDialog } from '@/components/library/QuizDialog';
import { KnowledgeRichEditDialog } from '@/components/library/KnowledgeRichEditDialog';
import { AiKnowledgeDialog } from '@/components/admin/AiKnowledgeDialog';
import { KnowledgeChatPanel } from '@/components/library/KnowledgeChatPanel';
import { normalizeTips } from '@/lib/script';
import { ShareMenu } from '@/components/share/ShareMenu';

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
  const { isSpeaking, speak, stop } = useSpeech();
  const isAdmin = role === 'admin';
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [favored, setFavored] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showFullBody, setShowFullBody] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { rootMargin: '0px 0px 0px 0px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [item?.id]);

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
      <div className="mt-4"><Button variant="outline" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/library'))}>返回</Button></div>
    </div>
  );

  const points: Array<{ text: string; tag?: string; detail?: string }> = Array.isArray(item.selling_points)
    ? (item.selling_points as unknown[]).map((p: any) =>
        typeof p === 'string' ? { text: p } : (p?.text ? { text: p.text, tag: p.tag, detail: p.detail } : null)
      ).filter(Boolean) as any
    : [];
  const content = (item.content || {}) as any;
  const oneLiner: string | null = content.one_liner || null;
  const pronunciation: string | null = content.pronunciation || null;
  const aliases: string[] = Array.isArray(content.aliases) ? content.aliases : [];
  const quickFacts: Array<{ label: string; value: string }> =
    Array.isArray(content.quick_facts) ? content.quick_facts : [];
  const customerPitches: Array<{ scene: string; line: string }> =
    Array.isArray(content.customer_pitches) ? content.customer_pitches : [];
  const comparisons: Array<{ name: string; diff: string }> =
    Array.isArray(content.comparisons) ? content.comparisons : [];

  const speakOrStop = (text: string) => {
    if (isSpeaking) stop(); else speak(text);
  };
  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('已复制'),
      () => toast.error('复制失败'),
    );
  };
  const gallery: string[] = Array.isArray(item.gallery) ? (item.gallery as string[]).filter(Boolean) : [];
  const backstampUrl: string | null = (item as any).backstamp_url || null;
  const isYouTube = item.video_url?.includes('youtube.com') || item.video_url?.includes('youtu.be');
  const isBili = item.video_url?.includes('bilibili.com');

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* 吸顶按钮栏 */}
      <div className="fixed top-0 left-0 right-0 z-30 pt-[env(safe-area-inset-top)]">
        {/* 毛玻璃背景层 — 用 opacity 平滑过渡 */}
        <div
          aria-hidden
          className={`absolute inset-0 bg-background/75 backdrop-blur-md border-b border-border/50 shadow-[0_4px_16px_-8px_hsl(var(--foreground)/0.15)] transition-opacity duration-300 ease-out ${
            scrolled ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div className="relative container mx-auto max-w-screen-md flex items-center justify-between px-3 py-2">
          <button
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/library'))}
            className="w-10 h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex gap-2">
            {isAdmin && (
              <>
                <button
                  onClick={() => setAiEditOpen(true)}
                  className="w-10 h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
                  aria-label="AI 修改"
                  title="AI 修改"
                >
                  <Wand2 className="w-4 h-4 text-primary" />
                </button>
                <button
                  onClick={() => setEditOpen(true)}
                  className="w-10 h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
                  aria-label="编辑"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </>
            )}
            <ShareMenu
              data={{
                kind: 'official',
                name: item.name,
                category: CATEGORY_LABELS[item.category],
                ip: item.ip_name,
                era: item.era,
                origin: item.origin,
                coverUrl: item.cover_url,
                pronunciation,
                aliases,
                oneLiner,
                summary: item.summary,
                quickFacts,
                customerPitches,
                pointsRich: points,
                comparisons,
                tipsRich: normalizeTips(item.tips),
                tips: item.tips,
                link: typeof window !== 'undefined' ? `${window.location.origin}/library/${item.id}` : null,
              }}
            />
            <button
              onClick={toggleFav}
              className="w-10 h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
              aria-label="收藏"
            >
              <Star className={`w-5 h-5 ${favored ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
            </button>
          </div>
        </div>
      </div>

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
        {/* sentinel：滑出此点即触发吸顶背景 */}
        <div ref={sentinelRef} className="absolute bottom-12 left-0 w-px h-px" aria-hidden />
      </div>

      <div className="container mx-auto max-w-screen-md px-4 py-4 space-y-5">
        {/* 标题区 */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold leading-tight">{item.name}</h1>
          {(pronunciation || aliases.length > 0) && (
            <div className="text-xs text-muted-foreground space-x-2">
              {pronunciation && <span>{pronunciation}</span>}
              {aliases.length > 0 && <span>· 别名：{aliases.join(' / ')}</span>}
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="secondary"
              className="cursor-pointer hover:bg-secondary/80"
              onClick={() => navigate(`/library?cat=${encodeURIComponent(item.category)}`)}
            >
              {CATEGORY_LABELS[item.category]}
            </Badge>
            {item.ip_name && (
              <Badge
                variant="outline"
                className="cursor-pointer hover:bg-accent"
                onClick={() => navigate(`/library?cat=${encodeURIComponent(item.category)}&ip=${encodeURIComponent(item.ip_name!)}`)}
              >
                {item.ip_name}
              </Badge>
            )}
            {item.era && (
              <Badge
                variant="outline"
                className="cursor-pointer hover:bg-accent"
                onClick={() => navigate(`/library?era=${encodeURIComponent(item.era!)}`)}
              >
                {item.era}
              </Badge>
            )}
            {item.origin && (
              <Badge
                variant="outline"
                className="cursor-pointer hover:bg-accent"
                onClick={() => navigate(`/library?origin=${encodeURIComponent(item.origin!)}`)}
              >
                {item.origin}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{item.view_count}</span>
            <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5" />{item.favorite_count}</span>
          </div>
        </div>

        {/* 一句话客户话术金句 */}
        {oneLiner && (
          <Card className="p-4 bg-gradient-to-br from-primary/15 via-accent/20 to-background border-primary/30">
            <div className="flex items-start gap-3">
              <Quote className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">一句话讲给客人</div>
                <div className="text-lg font-semibold leading-snug">{oneLiner}</div>
              </div>
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => speakOrStop(oneLiner)}>
                  {isSpeaking ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyText(oneLiner)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* 简介 */}
        {item.summary && (
          <p className="text-[15px] leading-relaxed text-foreground/90">{item.summary}</p>
        )}

        {/* 速记卡 */}
        {quickFacts.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-2 text-muted-foreground">速记卡</h2>
            <div className="grid grid-cols-2 gap-2">
              {quickFacts.map((f, i) => (
                <div key={i} className="rounded-lg border bg-muted/20 p-2.5">
                  <div className="text-[10px] text-muted-foreground">{f.label}</div>
                  <div className="text-sm font-medium leading-tight mt-0.5">{f.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 客户话术 - 三场景 */}
        {customerPitches.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-2 text-muted-foreground">客户话术</h2>
            <div className="space-y-2">
              {customerPitches.map((p, i) => (
                <Card key={i} className="p-3">
                  <div className="flex items-start gap-2">
                    <Badge variant="secondary" className="shrink-0">{p.scene}</Badge>
                    <div className="flex-1 text-sm leading-relaxed">{p.line}</div>
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                      onClick={() => speakOrStop(p.line)}>
                      {isSpeaking ? <Square className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
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

        {/* 底款 / 背面 */}
        {backstampUrl && (
          <div>
            <h2 className="text-sm font-semibold mb-2 text-muted-foreground">底款 / 背面</h2>
            <button onClick={() => setLightbox(backstampUrl)}
              className="block w-40 h-40 rounded-lg overflow-hidden bg-muted border">
              <img src={backstampUrl} alt="底款" className="w-full h-full object-cover" loading="lazy" />
            </button>
          </div>
        )}

        {/* 卖点（升级版：tag + 主句 + 展开） */}
        {points.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-2 text-muted-foreground">核心卖点</h2>
            <ul className="space-y-2.5">
              {points.map((p, i) => (
                <li key={i} className="rounded-lg border bg-muted/10 p-3">
                  <div className="flex items-baseline gap-2">
                    {p.tag && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/40 text-accent-foreground shrink-0">{p.tag}</span>}
                    <span className="text-[15px] font-medium leading-snug">{p.text}</span>
                  </div>
                  {p.detail && (
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{p.detail}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 易混对比 */}
        {comparisons.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-2 text-muted-foreground">易混对比</h2>
            <div className="space-y-1.5">
              {comparisons.map((c, i) => (
                <Card key={i} className="p-3 text-sm">
                  <span className="font-semibold text-primary">vs {c.name}：</span>
                  <span className="text-foreground/85 leading-relaxed">{c.diff}</span>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* 正文（默认折叠） */}
        {item.body && (
          <Card className="relative px-5 py-5 pb-7 overflow-visible">
            <div className="flex items-center gap-1.5 mb-3 text-muted-foreground">
              <BookOpen className="w-4 h-4" />
              <h2 className="text-sm font-semibold">深度阅读</h2>
              <span className="text-xs text-muted-foreground/70">· {item.body.length} 字</span>
            </div>
            <div
              className={`prose prose-sm max-w-none dark:prose-invert text-[15px] leading-[1.85] text-foreground/90
                prose-headings:font-semibold prose-headings:text-foreground
                prose-h1:text-lg prose-h1:mt-6 prose-h1:mb-2.5 prose-h1:pb-1.5 prose-h1:border-b prose-h1:border-border
                prose-h2:text-base prose-h2:mt-6 prose-h2:mb-2.5 prose-h2:pl-2.5 prose-h2:border-l-2 prose-h2:border-primary/60
                prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-1.5 prose-h3:font-medium prose-h3:text-foreground
                prose-p:my-3.5 prose-p:leading-[1.85]
                prose-ul:my-3 prose-ul:pl-5 prose-ol:my-3 prose-ol:pl-5
                prose-li:my-1 prose-li:leading-[1.85] marker:text-primary/60
                prose-strong:text-primary prose-strong:font-semibold
                prose-a:text-primary prose-a:underline-offset-2
                prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:bg-muted/40
                prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:not-italic
                prose-blockquote:text-foreground/90 prose-blockquote:rounded-r prose-blockquote:my-3
                prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px]
                prose-code:before:content-none prose-code:after:content-none
                prose-hr:my-6 prose-hr:border-border
                prose-img:rounded-lg prose-img:my-4
                ${showFullBody ? '' : 'max-h-52 overflow-hidden relative'}`}
            >
              <ReactMarkdown>
                {item.body.replace(
                  /(\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:元|人民币|日元|円|RMB)|\d+\s*[-~至]\s*\d+\s*元)/g,
                  '**$1**',
                )}
              </ReactMarkdown>
              {!showFullBody && (
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent pointer-events-none" />
              )}
            </div>
            <button
              onClick={() => setShowFullBody((v) => !v)}
              className="absolute left-1/2 -translate-x-1/2 -bottom-3.5 inline-flex items-center gap-1 h-7 px-3.5 rounded-full border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:bg-accent shadow-sm transition-colors"
            >
              {showFullBody ? (
                <>收起 <ChevronUp className="w-3.5 h-3.5" /></>
              ) : (
                <>展开全文 <ChevronDown className="w-3.5 h-3.5" /></>
              )}
            </button>
          </Card>
        )}

        {/* 小贴士 */}
        {item.tips && (() => {
          const t = normalizeTips(item.tips);
          return (
            <Card className="p-4 bg-accent/30 border-accent">
              <div className="text-xs font-semibold text-accent-foreground mb-2">店员小贴士</div>
              {t && (t.memory || t.objection) ? (
                <div className="space-y-1.5 text-sm leading-relaxed">
                  {t.memory && <div><span className="font-medium text-accent-foreground/80">记忆点：</span>{t.memory}</div>}
                  {t.objection && <div><span className="font-medium text-accent-foreground/80">应对疑问：</span>{t.objection}</div>}
                </div>
              ) : (
                <p className="text-sm leading-relaxed">{item.tips}</p>
              )}
            </Card>
          );
        })()}

        {/* AI 聊一聊 */}
        <KnowledgeChatPanel
          knowledgeId={item.id}
          knowledgeName={item.name}
          suggestions={[
            '客人嫌贵怎么回？',
            '怎么辨真假？',
            comparisons[0] ? `跟 ${comparisons[0].name} 有什么区别？` : '保养有什么禁忌？',
          ]}
        />

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
        <>
          <KnowledgeRichEditDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            item={item}
            onSaved={load}
            onDeleted={() => (window.history.length > 1 ? navigate(-1) : navigate('/library'))}
          />
          <AiKnowledgeDialog
            open={aiEditOpen}
            onOpenChange={setAiEditOpen}
            onSaved={load}
            editingItem={{
              id: item.id,
              name: item.name,
              category: item.category,
              ip_name: item.ip_name,
              era: item.era,
              origin: item.origin,
              summary: item.summary,
              tips: item.tips,
              body: item.body,
              cover_url: item.cover_url,
              importance_score: item.importance_score,
              selling_points: item.selling_points,
              content: item.content,
              gallery: (item as any).gallery,
            }}
          />
        </>
      )}
    </div>
  );
}
