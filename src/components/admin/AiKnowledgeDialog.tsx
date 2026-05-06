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

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

const HELLO: ChatMsg = {
  role: 'assistant',
  content: '您好，告诉我想新增的中古商品或品牌即可，例如：「香兰社咖啡杯」「九谷烧」「Sonny Angel」。我会自动整理出店员学习卡和客户话术。也可以上传一张参考图。',
};

export function AiKnowledgeDialog({ open, onOpenChange, onSaved }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([HELLO]);
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

  useEffect(() => {
    if (open) {
      setMessages([HELLO]); setInput(''); setPendingImage(null);
      setDraft({}); setCoverPrompt(''); setCoverUrl(null);
      setThinking(false); setPainting(false); setSaving(false);
    }
  }, [open]);

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
        body: { messages: next.filter((m) => m.role !== 'assistant' || m !== HELLO), currentDraft: draft },
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
      const { error } = await supabase.from('official_knowledge').insert([payload as any]);
      if (error) throw error;
      toast.success('已保存到官方知识');
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
            AI 生成官方知识 · 店员学习卡
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
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => sendQuick('请把正文 body 再扩充一倍，加入更多年份、人名和具体价位行情。')}>
                    再深入一点
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => sendQuick('请补充更多易混对比 comparisons，至少 3 条。')}>
                    补充对比
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => sendQuick('one_liner 再换一个更出圈的类比金句。')}>
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
                  placeholder="描述这件商品/品牌…（回车发送）"
                  disabled={thinking}
                />
                <Button type="button" size="icon" onClick={send} disabled={thinking || (!input.trim() && !pendingImage)}>
                  {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Preview side */}
          <div className="overflow-y-auto p-4 bg-muted/20 space-y-3">
            <div className="text-xs text-muted-foreground">待入库预览</div>
            <div className="rounded-xl border bg-background overflow-hidden shadow-soft">
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
              <div className="p-4 space-y-3">
                <div>
                  <div className="text-base font-semibold">{draft.name || '（待 AI 生成名称）'}</div>
                  {draft.pronunciation && <div className="text-xs text-muted-foreground mt-0.5">{draft.pronunciation}</div>}
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    {draft.category && <Badge variant="secondary">{CATEGORY_LABELS[draft.category]}</Badge>}
                    {draft.ip_name && <Badge variant="outline">{draft.ip_name}</Badge>}
                    {(draft.era || draft.origin) && (
                      <span className="text-xs text-muted-foreground">
                        {[draft.era, draft.origin].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                </div>

                {draft.one_liner && (
                  <div className="rounded-lg bg-accent/40 border border-accent p-3 flex gap-2">
                    <Quote className="w-4 h-4 text-accent-foreground shrink-0 mt-0.5" />
                    <div className="text-sm font-medium leading-snug text-accent-foreground">{draft.one_liner}</div>
                  </div>
                )}

                {draft.summary && <p className="text-sm text-muted-foreground leading-relaxed">{draft.summary}</p>}

                {!!draft.quick_facts?.length && (
                  <div className="grid grid-cols-2 gap-2">
                    {draft.quick_facts.map((f, i) => (
                      <div key={i} className="rounded-md border bg-muted/30 p-2">
                        <div className="text-[10px] text-muted-foreground">{f.label}</div>
                        <div className="text-xs font-medium leading-tight mt-0.5">{f.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {!!draft.customer_pitches?.length && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">客户话术</div>
                    <div className="space-y-1.5">
                      {draft.customer_pitches.map((p, i) => (
                        <div key={i} className="text-sm rounded-md bg-muted/40 px-2 py-1.5">
                          <span className="text-[10px] mr-1.5 px-1.5 py-0.5 rounded bg-primary/15 text-primary">{p.scene}</span>
                          {p.line}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!!points.length && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">核心卖点</div>
                    <ul className="space-y-1.5">
                      {points.map((p, i) => (
                        <li key={i} className="text-sm">
                          {p.tag && <span className="mr-1.5 text-[10px] px-1.5 py-0.5 rounded bg-accent/30 text-accent-foreground">{p.tag}</span>}
                          <span className="font-medium">{p.text}</span>
                          {p.detail && <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{p.detail}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!!draft.comparisons?.length && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">易混对比</div>
                    <div className="space-y-1">
                      {draft.comparisons.map((c, i) => (
                        <div key={i} className="text-xs rounded-md border bg-muted/20 p-2">
                          <span className="font-semibold">vs {c.name}：</span>{c.diff}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {draft.tips && (
                  <div className="rounded-md bg-muted/60 p-2 text-xs leading-relaxed">
                    <span className="text-muted-foreground">小贴士：</span>{draft.tips}
                  </div>
                )}

                {draft.body && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">深度阅读 ({draft.body.length} 字)</summary>
                    <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed">{draft.body}</pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save} disabled={saving || !draft.name}>
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            保存到官方知识
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
