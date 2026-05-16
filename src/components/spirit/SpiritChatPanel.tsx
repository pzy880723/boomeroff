import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Sparkles, Trash2 } from 'lucide-react';
import { useSpiritChat } from '@/hooks/useSpiritChat';
import { SpiritMascot } from './SpiritMascot';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const QUICK_CHIPS = [
  { label: '今日和谁一起上班？', prompt: '今天我和谁一起上班？几点到几点？' },
  { label: '我的等级和打卡', prompt: '我现在多少经验？连续打卡几天了？' },
  { label: '帮我打打气', prompt: '我有点累，给我一句温暖的话吧～' },
  { label: '今天学点啥', prompt: '今天可以学点啥中古冷知识？讲一个有趣的给我听' },
];

export function SpiritChatPanel() {
  const { messages, status, send, clear } = useSpiritChat();
  const [input, setInput] = useState('');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // 输入框自动聚焦
  useEffect(() => {
    inputRef.current?.focus();
  }, [status]);

  const busy = status === 'sending' || status === 'streaming';
  const spiritState = status === 'sending' ? 'thinking' : status === 'streaming' ? 'talking' : 'idle';

  const handleSend = () => {
    const t = input.trim();
    if (!t || busy) return;
    setInput('');
    send(t);
  };

  const handleChip = (prompt: string) => {
    if (busy) return;
    send(prompt);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部小精灵气泡区 */}
      <div className="shrink-0 px-4 pt-3 pb-2 flex items-center gap-3">
        <SpiritMascot size={48} state={spiritState} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[hsl(var(--primary-foreground))]">中古小精灵</div>
          <div className="text-[11px] text-[hsl(var(--primary-foreground)/0.6)] truncate">
            {busy ? '正在思考…' : '随便问我点啥都行～'}
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="shrink-0 p-1.5 rounded-full text-[hsl(var(--primary-foreground)/0.5)] hover:text-[hsl(var(--primary-foreground)/0.9)] hover:bg-[hsl(var(--accent)/0.12)]"
            aria-label="清空对话"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 消息流 */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3 py-2">
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} content={m.content} streaming={status === 'streaming' && m === messages[messages.length - 1]} />
            ))}
          </div>
        )}
      </div>

      {/* 快捷指令 chips */}
      <div className="shrink-0 px-4 pt-2 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {QUICK_CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            disabled={busy}
            onClick={() => handleChip(c.prompt)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors',
              'bg-[hsl(var(--accent)/0.12)] border border-[hsl(var(--accent)/0.25)] text-[hsl(var(--primary-foreground)/0.85)]',
              'hover:bg-[hsl(var(--accent)/0.22)]',
              busy && 'opacity-50 cursor-not-allowed',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 输入框 */}
      <div
        className="shrink-0 px-4 pt-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="flex items-end gap-2 rounded-2xl bg-[hsl(var(--accent)/0.1)] border border-[hsl(var(--accent)/0.22)] p-1.5 focus-within:border-[hsl(var(--accent)/0.5)] transition-colors">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="跟小精灵聊聊吧…（Enter 发送）"
            rows={1}
            className="min-h-[40px] max-h-32 resize-none border-0 bg-transparent text-[13px] text-[hsl(var(--primary-foreground))] placeholder:text-[hsl(var(--primary-foreground)/0.4)] focus-visible:ring-0 focus-visible:ring-offset-0 px-2"
          />
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={busy || !input.trim()}
            className="h-9 w-9 shrink-0 rounded-xl bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent)/0.9)] text-[hsl(var(--accent-foreground))]"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center pt-8 pb-4 px-6">
      <SpiritMascot size={120} state="idle" />
      <div className="mt-4 text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" />
        你好呀～我是中古小精灵
      </div>
      <div className="mt-2 text-[12px] leading-relaxed text-[hsl(var(--primary-foreground)/0.65)] max-w-[240px]">
        可以问我中古知识、今天和谁一起上班、想要打打气，也可以让我讲个冷知识～
      </div>
    </div>
  );
}

function MessageBubble({ role, content, streaming }: { role: 'user' | 'assistant'; content: string; streaming: boolean }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md px-3.5 py-2 bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] text-[13px] leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <SpiritMascot size={28} flat />
      <div className="max-w-[85%] text-[hsl(var(--primary-foreground)/0.95)] text-[13px] leading-relaxed">
        {content ? (
          <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0">
            <ReactMarkdown>{content}</ReactMarkdown>
            {streaming && <span className="inline-block w-1.5 h-3 bg-[hsl(var(--accent))] align-middle ml-0.5 animate-pulse" />}
          </div>
        ) : (
          <div className="flex gap-1 pt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent)/0.7)] animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent)/0.7)] animate-bounce" style={{ animationDelay: '120ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent)/0.7)] animate-bounce" style={{ animationDelay: '240ms' }} />
          </div>
        )}
      </div>
    </div>
  );
}
