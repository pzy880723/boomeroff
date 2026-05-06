import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, ImagePlus, Sparkles, RefreshCw, ImageOff, X, Quote, Maximize2 } from 'lucide-react';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { toast } from 'sonner';

type ChatMsg = { role: 'user' | 'assistant'; content: string; imageUrl?: string };

interface QuickFact { label: string; value: string }
interface CustomerPitch { scene: string; line: string }
interface SellingPoint { tag: string; text: string; detail?: string }
interface Comparison { name: string; diff: string }

interface Draft {
  name?: string;
  category?: ProductCategory;
  ip_name?: string;
  era?: string;
  origin?: string;
  pronunciation?: string;
  aliases?: string[];
  summary?: string;
  one_liner?: string;
  quick_facts?: QuickFact[];
  customer_pitches?: CustomerPitch[];
  selling_points?: Array<SellingPoint | string>;
  comparisons?: Comparison[];
  tips?: string;
  body?: string;
  importance_score?: number;
}

const VALID_CATEGORIES: ProductCategory[] = [
  'jp_porcelain','eu_porcelain','incense','antique_art','local_craft',
  'anime_toy','otaku_goods','luxury','jewelry',
  'game_console','walkman','ccd','media_record','playback_device',
  'home_appliance','hobby','stationery','lacquerware','bronze',
  'woodcraft','textile','painting','porcelain','other',
];

interface ExistingItem {
  id: string;
  name: string;
  category: ProductCategory;
  ip_name: string | null;
  era: string | null;
  origin: string | null;
  summary: string | null;
  tips: string | null;
  body: string | null;
  cover_url: string | null;
  importance_score: number;
  selling_points: unknown;
  content: any;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  /** 传入则进入「AI 修改」模式，基于该词条增量改写并 update */
  editingItem?: ExistingItem | null;
}

const HELLO_NEW: ChatMsg = {
  role: 'assistant',
  content: '您好，告诉我想新增的中古商品或品牌即可，例如：「香兰社咖啡杯」「九谷烧」「Sonny Angel」。我会自动整理出店员学习卡和客户话术。也可以上传一张参考图。',
};
const HELLO_EDIT = (name: string): ChatMsg => ({
  role: 'assistant',
  content: `已载入「${name}」当前内容，告诉我想怎么改即可，例如：「金句换一个更出圈的」「正文加一段保养方法」「补充与 Wedgwood 的对比」。也可以直接说「整体重写得更详细」。`,
});

function itemToDraft(it: ExistingItem): Draft {
  const c = it.content || {};
  const sp = Array.isArray(it.selling_points)
    ? (it.selling_points as unknown[]).map((p: any) =>
        typeof p === 'string' ? { tag: '', text: p, detail: '' } : p,
      )
    : [];
  return {
    name: it.name,
    category: it.category,
    ip_name: it.ip_name || undefined,
    era: it.era || undefined,
    origin: it.origin || undefined,
    summary: it.summary || undefined,
    tips: it.tips || undefined,
    body: it.body || undefined,
    importance_score: it.importance_score ?? 0,
    selling_points: sp,
    one_liner: c.one_liner || undefined,
    pronunciation: c.pronunciation || undefined,
    aliases: Array.isArray(c.aliases) ? c.aliases : [],
    quick_facts: Array.isArray(c.quick_facts) ? c.quick_facts : [],
    customer_pitches: Array.isArray(c.customer_pitches) ? c.customer_pitches : [],
    comparisons: Array.isArray(c.comparisons) ? c.comparisons : [],
  };
}

export function AiKnowledgeDialog({ open, onOpenChange, onSaved, editingItem }: Props) {
  const isEdit = !!editingItem;
  const [messages, setMessages] = useState<ChatMsg[]>([HELLO_NEW]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [coverPrompt, setCoverPrompt] = useState<string>('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [painting, setPainting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (editingItem) {
        setMessages([HELLO_EDIT(editingItem.name)]);
        setDraft(itemToDraft(editingItem));
        setCoverUrl(editingItem.cover_url || null);
      } else {
        setMessages([HELLO_NEW]);
        setDraft({});
        setCoverUrl(null);
      }
      setInput(''); setPendingImage(null); setCoverPrompt('');
      setThinking(false); setPainting(false); setSaving(false);
    }
  }, [open, editingItem]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const pickFile = () => fileRef.current?.click();
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast.error('图片需小于 4MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result as string);
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const triggerCover = async (prompt: string) => {
    if (!prompt) return;
    setPainting(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-knowledge-cover', { body: { prompt } });
      if (error) throw error;
      if (data?.url) setCoverUrl(data.url);
    } catch (e: any) {
      toast.error('封面生成失败：' + (e?.message ?? ''));
    } finally {
      setPainting(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text && !pendingImage) return;
    const userMsg: ChatMsg = { role: 'user', content: text || '请基于参考图整理。', imageUrl: pendingImage ?? undefined };
    const next = [...messages, userMsg];
    setMessages(next); setInput(''); setPendingImage(null); setThinking(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-official-knowledge', {
        body: { messages: next.filter((m) => m.role === 'user'), currentDraft: draft },
      });
      if (error) throw error;
      const reply = (data?.reply as string) || '已更新草稿。';
      const newDraft: Draft = { ...draft, ...(data?.draft || {}) };
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
      setDraft(newDraft);
      const newPrompt = data?.cover_prompt as string | undefined;
      if (newPrompt && newPrompt !== coverPrompt) {
        setCoverPrompt(newPrompt);
        void triggerCover(newPrompt);
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'AI 调用失败');
      setMessages((m) => [...m, { role: 'assistant', content: '抱歉，刚才出了点问题，请再说一次。' }]);
    } finally {
      setThinking(false);
    }
  };

  const sendQuick = (text: string) => {
    setInput(text);
    setTimeout(() => void send(), 0);
  };

  const save = async () => {
    if (!draft.name?.trim()) { toast.error('请先让 AI 生成有名称的草稿'); return; }
    const safeCategory: ProductCategory = (VALID_CATEGORIES as string[]).includes(draft.category as string)
      ? (draft.category as ProductCategory) : 'other';
    setSaving(true);
    try {
      const sellingPointsJson = (draft.selling_points || []).map((p) =>
        typeof p === 'string' ? { text: p } : p,
      );
      const payload = {
        name: draft.name.trim(),
        category: safeCategory,
        ip_name: draft.ip_name?.trim() || null,
        era: draft.era?.trim() || null,
        origin: draft.origin?.trim() || null,
        summary: draft.summary?.trim() || null,
        selling_points: sellingPointsJson,
        tips: draft.tips?.trim() || null,
        body: draft.body?.trim() || null,
        importance_score: Math.min(100, Math.max(0, Number(draft.importance_score) || 0)),
        cover_url: coverUrl || null,
        content: {
          one_liner: draft.one_liner || null,
          aliases: draft.aliases || [],
          pronunciation: draft.pronunciation || null,
          quick_facts: draft.quick_facts || [],
          customer_pitches: draft.customer_pitches || [],
          comparisons: draft.comparisons || [],
        },
      };
      const { error } = editingItem
        ? await supabase.from('official_knowledge').update(payload as any).eq('id', editingItem.id)
        : await supabase.from('official_knowledge').insert([payload as any]);
      if (error) throw error;
      toast.success(editingItem ? '已更新官方知识' : '已保存到官方知识');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('保存失败：' + (e?.message ?? ''));
    } finally {
      setSaving(false);
    }
  };

  const points = (draft.selling_points || []).map((p) =>
    typeof p === 'string' ? { tag: '', text: p, detail: '' } : p,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            {isEdit ? `AI 修改官方知识 · ${editingItem?.name}` : 'AI 生成官方知识 · 店员学习卡'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 grid md:grid-cols-2 gap-0 overflow-hidden">
          {/* Chat side */}
          <div className="flex flex-col border-r min-h-[400px] md:min-h-0">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    {m.imageUrl && <img src={m.imageUrl} alt="" className="rounded-lg mb-2 max-h-40 object-cover" />}
                    <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl px-3 py-2 text-sm flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在整理学习卡…
                  </div>
                </div>
              )}
            </div>
            <div className="border-t p-3 space-y-2">
              {!!draft.name && !thinking && (
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => sendQuick('请把正文再扩充一倍，加入更多年份、人名和具体价位行情。')}>
                    再深入一点
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => sendQuick('请补充更多易混对比，至少 3 条。')}>
                    补充对比
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => sendQuick('再换一个更出圈的类比金句。')}>
                    换金句
                  </Button>
                </div>
              )}
              {pendingImage && (
                <div className="relative inline-block">
                  <img src={pendingImage} alt="" className="h-16 rounded-md object-cover" />
                  <button onClick={() => setPendingImage(null)} className="absolute -top-1.5 -right-1.5 bg-background border rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                <Button type="button" size="icon" variant="outline" onClick={pickFile} title="上传参考图">
                  <ImagePlus className="w-4 h-4" />
                </Button>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder={isEdit ? '想怎么改？例如：换一个金句、补充保养…' : '描述这件商品/品牌…（回车发送）'}
                  disabled={thinking}
                />
                <Button type="button" size="icon" onClick={send} disabled={thinking || (!input.trim() && !pendingImage)}>
                  {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Preview side */}
          <PreviewPane
            draft={draft}
            points={points}
            coverUrl={coverUrl}
            coverPrompt={coverPrompt}
            painting={painting}
            triggerCover={triggerCover}
            onExpand={() => setPreviewOpen(true)}
          />
        </div>

        <DialogFooter className="px-5 py-3 border-t flex-row gap-2 sm:gap-2">
          <Button variant="outline" className="md:hidden flex-1" onClick={() => setPreviewOpen(true)} disabled={!draft.name}>
            <Maximize2 className="w-4 h-4 mr-1.5" /> 全屏预览
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="hidden md:inline-flex">取消</Button>
          <Button onClick={save} disabled={saving || !draft.name} className="flex-1 md:flex-none">
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {isEdit ? '保存修改' : '保存到官方知识'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Fullscreen preview (mobile-friendly) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl w-[100vw] sm:w-[95vw] h-[100vh] sm:h-[92vh] max-h-[100vh] p-0 flex flex-col gap-0">
          <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
            <DialogTitle className="text-base">入库预览</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto bg-muted/20">
            <PreviewCard
              draft={draft}
              points={points}
              coverUrl={coverUrl}
              coverPrompt={coverPrompt}
              painting={painting}
              triggerCover={triggerCover}
              large
            />
          </div>
          <DialogFooter className="px-4 py-3 border-t flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPreviewOpen(false)}>关闭</Button>
            <Button className="flex-1" onClick={async () => { await save(); setPreviewOpen(false); }} disabled={saving || !draft.name}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {isEdit ? '保存修改' : '保存到官方知识'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

interface PreviewProps {
  draft: Draft;
  points: Array<{ tag?: string; text: string; detail?: string }>;
  coverUrl: string | null;
  coverPrompt: string;
  painting: boolean;
  triggerCover: (p: string) => void | Promise<void>;
  large?: boolean;
}

function PreviewPane(props: PreviewProps & { onExpand: () => void }) {
  return (
    <div className="overflow-y-auto p-4 bg-muted/20 space-y-3 hidden md:block">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">待入库预览</div>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={props.onExpand} disabled={!props.draft.name}>
          <Maximize2 className="w-3.5 h-3.5 mr-1" /> 全屏
        </Button>
      </div>
      <PreviewCard {...props} />
    </div>
  );
}

function PreviewCard({ draft, points, coverUrl, coverPrompt, painting, triggerCover, large }: PreviewProps) {
  const t = large
    ? { name: 'text-2xl', section: 'text-sm', body: 'text-base', tag: 'text-xs', mini: 'text-xs', card: 'p-5 space-y-5', wrap: 'p-4' }
    : { name: 'text-base', section: 'text-xs', body: 'text-sm', tag: 'text-[10px]', mini: 'text-xs', card: 'p-4 space-y-3', wrap: '' };
  return (
    <div className={large ? 'p-3' : ''}>
      <div className="rounded-xl border bg-background overflow-hidden shadow-soft max-w-2xl mx-auto">
        <div className="aspect-square bg-muted flex items-center justify-center relative">
          {coverUrl ? (
            <img src={coverUrl} alt={draft.name || ''} className="w-full h-full object-cover" />
          ) : painting ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="w-5 h-5 animate-spin" /> 正在生成封面…
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground text-xs">
              <ImageOff className="w-5 h-5" /> 尚未生成封面
            </div>
          )}
          {coverPrompt && !painting && (
            <Button
              size="sm" variant="secondary"
              className="absolute bottom-2 right-2 h-7 text-xs"
              onClick={() => triggerCover(coverPrompt)}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> 重新生成
            </Button>
          )}
        </div>
        <div className={t.card}>
          <div>
            <div className={`${t.name} font-semibold`}>{draft.name || '（待 AI 生成名称）'}</div>
            {draft.pronunciation && <div className={`${t.mini} text-muted-foreground mt-0.5`}>{draft.pronunciation}</div>}
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {draft.category && <Badge variant="secondary">{CATEGORY_LABELS[draft.category]}</Badge>}
              {draft.ip_name && <Badge variant="outline">{draft.ip_name}</Badge>}
              {(draft.era || draft.origin) && (
                <span className={`${t.mini} text-muted-foreground`}>
                  {[draft.era, draft.origin].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          </div>

          {draft.one_liner && (
            <div className="rounded-lg bg-accent/40 border border-accent p-3 flex gap-2">
              <Quote className={`${large ? 'w-5 h-5' : 'w-4 h-4'} text-accent-foreground shrink-0 mt-0.5`} />
              <div className={`${t.body} font-medium leading-snug text-accent-foreground`}>{draft.one_liner}</div>
            </div>
          )}

          {draft.summary && <p className={`${t.body} text-muted-foreground leading-relaxed`}>{draft.summary}</p>}

          {!!draft.quick_facts?.length && (
            <div className={`grid ${large ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'} gap-2`}>
              {draft.quick_facts.map((f, i) => (
                <div key={i} className="rounded-md border bg-muted/30 p-2.5">
                  <div className={`${t.mini} text-muted-foreground`}>{f.label}</div>
                  <div className={`${t.body} font-medium leading-tight mt-0.5`}>{f.value}</div>
                </div>
              ))}
            </div>
          )}

          {!!draft.customer_pitches?.length && (
            <div>
              <div className={`${t.section} text-muted-foreground mb-1.5`}>客户话术</div>
              <div className="space-y-1.5">
                {draft.customer_pitches.map((p, i) => (
                  <div key={i} className={`${t.body} rounded-md bg-muted/40 px-2.5 py-2`}>
                    <span className={`${t.tag} mr-1.5 px-1.5 py-0.5 rounded bg-primary/15 text-primary`}>{p.scene}</span>
                    {p.line}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!!points.length && (
            <div>
              <div className={`${t.section} text-muted-foreground mb-1.5`}>核心卖点</div>
              <ul className="space-y-2">
                {points.map((p, i) => (
                  <li key={i} className={t.body}>
                    {p.tag && <span className={`${t.tag} mr-1.5 px-1.5 py-0.5 rounded bg-accent/30 text-accent-foreground`}>{p.tag}</span>}
                    <span className="font-medium">{p.text}</span>
                    {p.detail && <div className={`${t.mini} text-muted-foreground mt-0.5 leading-relaxed`}>{p.detail}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!draft.comparisons?.length && (
            <div>
              <div className={`${t.section} text-muted-foreground mb-1.5`}>易混对比</div>
              <div className="space-y-1.5">
                {draft.comparisons.map((c, i) => (
                  <div key={i} className={`${t.body} rounded-md border bg-muted/20 p-2.5`}>
                    <span className="font-semibold">vs {c.name}：</span>{c.diff}
                  </div>
                ))}
              </div>
            </div>
          )}

          {draft.tips && (
            <div className={`rounded-md bg-muted/60 p-2.5 ${t.body} leading-relaxed`}>
              <span className="text-muted-foreground">小贴士：</span>{draft.tips}
            </div>
          )}

          {draft.body && (
            <details className={t.body} open={large}>
              <summary className={`cursor-pointer ${t.section} text-muted-foreground`}>深度阅读 ({draft.body.length} 字)</summary>
              <div className="mt-2 whitespace-pre-wrap leading-relaxed">{draft.body}</div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
