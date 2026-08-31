import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronUp, Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';

export interface SurpriseScriptMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function SurpriseScriptChat({
  messages,
  pendingCount,
  open,
  chatting,
  applying,
  onOpenChange,
  onSend,
  onApply,
  onClear,
}: {
  messages: SurpriseScriptMessage[];
  pendingCount: number;
  open: boolean;
  chatting: boolean;
  applying: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (message: string) => Promise<void> | void;
  onApply: () => Promise<void> | void;
  onClear: () => Promise<void> | void;
}) {
  const [input, setInput] = useState('');
  const busy = chatting || applying;
  const submit = async () => {
    const message = input.trim();
    if (!message || busy) return;
    await onSend(message);
    setInput('');
  };

  return (
    <section className="overflow-hidden rounded-xl border border-accent/25 bg-card">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-muted/40"
      >
        <MessageCircle className="h-4 w-4 text-accent" />
        <span className="text-xs font-semibold">和 BOOMER 商量修改</span>
        {pendingCount > 0 && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
            {pendingCount} 条待应用
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">先聊清楚，再一次改完</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="animate-in slide-in-from-bottom-2 border-t border-accent/10 duration-200">
          <div className="max-h-48 space-y-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <div className="mr-8 rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-[11px] leading-relaxed">
                你可以连续说几条修改要求。我会先帮你梳理，确认后再一次性改完整脚本。
              </div>
            )}
            {messages.slice(-10).map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={[
                  'max-w-[88%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed',
                  message.role === 'user'
                    ? 'rounded-br-sm bg-accent text-accent-foreground'
                    : 'rounded-bl-sm bg-muted text-foreground',
                ].join(' ')}>
                  {message.content}
                </div>
              </div>
            ))}
            {chatting && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />BOOMER 正在理解…
                </div>
              </div>
            )}
          </div>

          <div className="flex items-end gap-2 border-t border-accent/10 p-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="例如：更突出唱片区；人物更年轻；结尾更有冲击力"
              className="min-h-[54px] flex-1 resize-none text-xs"
              disabled={busy}
            />
            <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={() => void submit()} disabled={busy || !input.trim()}>
              {chatting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-2 border-t border-accent/10 p-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => void onClear()} disabled={busy || pendingCount === 0}>
              <X className="mr-1 h-3.5 w-3.5" />取消本次沟通
            </Button>
            <Button type="button" size="sm" onClick={() => void onApply()} disabled={busy || pendingCount === 0}>
              {applying ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              按以上要求修改脚本{pendingCount > 0 ? `（${pendingCount} 条）` : ''}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
