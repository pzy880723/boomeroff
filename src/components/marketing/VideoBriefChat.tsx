// 视频策划自然语言对话框 — 单会话、无持久化。
// 用户和 AI 简短交流,信息够后点上方"生成分镜"按钮触发脚本生成。
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export interface BriefMsg { role: 'user' | 'assistant'; content: string }
export interface BriefContext {
  video_type: string;
  duration: number;
  aspect: string;
  style: string;
}

interface Props {
  context: BriefContext;
  messages: BriefMsg[];
  onChange: (msgs: BriefMsg[]) => void;
}

const INITIAL: BriefMsg = {
  role: 'assistant',
  content: '想拍什么?随便聊聊——是想突出某件商品、某个区域,还是想给观众一种特定的感觉?我来帮你把要点理清楚。',
};

export function VideoBriefChat({ context, messages, onChange }: Props) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!messages.length) onChange([INITIAL]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: BriefMsg[] = [...messages, { role: 'user', content: text }];
    onChange(next);
    setInput('');
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('marketing-video-brief-chat', {
        body: { messages: next, context },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const reply = ((data as any)?.reply || '').toString().trim() || '好的,继续说。';
      onChange([...next, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      toast.error(e?.message || 'AI 回复失败');
      onChange(next); // 保留用户消息
    } finally { setBusy(false); }
  };

  const reset = () => {
    onChange([INITIAL]);
    setInput('');
  };

  return (
    <div className="rounded-lg border border-accent/15 bg-card/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-accent/10">
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-accent" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">立意沟通</span>
        </div>
        <Button size="sm" variant="ghost" onClick={reset} disabled={busy} className="h-6 px-2 text-[10px]">
          <RefreshCw className="w-3 h-3" />重聊
        </Button>
      </div>

      <div ref={scrollRef} className="max-h-64 overflow-y-auto p-3 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={[
                'max-w-[80%] rounded-2xl px-3 py-1.5 text-[12px] leading-relaxed whitespace-pre-wrap',
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted/60 text-foreground rounded-bl-sm',
              ].join(' ')}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-muted/60 rounded-2xl rounded-bl-sm px-3 py-1.5 text-[12px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin inline" /> 想一下…
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-accent/10 p-2 flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="说说你想拍什么…"
          rows={1}
          className="flex-1 resize-none text-sm min-h-[36px] max-h-24"
          disabled={busy}
        />
        <Button size="sm" onClick={send} disabled={busy || !input.trim()} className="h-9 px-3">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  );
}
