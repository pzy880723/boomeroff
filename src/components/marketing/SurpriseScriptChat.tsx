import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, Sparkles } from 'lucide-react';

export interface SurpriseScriptMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function SurpriseScriptChat({
  messages,
  busy,
  onSubmit,
}: {
  messages: SurpriseScriptMessage[];
  busy: boolean;
  onSubmit: (instruction: string) => Promise<void> | void;
}) {
  const [input, setInput] = useState('');
  const submit = async () => {
    const instruction = input.trim();
    if (!instruction || busy) return;
    await onSubmit(instruction);
    setInput('');
  };

  return (
    <section className="rounded-xl border border-accent/25 bg-card overflow-hidden">
      <div className="px-3 py-2 border-b border-accent/10 flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-accent" />
        <span className="text-[11px] font-semibold">告诉 BOOMER 怎么改</span>
        <span className="ml-auto text-[10px] text-muted-foreground">改完自动保存</span>
      </div>
      {messages.length > 0 && (
        <div className="max-h-28 overflow-y-auto px-3 pt-2 space-y-1.5">
          {messages.slice(-4).map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={message.role === 'user'
                ? 'ml-8 rounded-lg bg-accent text-accent-foreground px-2.5 py-1.5 text-[11px]'
                : 'mr-8 rounded-lg bg-muted px-2.5 py-1.5 text-[11px] text-foreground'}
            >
              {message.content}
            </div>
          ))}
        </div>
      )}
      <div className="p-2 flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="例如：更突出唱片区，开场更有冲击力"
          className="min-h-[58px] resize-none text-xs"
          disabled={busy}
        />
        <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={() => void submit()} disabled={busy || !input.trim()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </section>
  );
}
