import { useState, useRef, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Send, Sparkles, MessageSquareWarning, Check, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/integrations/supabase/client';
import type { RecognitionResult, ProductCategory } from '@/types';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

interface RefineDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  imageUrl: string | null;
  productId: string | null;
  current: RecognitionResult;
  onApplied: (next: RecognitionResult) => void;
}

// 从 markdown 文本里提取最后一个 ```json``` 代码块
function extractJSON(text: string): any | null {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)\s*```/g)];
  if (matches.length === 0) {
    // 兜底：找首个 { ... } 块
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
  try { return JSON.parse(matches[matches.length - 1][1]); } catch { return null; }
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
    description: j?.description ?? fallback.description ?? null,
    tips: j?.tips ?? fallback.tips ?? null,
    confidence: typeof j?.confidence === 'number' ? j.confidence : fallback.confidence,
  };
}

export function RefineDialog({
  open, onOpenChange, imageUrl, productId, current, onApplied,
}: RefineDialogProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [pendingResult, setPendingResult] = useState<RecognitionResult | null>(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 重置状态
  useEffect(() => {
    if (open) {
      setMessages([]);
      setInput('');
      setStreaming(false);
      setPendingResult(null);
    }
  }, [open]);

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setStreaming(true);

    // 占位 assistant 消息
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
          messages: next,
          imageUrl,
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
        setMessages((prev) => prev.slice(0, -1)); // 移除占位
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
            // 不完整的 json，回退
            buf = line + '\n' + buf;
            break;
          }
        }
      }

      // 解析最终 JSON
      const j = extractJSON(acc);
      if (j && j.name) {
        setPendingResult(jsonToResult(j, current));
      }
    } catch (e: any) {
      console.error('[Refine] stream error:', e);
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
            description: pendingResult.description,
            tips: pendingResult.tips,
          },
          user_hint: messages.find((m) => m.role === 'user')?.content || '',
          conversation: messages,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      onApplied(pendingResult);
      toast({
        title: '已应用新结果',
        description: '已提交给管理员审核，通过后将作为团队共享样本',
      });
      onOpenChange(false);
    } catch (e: any) {
      console.error('[Refine] submit error:', e);
      toast({ title: '提交失败', description: e?.message || '', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 max-h-[90vh] flex flex-col gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquareWarning className="w-4 h-4 text-amber-500" />
            跟 AI 一起纠正识别
          </DialogTitle>
          <DialogDescription className="text-xs">
            告诉 AI 哪里错了。修正后的结果会作为团队共享样本，让识别越用越准。
          </DialogDescription>
        </DialogHeader>

        {/* 顶部：原图 + 当前结果 */}
        <div className="px-4 pt-3 pb-2 flex gap-3 items-start border-b border-border/40 bg-muted/30">
          {imageUrl && (
            <img
              src={imageUrl}
              alt="商品"
              className="w-16 h-16 rounded-lg object-cover ring-1 ring-border/40 shrink-0"
            />
          )}
          <div className="flex-1 min-w-0 text-xs space-y-1">
            <div className="font-medium text-sm truncate">{current.name}</div>
            <div className="flex flex-wrap gap-1">
              {current.era && <Badge variant="outline" className="text-[10px] px-1.5">{current.era}</Badge>}
              {current.origin && <Badge variant="outline" className="text-[10px] px-1.5">{current.origin}</Badge>}
              {current.material && <Badge variant="outline" className="text-[10px] px-1.5">{current.material}</Badge>}
            </div>
          </div>
        </div>

        {/* 对话区 */}
        <div ref={scrollRef} className="flex-1 min-h-0 max-h-[40vh] overflow-y-auto">
          <div className="px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-6 space-y-2">
                <Sparkles className="w-5 h-5 mx-auto text-accent" />
                <p>例如：「这是九谷烧赤绘，不是青花」「底款写着大正年间」「应该是粉彩，不是青花」</p>
              </div>
            )}
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
                  {m.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-background/50 prose-pre:text-xs prose-pre:my-2">
                      <ReactMarkdown>{m.content || '思考中…'}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 bg-muted text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  AI 正在重新分析…
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 输入区 */}
        <div className="border-t border-border/60 p-3 space-y-2 bg-background">
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
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="告诉 AI 正确答案，或描述线索…"
              rows={2}
              disabled={streaming}
              className="resize-none text-sm flex-1 min-h-[2.5rem]"
            />
            <Button
              size="icon"
              onClick={send}
              disabled={!input.trim() || streaming}
              className="h-10 w-10 shrink-0 rounded-full"
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
