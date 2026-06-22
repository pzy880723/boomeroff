// 视频策划自然语言对话框 — 单会话、无持久化。
// 用户和 AI 简短交流;信息够了点「让 AI 写一版完整脚本」让助理在对话里贴一版长脚本,
// 店员继续改;改满意了再点上层「生成分镜」按钮触发结构化脚本生成。
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'sonner';

export interface BriefMsg { role: 'user' | 'assistant'; content: string; kind?: 'chat' | 'draft_script' }
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
  shopId?: string | null;
  imageDescriptions?: { index: number; summary: string; best_for?: string }[];
}

const INITIAL: BriefMsg = {
  role: 'assistant',
  content: '想拍什么?随便聊聊——是想突出某件商品、某个区域,还是想给观众一种特定的感觉?我来帮你把要点理清楚。',
};

export function VideoBriefChat({ context, messages, onChange, shopId, imageDescriptions }: Props) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!messages.length) onChange([INITIAL]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, drafting]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: BriefMsg[] = [...messages, { role: 'user', content: text }];
    onChange(next);
    setInput('');
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('marketing-video-brief-chat', {
        body: { messages: next, context, shop_id: shopId, image_descriptions: imageDescriptions || [] },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const reply = ((data as any)?.reply || '').toString().trim() || '好的,继续说。';
      onChange([...next, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      toast.error(e?.message || 'AI 回复失败');
      onChange(next);
    } finally { setBusy(false); }
  };

  const draftScript = async () => {
    if (drafting || busy) return;
    setDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke('marketing-video-brief-chat', {
        body: {
          messages,
          context,
          shop_id: shopId,
          image_descriptions: imageDescriptions || [],
          mode: 'draft_script',
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const reply = ((data as any)?.reply || '').toString().trim();
      if (!reply) throw new Error('AI 没返回脚本');
      onChange([...messages, { role: 'assistant', content: reply, kind: 'draft_script' }]);
    } catch (e: any) {
      toast.error(e?.message || '脚本草稿生成失败');
    } finally { setDrafting(false); }
  };

  const reset = () => { onChange([INITIAL]); setInput(''); };
  const userTurns = messages.filter((m) => m.role === 'user').length;

  return (
    <div className="rounded-lg border border-accent/15 bg-card/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-accent/10">
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-accent" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">立意沟通</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={draftScript}
            disabled={drafting || busy || userTurns < 1}
            className="h-6 px-2 text-[10px]"
          >
            {drafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            让 AI 写一版完整脚本
          </Button>
          <Button size="sm" variant="ghost" onClick={reset} disabled={busy || drafting} className="h-6 px-2 text-[10px]">
            <RefreshCw className="w-3 h-3" />重聊
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="max-h-80 overflow-y-auto p-3 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={[
                'max-w-[88%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap',
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : m.kind === 'draft_script'
                    ? 'bg-accent/10 text-foreground rounded-bl-sm border border-accent/30'
                    : 'bg-muted/60 text-foreground rounded-bl-sm',
              ].join(' ')}
            >
              {m.kind === 'draft_script' && (
                <div className="text-[9px] uppercase tracking-[0.18em] text-accent font-semibold mb-1">脚本草稿 · 可继续讨论修改</div>
              )}
              {m.content}
            </div>
          </div>
        ))}
        {(busy || drafting) && (
          <div className="flex justify-start">
            <div className="bg-muted/60 rounded-2xl rounded-bl-sm px-3 py-1.5 text-[12px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin inline" /> {drafting ? '在写脚本…' : '想一下…'}
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
          placeholder="说说你想拍什么…(可以让 AI 改脚本,比如:图 3 换成图 5)"
          rows={1}
          className="flex-1 resize-none text-sm min-h-[36px] max-h-24"
          disabled={busy || drafting}
        />
        <Button size="sm" onClick={send} disabled={busy || drafting || !input.trim()} className="h-9 px-3">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  );
}
