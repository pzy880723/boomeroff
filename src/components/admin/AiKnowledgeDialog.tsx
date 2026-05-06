import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, ImagePlus, Sparkles, RefreshCw, ImageOff, X } from 'lucide-react';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { toast } from 'sonner';

type ChatMsg = { role: 'user' | 'assistant'; content: string; imageUrl?: string };

interface Draft {
  name?: string;
  category?: ProductCategory;
  ip_name?: string;
  era?: string;
  origin?: string;
  summary?: string;
  selling_points?: string[];
  tips?: string;
  importance_score?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

const HELLO: ChatMsg = {
  role: 'assistant',
  content: '您好，告诉我想新增的中古商品或 IP 即可，例如：「昭和中期的伊万里烧染付小皿」「Snoopy 70 周年纪念马克杯」。也可以上传一张参考图。',
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
      const newDraft = { ...draft, ...(data?.draft || {}) };
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

  const save = async () => {
    if (!draft.name?.trim()) { toast.error('请先让 AI 生成有名称的草稿'); return; }
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        category: (draft.category || 'other') as ProductCategory,
        ip_name: draft.ip_name?.trim() || null,
        era: draft.era?.trim() || null,
        origin: draft.origin?.trim() || null,
        summary: draft.summary?.trim() || null,
        selling_points: Array.isArray(draft.selling_points) ? draft.selling_points : [],
        tips: draft.tips?.trim() || null,
        importance_score: Math.min(100, Math.max(0, Number(draft.importance_score) || 0)),
        cover_url: coverUrl || null,
      };
      const { error } = await supabase.from('official_knowledge').insert(payload);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            AI 生成官方知识
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
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> 思考中…
                  </div>
                </div>
              )}
            </div>
            <div className="border-t p-3 space-y-2">
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
                  placeholder="描述这件商品…（回车发送）"
                  disabled={thinking}
                />
                <Button type="button" size="icon" onClick={send} disabled={thinking || (!input.trim() && !pendingImage)}>
                  {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Preview side */}
          <div className="overflow-y-auto p-4 bg-muted/20">
            <div className="text-xs text-muted-foreground mb-2">待入库预览</div>
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
                {draft.summary && <p className="text-sm text-muted-foreground leading-relaxed">{draft.summary}</p>}
                {!!draft.selling_points?.length && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">核心卖点</div>
                    <ul className="space-y-1">
                      {draft.selling_points.map((p, i) => (
                        <li key={i} className="text-sm flex gap-1.5">
                          <span className="text-primary">•</span><span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {draft.tips && (
                  <div className="rounded-md bg-muted/60 p-2 text-xs leading-relaxed">
                    <span className="text-muted-foreground">小贴士：</span>{draft.tips}
                  </div>
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
