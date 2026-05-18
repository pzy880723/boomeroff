import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Sparkles, Trash2, Camera, ImagePlus, X, Square, History, Plus } from 'lucide-react';
import { useSpiritChat, listSpiritConversations, deleteSpiritConversation, type SpiritConversationSummary } from '@/hooks/useSpiritChat';
import { SpiritMascot } from './SpiritMascot';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const QUICK_CHIPS = [
  { label: '今日和谁一起上班？', prompt: '今天我和谁一起上班？几点到几点？' },
  { label: '我的等级和打卡', prompt: '我现在多少经验？连续打卡几天了？' },
  { label: '帮我打打气', prompt: '我有点累，给我一句温暖的话吧～' },
  { label: '今天学点啥', prompt: '今天可以学点啥中古冷知识？讲一个有趣的给我听' },
];

const MAX_IMAGES = 4;
const MAX_FILE_MB = 10;

export function SpiritChatPanel() {
  const { messages, status, send, stop, clear, conversationId, loadConversation, newConversation } = useSpiritChat();
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<{ file: File; preview: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<SpiritConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);


  // cleanup previews
  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  const busy = status === 'sending' || status === 'streaming' || status === 'uploading';
  const spiritState =
    status === 'sending' || status === 'uploading' ? 'thinking'
      : status === 'streaming' ? 'talking'
      : 'idle';

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const room = MAX_IMAGES - pending.length;
    if (room <= 0) {
      toast({ title: `最多 ${MAX_IMAGES} 张图`, variant: 'destructive' });
      return;
    }
    const accepted: { file: File; preview: string }[] = [];
    for (const f of arr.slice(0, room)) {
      if (!f.type.startsWith('image/')) continue;
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast({ title: `${f.name} 超过 ${MAX_FILE_MB}MB`, variant: 'destructive' });
        continue;
      }
      accepted.push({ file: f, preview: URL.createObjectURL(f) });
    }
    if (accepted.length) setPending((p) => [...p, ...accepted]);
  };

  const removePending = (i: number) => {
    setPending((p) => {
      URL.revokeObjectURL(p[i].preview);
      return p.filter((_, idx) => idx !== i);
    });
  };

  const handleSend = () => {
    const t = input.trim();
    if (busy) return;
    if (!t && pending.length === 0) return;
    const files = pending.map((p) => p.file);
    // cleanup previews after we capture files
    pending.forEach((p) => URL.revokeObjectURL(p.preview));
    setPending([]);
    setInput('');
    send(t, files.length ? files : undefined);
  };

  const handleChip = (prompt: string) => {
    if (busy) return;
    send(prompt);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 消息流 */}
      <div ref={scrollerRef} className="relative flex-1 overflow-y-auto overscroll-contain px-4 pb-2 pt-2">
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-[hsl(var(--background)/0.6)] backdrop-blur text-[hsl(var(--primary-foreground)/0.55)] hover:text-[hsl(var(--primary-foreground)/0.9)] hover:bg-[hsl(var(--accent)/0.18)]"
            aria-label="清空对话"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3 py-2">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                role={m.role}
                content={m.content}
                images={m.images}
                streaming={status === 'streaming' && m === messages[messages.length - 1]}
              />
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

      {/* 待发送图片预览 */}
      {pending.length > 0 && (
        <div className="shrink-0 px-4 pt-2 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {pending.map((p, i) => (
            <div key={i} className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-[hsl(var(--accent)/0.3)] bg-black/20">
              <img src={p.preview} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removePending(i)}
                disabled={busy}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                aria-label="移除"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入框 */}
      <div
        className="shrink-0 px-4 pt-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="flex items-end gap-1.5 rounded-2xl bg-[hsl(var(--accent)/0.1)] border border-[hsl(var(--accent)/0.22)] p-1.5 focus-within:border-[hsl(var(--accent)/0.5)] transition-colors">
          {/* 拍照 */}
          <button
            type="button"
            disabled={busy || pending.length >= MAX_IMAGES}
            onClick={() => cameraRef.current?.click()}
            className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center text-[hsl(var(--primary-foreground)/0.8)] hover:bg-[hsl(var(--accent)/0.18)] disabled:opacity-40"
            aria-label="拍照"
          >
            <Camera className="w-[18px] h-[18px]" />
          </button>
          {/* 相册 */}
          <button
            type="button"
            disabled={busy || pending.length >= MAX_IMAGES}
            onClick={() => galleryRef.current?.click()}
            className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center text-[hsl(var(--primary-foreground)/0.8)] hover:bg-[hsl(var(--accent)/0.18)] disabled:opacity-40"
            aria-label="选图"
          >
            <ImagePlus className="w-[18px] h-[18px]" />
          </button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />

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
            placeholder={pending.length > 0 ? '想问点啥？也可以直接发送…' : '跟小精灵聊聊吧…（Enter 发送）'}
            rows={1}
            className="min-h-[40px] max-h-32 resize-none border-0 bg-transparent text-[16px] text-[hsl(var(--primary-foreground))] placeholder:text-[hsl(var(--primary-foreground)/0.4)] focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
          />
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={busy || (!input.trim() && pending.length === 0)}
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
    <div className="flex flex-col items-center justify-center text-center px-6 min-h-full -translate-y-[6%]">
      <div className="relative overflow-visible" style={{ width: 260, height: 260 }}>
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: 'scale(1.15) translateY(-2%)', transformOrigin: '50% 50%' }}
        >
          <SpiritMascot size={260} state="idle" />
        </div>
      </div>
      <div className="mt-2 text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" />
        你好呀～我是中古小精灵
      </div>
      <div className="mt-2 text-[12px] leading-relaxed text-[hsl(var(--primary-foreground)/0.65)] max-w-[280px]">
        可以问我中古知识、今天和谁一起上班、想要打打气，也可以拍张照片让我帮你看看～
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  images,
  streaming,
}: { role: 'user' | 'assistant'; content: string; images?: string[]; streaming: boolean }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] flex flex-col items-end gap-1.5">
          {images && images.length > 0 && (
            <div className={cn('grid gap-1', images.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
              {images.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl overflow-hidden border border-[hsl(var(--accent)/0.3)]"
                >
                  <img src={url} alt="" className="w-32 h-32 object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          )}
          {content && (
            <div className="rounded-2xl rounded-br-md px-3.5 py-2 bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] text-[13px] leading-relaxed whitespace-pre-wrap">
              {content}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <SpiritMascot size={36} flat />
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
