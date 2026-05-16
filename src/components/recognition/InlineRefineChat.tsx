import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Send,
  Sparkles,
  MessageSquareWarning,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  Paperclip,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/integrations/supabase/client';
import type { RecognitionResult, ProductCategory } from '@/types';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  attachments?: string[]; // 缩略图 dataURL
}

interface InlineRefineChatProps {
  imageUrl: string | null;
  productId: string | null;
  current: RecognitionResult;
  onApplied: (next: RecognitionResult) => void;
}

const MAX_EXTRA_IMAGES = 4;

// 压缩图片到 1280px JPEG，返回 base64 dataURL
function compressImage(file: File, maxSize = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas 不可用'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function extractJSON(text: string): any | null {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)\s*```/g)];
  if (matches.length === 0) {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
  try { return JSON.parse(matches[matches.length - 1][1]); } catch { return null; }
}

function stripJSONBlocks(text: string): string {
  let out = text;
  out = out.replace(/```json[\s\S]*?(?:```|$)/g, '');
  out = out.replace(/```[\s\S]*?(?:```|$)/g, '');
  const braceMatch = out.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      JSON.parse(braceMatch[0]);
      out = out.replace(braceMatch[0], '');
    } catch { /* keep */ }
  }
  const openBrace = out.indexOf('{');
  if (openBrace !== -1 && !out.slice(openBrace).includes('}')) {
    out = out.slice(0, openBrace);
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function jsonToResult(j: any, fallback: RecognitionResult): RecognitionResult {
  return {
    ...fallback,
    name: j?.name || fallback.name,
    category: (j?.category as ProductCategory) || fallback.category,
    era: j?.era ?? fallback.era ?? null,
    origin: j?.origin ?? fallback.origin ?? null,
    material: j?.material ?? fallback.material ?? null,
    craft: j?.craft ?? fallback.craft ?? null,
    sellingPoints: Array.isArray(j?.sellingPoints) ? j.sellingPoints : (fallback.sellingPoints || []),
    pitch: j?.pitch ?? fallback.pitch ?? null,
    description: j?.description ?? fallback.description ?? null,
    tips: j?.tips ?? fallback.tips ?? null,
    confidence: typeof j?.confidence === 'number' ? j.confidence : fallback.confidence,
  };
}

export function InlineRefineChat({
  imageUrl, productId, current, onApplied,
}: InlineRefineChatProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [extraImages, setExtraImages] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [pendingResult, setPendingResult] = useState<RecognitionResult | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 商品切换时清空对话
  useEffect(() => {
    setMessages([]);
    setInput('');
    setExtraImages([]);
    setPendingResult(null);
    setStreaming(false);
  }, [productId]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  }, [messages, open]);

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (!files.length) return;
    const room = MAX_EXTRA_IMAGES - extraImages.length;
    if (room <= 0) {
      toast({ title: `最多 ${MAX_EXTRA_IMAGES} 张图`, variant: 'destructive' });
      return;
    }
    const picked = files.slice(0, room);
    const compressed: string[] = [];
    for (const f of picked) {
      try {
        compressed.push(await compressImage(f));
      } catch (err) {
        console.error('[InlineRefine] compress failed', err);
      }
    }
    if (compressed.length) {
      setExtraImages((prev) => [...prev, ...compressed]);
    }
  };

  const removeExtra = (idx: number) => {
    setExtraImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && extraImages.length === 0) || streaming) return;

    const sentImages = extraImages;
    const userMsg: Msg = {
      role: 'user',
      content: text || (sentImages.length ? '我补拍了几张细节图，请重新看一下' : ''),
      attachments: sentImages.length ? sentImages : undefined,
    };
    const next: Msg[] = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setExtraImages([]);
    setStreaming(true);
    setPendingResult(null);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('未登录');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refine-recognition`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          imageUrl,
          extraImages: sentImages,
          originalPayload: {
            name: current.name,
            category: current.category,
            era: current.era,
            origin: current.origin,
            material: current.material,
            craft: current.craft,
            sellingPoints: current.sellingPoints,
            description: current.description,
            tips: current.tips,
          },
        }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) toast({ title: '请求过频，稍后再试', variant: 'destructive' });
        else if (resp.status === 402) toast({ title: 'AI 额度不足', variant: 'destructive' });
        else toast({ title: '对话失败', description: `HTTP ${resp.status}`, variant: 'destructive' });
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      let done = false;

      while (!done) {
        const r = await reader.read();
        if (r.done) break;
        buf += decoder.decode(r.value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n')) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const j = line.slice(6).trim();
          if (j === '[DONE]') { done = true; break; }
          try {
            const parsed = JSON.parse(j);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content: acc };
                return copy;
              });
            }
          } catch {
            buf = line + '\n' + buf;
            break;
          }
        }
      }

      const j = extractJSON(acc);
      if (j && j.name) {
        setPendingResult(jsonToResult(j, current));
      }
    } catch (e: any) {
      console.error('[InlineRefine] stream error:', e);
      toast({ title: '对话出错', description: e?.message || '', variant: 'destructive' });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  };

  const applyAndSubmit = async () => {
    if (!pendingResult) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('submit-correction', {
        body: {
          product_id: productId,
          image_url: imageUrl,
          original_payload: {
            name: current.name,
            category: current.category,
            era: current.era,
            origin: current.origin,
            material: current.material,
            craft: current.craft,
          },
          corrected_payload: {
            name: pendingResult.name,
            category: pendingResult.category,
            era: pendingResult.era,
            origin: pendingResult.origin,
            material: pendingResult.material,
            craft: pendingResult.craft,
            sellingPoints: pendingResult.sellingPoints,
            pitch: pendingResult.pitch,
            description: pendingResult.description,
            tips: pendingResult.tips,
          },
          user_hint: messages.find((m) => m.role === 'user')?.content || '',
          conversation: messages.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      onApplied(pendingResult);
      toast({
        title: '已应用新结果',
        description: '已提交给管理员审核，通过后将作为团队共享样本',
      });
      setPendingResult(null);
    } catch (e: any) {
      console.error('[InlineRefine] submit error:', e);
      toast({ title: '提交失败', description: e?.message || '', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20 shadow-soft overflow-hidden">
      {/* Header：折叠/展开入口 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-amber-100/40 dark:hover:bg-amber-900/20 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
            <MessageSquareWarning className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-amber-900 dark:text-amber-200 leading-tight">
              有疑问？或发现识别错误？
            </div>
            <div className="text-[11px] text-amber-700/80 dark:text-amber-300/70 mt-0.5">
              直接跟 AI 聊一聊，可补拍新角度让它再看一次
            </div>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
        )}
      </button>

      {open && (
        <CardContent className="pt-0 pb-3 px-3 space-y-3 border-t border-amber-500/20">
          {/* 对话区 */}
          <div
            ref={scrollRef}
            className="max-h-[40vh] overflow-y-auto bg-background/60 rounded-xl border border-border/40 px-3 py-3"
          >
            {messages.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-6 space-y-2">
                <Sparkles className="w-5 h-5 mx-auto text-accent" />
                <p className="leading-relaxed">
                  例如：「这是九谷烧赤绘，不是青花」「底款写着大正年间」<br />
                  或者点 📎 补拍底款、侧面、包装等细节
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {m.role === 'user' && m.attachments && m.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {m.attachments.map((src, k) => (
                            <img
                              key={k}
                              src={src}
                              alt="补拍"
                              className="w-14 h-14 rounded-md object-cover ring-1 ring-primary-foreground/30"
                            />
                          ))}
                        </div>
                      )}
                      {m.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-background/50 prose-pre:text-xs prose-pre:my-2">
                          <ReactMarkdown>
                            {stripJSONBlocks(m.content) || (m.content ? 'AI 正在整理结果…' : '思考中…')}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {streaming && !messages[messages.length - 1]?.content && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-3 py-2 bg-muted text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      AI 正在看图，1-3 秒就开始说…
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 待应用新结果 */}
          {pendingResult && (
            <div className="rounded-lg border border-success/40 bg-success/10 p-2.5 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-success-foreground">
                <Check className="w-3.5 h-3.5 text-success" />
                AI 给出新结果
              </div>
              <div className="text-foreground">
                <span className="font-semibold">{pendingResult.name}</span>
                {pendingResult.era && <span className="text-muted-foreground"> · {pendingResult.era}</span>}
                {pendingResult.origin && <span className="text-muted-foreground"> · {pendingResult.origin}</span>}
              </div>
            </div>
          )}

          {/* 补拍图缩略图条 */}
          {extraImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {extraImages.map((src, i) => (
                <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden ring-1 ring-border">
                  <img src={src} alt="补拍" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeExtra(i)}
                    className="absolute top-0 right-0 w-5 h-5 rounded-bl-md bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                    aria-label="移除"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 输入区 */}
          <div className="flex gap-2 items-end">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onPickFiles}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming || extraImages.length >= MAX_EXTRA_IMAGES}
              className="h-10 w-10 shrink-0 rounded-full"
              aria-label="加图"
              title={`加图（最多 ${MAX_EXTRA_IMAGES} 张）`}
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="告诉 AI 哪里不对，或问任何疑问…"
              rows={2}
              disabled={streaming}
              className="resize-none text-sm flex-1 min-h-[2.5rem] bg-background"
            />
            <Button
              size="icon"
              onClick={send}
              disabled={(!input.trim() && extraImages.length === 0) || streaming}
              className="h-10 w-10 shrink-0 rounded-full"
              aria-label="发送"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {pendingResult && (
            <Button
              onClick={applyAndSubmit}
              disabled={saving}
              className="w-full h-10 rounded-full gap-2 bg-gradient-accent text-accent-foreground"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              应用新结果，并提交训练样本
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
