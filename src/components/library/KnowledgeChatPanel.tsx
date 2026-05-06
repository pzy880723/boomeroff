import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Send, Loader2, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/integrations/supabase/client';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  knowledgeId: string;
  knowledgeName: string;
  suggestions?: string[];
}

export function KnowledgeChatPanel({ knowledgeId, knowledgeName, suggestions = [] }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 切换词条 → 清空
  useEffect(() => {
    setMessages([]);
    setInput('');
    setStreaming(false);
  }, [knowledgeId]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  }, [messages, open]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || streaming) return;

    const next: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setStreaming(true);
    setMessages((p) => [...p, { role: 'assistant', content: '' }]);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('未登录');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-knowledge`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          knowledgeId,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
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
    } catch (e: any) {
      console.error('[KnowledgeChat] error', e);
      toast({ title: '对话出错', description: e?.message || '', variant: 'destructive' });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <Card className="border-accent bg-accent/15 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-accent/25 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <MessageCircle className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">想多了解一点？跟 AI 聊一聊</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              基于本词条资料回答，帮您应对客人各种问题
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
      </button>

      {open && (
        <CardContent className="pt-0 pb-3 px-3 space-y-3 border-t border-accent/40">
          <div
            ref={scrollRef}
            className="max-h-[45vh] overflow-y-auto bg-background/60 rounded-xl border border-border/40 px-3 py-3"
          >
            {messages.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-6 space-y-3">
                <Sparkles className="w-5 h-5 mx-auto text-primary" />
                <p className="leading-relaxed">
                  您好，我是「{knowledgeName}」的小助手，<br />想知道什么直接问我吧～
                </p>
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                    {suggestions.filter(Boolean).map((s, i) => (
                      <button
                        key={i}
                        onClick={() => ask(s)}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/10 text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                        m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                      }`}
                    >
                      {m.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1.5 prose-ul:my-1.5">
                          <ReactMarkdown>
                            {m.content || (streaming ? '思考中…' : '')}
                          </ReactMarkdown>
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
                      AI 正在回答…
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              placeholder="输入问题，回车发送…"
              rows={1}
              className="min-h-[40px] max-h-32 resize-none rounded-2xl bg-background"
              disabled={streaming}
            />
            <Button
              type="button"
              size="icon"
              onClick={() => ask(input)}
              disabled={streaming || !input.trim()}
              className="h-10 w-10 shrink-0 rounded-full"
              aria-label="发送"
            >
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
