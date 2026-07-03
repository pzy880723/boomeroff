import { useEffect, useRef, useState, useLayoutEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Send, Sparkles, Camera, ImagePlus, X, Square, Shuffle,
  CalendarDays, Trophy, HeartHandshake, BookOpenText, Store, PenLine, MessageSquareHeart,
} from 'lucide-react';
import { useSpiritChat } from '@/hooks/useSpiritChat';
import { SpiritMascot } from './SpiritMascot';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const THINKING_HINTS = [
  '翻翻我的小本本…',
  '让我想想怎么说更清楚～',
  '正在认真组织语言 ✍️',
  '嗯…这个问题有点意思',
  '脑袋瓜在嗡嗡转 🌀',
  '稍等，我去货架翻一下',
  '调出 BOOMER 的知识库 📚',
  '对一对今天的资料…',
  '让我捋一捋思路',
  '小爪子在打字了 🐾',
  '正在挑最合适的说法',
  '在记忆里搜一搜～',
  '马上就来，别走开哦',
  '让我先深呼吸一口 🌿',
  '这个我得仔细想想',
  '正在拼凑答案的小碎片',
  '查查我的中古笔记本 📒',
  '稍等，灵感正在赶来',
];

const UPLOADING_HINTS = [
  '正在偷瞄你拍的图 👀',
  '图片传输中，别走开～',
  '在仔细看每一处细节',
  '把照片送到我面前 📸',
  '正在放大镜模式 🔍',
  '让我端详端详…',
];

function ThinkingHint({ mode }: { mode: 'thinking' | 'uploading' }) {
  const pool = mode === 'uploading' ? UPLOADING_HINTS : THINKING_HINTS;
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * pool.length));
  useEffect(() => {
    const t = setInterval(() => {
      setIdx((prev) => {
        if (pool.length <= 1) return prev;
        let n = Math.floor(Math.random() * pool.length);
        if (n === prev) n = (n + 1) % pool.length;
        return n;
      });
    }, 2200);
    return () => clearInterval(t);
  }, [pool]);
  return (
    <span
      key={idx}
      className="text-[12px] text-[hsl(var(--primary-foreground)/0.6)] animate-in fade-in-0 duration-300"
    >
      {pool[idx]}
    </span>
  );
}

type ChipCategory =
  | 'shift'
  | 'level'
  | 'mood'
  | 'trivia'
  | 'helper'
  | 'copywriting'
  | 'today';

interface Chip {
  label: string;
  prompt: string;
  cat: ChipCategory;
}

const QUICK_CHIPS: Chip[] = [
  // 排班 / 同事
  { cat: 'shift', label: '今日和谁一起上班？', prompt: '今天我和谁一起上班？几点到几点？' },
  { cat: 'shift', label: '明天我上班吗？', prompt: '我明天上班吗？是什么班次？' },
  { cat: 'shift', label: '这周谁休息？', prompt: '这一周店里谁休息？分别哪天？' },
  { cat: 'shift', label: '下周排班看一眼', prompt: '帮我看看下周我的排班情况' },
  { cat: 'shift', label: '本月我休几天', prompt: '我这个月一共休几天？都是哪几天？' },
  { cat: 'shift', label: '今天有几个人在店', prompt: '今天店里一共几个店员在班？' },
  { cat: 'shift', label: '想调班怎么办', prompt: '我想跟同事调一下班，应该怎么操作比较合适？' },
  // 打卡 / 等级
  { cat: 'level', label: '我的等级和打卡', prompt: '我现在多少经验？连续打卡几天了？' },
  { cat: 'level', label: '离下一级还差多少？', prompt: '我距离下一级还差多少经验？要怎么涨得快？' },
  { cat: 'level', label: '这个月打卡几天了？', prompt: '我这个月一共打卡几天了？' },
  { cat: 'level', label: '我连击多少天了', prompt: '我现在连续打卡多少天？下一个连击奖励在哪天？' },
  { cat: 'level', label: '怎么涨经验最快', prompt: '现在涨经验最划算的方式是什么？给我排个序' },
  { cat: 'level', label: '我今天还能拿多少分', prompt: '今天我还有哪些任务能拿经验？分别多少分？' },
  // 情绪 / 打气
  { cat: 'mood', label: '帮我打打气', prompt: '我有点累，给我一句温暖的话吧～' },
  { cat: 'mood', label: '来句鼓励的话', prompt: '送我一句今天专属的鼓励吧' },
  { cat: 'mood', label: '今天有点丧', prompt: '我今天心情不太好，安慰一下我' },
  { cat: 'mood', label: '被顾客气到了', prompt: '刚被顾客气到了，帮我消消气说两句' },
  { cat: 'mood', label: '想偷个懒', prompt: '今天好想偷懒，给我一个不内耗的理由' },
  { cat: 'mood', label: '夸夸我', prompt: '夸夸我吧，要走心的那种' },
  { cat: 'mood', label: '想辞职怎么办', prompt: '今天有点想辞职，跟我聊聊吧' },
  // 中古冷知识
  { cat: 'trivia', label: '今天学点啥', prompt: '今天可以学点啥中古冷知识？讲一个有趣的给我听' },
  { cat: 'trivia', label: '来个中古冷知识', prompt: '随便给我讲一个中古行业的冷知识' },
  { cat: 'trivia', label: '讲个奢侈品小八卦', prompt: '讲一个奢侈品牌的小八卦或趣闻' },
  { cat: 'trivia', label: '怎么辨真假？', prompt: '中古包辨别真伪有哪些通用的小技巧？' },
  { cat: 'trivia', label: '皮具怎么保养', prompt: '中古皮具日常保养要注意什么？给点干货' },
  { cat: 'trivia', label: '老花年代怎么看', prompt: '怎么从五金、内里、走线判断 LV 老花的大致年代？' },
  { cat: 'trivia', label: '银饰怎么清洗', prompt: '中古银饰发黑了要怎么清洗保养？' },
  { cat: 'trivia', label: '日本中古文化', prompt: '日本中古文化为什么这么火？讲两句' },
  // 工作小帮手
  { cat: 'helper', label: '顾客嫌贵怎么回？', prompt: '顾客说东西太贵了，我应该怎么回应比较好？' },
  { cat: 'helper', label: '这件怎么搭着卖？', prompt: '一件中古单品怎么搭配着推荐给顾客更容易成交？' },
  { cat: 'helper', label: '被砍价了怎么办', prompt: '顾客一直砍价压价，我怎么守住价又不得罪人？' },
  { cat: 'helper', label: '退换货怎么沟通', prompt: '顾客想退中古商品，我应该怎么沟通比较稳？' },
  { cat: 'helper', label: '怎么拍出种草感', prompt: '中古商品怎么拍出种草感？给我几个角度和构图建议' },
  { cat: 'helper', label: '陈列怎么改一改', prompt: '柜台陈列有点乱，给我几个能马上动手的改造建议' },
  { cat: 'helper', label: '怎么搭话不尬', prompt: '顾客一进店我怎么搭话不尴尬、不像推销？' },
  // 朋友圈 / 文案
  { cat: 'copywriting', label: '帮我想个朋友圈文案', prompt: '帮我写一条卖中古的朋友圈文案，要有感觉一点' },
  { cat: 'copywriting', label: '写个治愈系文案', prompt: '写一条治愈系风格的中古朋友圈文案给我' },
  { cat: 'copywriting', label: '写个搞笑款文案', prompt: '写一条搞笑款的中古朋友圈文案，让人忍不住想点赞' },
  { cat: 'copywriting', label: '节日营销文案', prompt: '帮我写一条贴近最近节日氛围的中古朋友圈文案' },
  { cat: 'copywriting', label: '帮我起个商品标题', prompt: '帮我给一件中古商品起一个有点画面感的小红书标题' },
  { cat: 'copywriting', label: '一句话推这件', prompt: '用一句话帮我推一件中古商品，要勾人' },
  // 今日推荐
  { cat: 'today', label: '今天主推什么风格？', prompt: '今天比较好卖的中古风格是什么？给点搭配建议' },
  { cat: 'today', label: '今天主推哪个品类', prompt: '今天主推哪个品类比较容易出单？' },
  { cat: 'today', label: '哪个价位最好卖', prompt: '现在哪个价位段的中古商品最走量？' },
  { cat: 'today', label: '今天可以上什么新', prompt: '今天可以从仓库挑哪类货上架比较合适？' },
  { cat: 'today', label: '本周可以推什么', prompt: '本周值得集中推一波的中古品类是什么？' },
];

/** 按时段给分类加权,早上偏排班/打气;中午偏知识/文案;晚上偏复盘/鼓励 */
function timeWeights(): Record<ChipCategory, number> {
  const h = new Date().getHours();
  if (h < 11) return { shift: 2.2, mood: 1.6, level: 1.4, today: 1.3, helper: 1, trivia: 0.8, copywriting: 0.8 };
  if (h < 17) return { trivia: 1.8, copywriting: 1.6, helper: 1.5, today: 1.4, shift: 1, mood: 1, level: 1 };
  return { mood: 2.0, level: 1.8, copywriting: 1.3, trivia: 1.2, helper: 1, today: 0.9, shift: 0.9 };
}

function weightedPickCategory(remaining: ChipCategory[], weights: Record<ChipCategory, number>): ChipCategory {
  const total = remaining.reduce((s, c) => s + (weights[c] ?? 1), 0);
  let r = Math.random() * total;
  for (const c of remaining) {
    r -= weights[c] ?? 1;
    if (r <= 0) return c;
  }
  return remaining[remaining.length - 1];
}

/** 抽 n 条,优先保证分类不重复;每个分类内部洗牌随机抽一条 */
function pickChips(n = 4): Chip[] {
  const weights = timeWeights();
  const byCat = new Map<ChipCategory, Chip[]>();
  for (const c of QUICK_CHIPS) {
    const arr = byCat.get(c.cat) ?? [];
    arr.push(c);
    byCat.set(c.cat, arr);
  }
  // 洗牌每个分类的内部顺序
  for (const arr of byCat.values()) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  let cats = Array.from(byCat.keys());
  const result: Chip[] = [];
  while (result.length < n && cats.length > 0) {
    const pick = weightedPickCategory(cats, weights);
    const arr = byCat.get(pick)!;
    const chip = arr.shift();
    if (chip) result.push(chip);
    cats = cats.filter((c) => (byCat.get(c)?.length ?? 0) > 0);
  }
  // 兜底:若分类不够,再随机补
  if (result.length < n) {
    const rest = QUICK_CHIPS.filter((c) => !result.includes(c));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    result.push(...rest.slice(0, n - result.length));
  }
  return result;
}

function pickChipsByCategory(cat: ChipCategory, n = 4): Chip[] {
  const pool = QUICK_CHIPS.filter((c) => c.cat === cat).slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

const TOPIC_TABS: { id: ChipCategory | 'all'; label: string; Icon: typeof CalendarDays }[] = [
  { id: 'all', label: '全部', Icon: Sparkles },
  { id: 'shift', label: '排班', Icon: CalendarDays },
  { id: 'level', label: '打卡', Icon: Trophy },
  { id: 'helper', label: '顾客', Icon: HeartHandshake },
  { id: 'trivia', label: '中古知识', Icon: BookOpenText },
  { id: 'today', label: '今日主推', Icon: Store },
  { id: 'copywriting', label: '写文案', Icon: PenLine },
  { id: 'mood', label: '打气', Icon: MessageSquareHeart },
];

const MAX_IMAGES = 4;
const MAX_FILE_MB = 10;

type SpiritChatApi = ReturnType<typeof useSpiritChat>;

export function SpiritChatPanel({ chat, taskCard }: { chat?: SpiritChatApi; taskCard?: React.ReactNode } = {}) {
  const fallback = useSpiritChat();
  const { messages, status, send, stop } = chat ?? fallback;
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<{ file: File; preview: string }[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [topicFilter, setTopicFilter] = useState<ChipCategory | 'all'>('all');
  const [displayChips, setDisplayChips] = useState(() => pickChips(4));
  // 切换主题 / 回到空对话时,重新抽 chips
  useEffect(() => {
    if (topicFilter === 'all') setDisplayChips(pickChips(4));
    else setDisplayChips(pickChipsByCategory(topicFilter, 4));
  }, [topicFilter]);
  useEffect(() => {
    if (messages.length === 0) setDisplayChips(
      topicFilter === 'all' ? pickChips(4) : pickChipsByCategory(topicFilter, 4)
    );
  }, [messages.length === 0]);

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
    <div className="relative flex flex-col h-full">
      {/* 消息流 */}
      <div ref={scrollerRef} className="relative flex-1 overflow-y-auto overscroll-contain px-4 pb-2 pt-2">
        {messages.length === 0 ? (
          <EmptyState onPickTopic={(t) => { setTopicFilter(t); }} onQuickAsk={(p) => handleChip(p)} />
        ) : (
          <div className="flex flex-col gap-3 py-2">
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              return (
                <MessageBubble
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  images={m.images}
                  streaming={status === 'streaming' && isLast}
                  hintMode={
                    isLast && m.role === 'assistant' && !m.content
                      ? status === 'uploading' ? 'uploading' : 'thinking'
                      : null
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 主题分类 tabs — 全店问答入口 */}
      <div className="shrink-0 px-4 pt-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TOPIC_TABS.map(({ id, label, Icon }) => {
          const active = topicFilter === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTopicFilter(id)}
              disabled={busy}
              className={cn(
                'shrink-0 flex items-center gap-1 px-2.5 h-7 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all',
                active
                  ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] shadow-[0_2px_6px_-2px_hsl(var(--accent)/0.6)]'
                  : 'bg-[hsl(var(--accent)/0.1)] text-[hsl(var(--primary-foreground)/0.7)] hover:bg-[hsl(var(--accent)/0.2)]',
                busy && 'opacity-50 cursor-not-allowed',
              )}
            >
              <Icon className="w-3 h-3" strokeWidth={2.4} />
              {label}
            </button>
          );
        })}
      </div>

      {/* 快捷指令 chips */}
      <div className="shrink-0 px-4 pt-1.5 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() =>
            setDisplayChips(topicFilter === 'all' ? pickChips(4) : pickChipsByCategory(topicFilter, 4))
          }
          disabled={busy}
          aria-label="换一批"
          className={cn(
            'shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors',
            'bg-[hsl(var(--accent)/0.18)] border border-[hsl(var(--accent)/0.3)] text-[hsl(var(--primary-foreground)/0.85)]',
            'hover:bg-[hsl(var(--accent)/0.3)] active:scale-95',
            busy && 'opacity-50 cursor-not-allowed',
          )}
        >
          <Shuffle className="w-3.5 h-3.5" />
        </button>
        {displayChips.map((c) => (
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
            placeholder={pending.length > 0 ? '想问点啥…' : '跟 BOOMER 聊聊…'}
            rows={1}
            className="min-h-[32px] max-h-28 resize-none border-0 bg-transparent text-[13px] leading-snug text-[hsl(var(--primary-foreground))] placeholder:text-[hsl(var(--primary-foreground)/0.4)] focus-visible:ring-0 focus-visible:ring-offset-0 px-1 py-1"
          />
          {busy ? (
            <Button
              type="button"
              size="icon"
              onClick={stop}
              className="h-7 w-7 shrink-0 rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              aria-label="停止生成"
            >
              <Square className="w-3 h-3" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() && pending.length === 0}
              className="h-7 w-7 shrink-0 rounded-lg bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent)/0.9)] text-[hsl(var(--accent-foreground))]"
              aria-label="发送"
            >
              <Send className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

    </div>
  );
}

const TOPIC_CARDS: {
  id: ChipCategory;
  Icon: typeof CalendarDays;
  title: string;
  hint: string;
  prompt: string;
}[] = [
  { id: 'shift',       Icon: CalendarDays,        title: '今日排班', hint: '几点到岗、跟谁一班', prompt: '我今天的班次是什么？跟谁一起上班？' },
  { id: 'level',       Icon: Trophy,              title: '打卡等级', hint: '积分、连击、下一级', prompt: '我现在多少经验？连续打卡几天了？下一级还差多少？' },
  { id: 'helper',      Icon: HeartHandshake,      title: '顾客搞不定', hint: '砍价 · 嫌贵 · 退换', prompt: '顾客说太贵想砍价，我怎么回既留住人又守住价？' },
  { id: 'trivia',      Icon: BookOpenText,        title: '中古知识',  hint: '真假 · 保养 · 年代', prompt: '给我讲一个今天可以立刻用得上的中古冷知识' },
  { id: 'today',       Icon: Store,               title: '今日主推',  hint: '风格 · 品类 · 价位', prompt: '今天店里主推什么风格和品类比较好卖？' },
  { id: 'copywriting', Icon: PenLine,             title: '写文案',   hint: '朋友圈 · 小红书',    prompt: '帮我写一条有点感觉的中古朋友圈文案' },
];

function EmptyState({
  onPickTopic,
  onQuickAsk,
}: {
  onPickTopic: (t: ChipCategory) => void;
  onQuickAsk: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-col items-center text-center px-4 pt-4 pb-6 min-h-full">
      {/* 海獭 */}
      <div className="relative overflow-visible shrink-0" style={{ width: 180, height: 180 }}>
        <SpiritMascot size={180} state="idle" />
      </div>
      <div className="mt-1 text-[hsl(var(--primary-foreground))] text-base font-bold flex items-center gap-1.5">
        <Sparkles className="w-4 h-4" />
        你好呀～我是 BOOMER
      </div>
      <div className="mt-1.5 text-[12px] leading-relaxed text-[hsl(var(--primary-foreground)/0.65)] max-w-[300px]">
        全店问答小百科 · 排班 / 打卡 / 顾客 / 知识 / 文案 / 情绪,都可以直接问我
      </div>

      {/* 主题入口 2x3 */}
      <div className="mt-4 grid grid-cols-2 gap-2 w-full max-w-[340px]">
        {TOPIC_CARDS.map(({ id, Icon, title, hint, prompt }) => (
          <button
            key={id}
            type="button"
            onClick={() => { onPickTopic(id); onQuickAsk(prompt); }}
            className={cn(
              'group flex items-center gap-2.5 rounded-2xl p-2.5 text-left transition-all active:scale-[0.98]',
              'bg-[hsl(var(--accent)/0.08)] border border-[hsl(var(--accent)/0.22)]',
              'hover:bg-[hsl(var(--accent)/0.16)] hover:border-[hsl(var(--accent)/0.4)]',
            )}
          >
            <span className="shrink-0 w-9 h-9 rounded-xl bg-[hsl(var(--accent)/0.22)] text-[hsl(var(--accent))] flex items-center justify-center group-hover:bg-[hsl(var(--accent))] group-hover:text-[hsl(var(--accent-foreground))] transition-colors">
              <Icon className="w-4 h-4" strokeWidth={2.4} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-bold text-[hsl(var(--primary-foreground))] truncate">{title}</span>
              <span className="block text-[10px] text-[hsl(var(--primary-foreground)/0.55)] truncate">{hint}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-1.5 text-[10.5px] text-[hsl(var(--primary-foreground)/0.5)]">
        <Camera className="w-3 h-3" />
        也可以直接拍照/发图,我来帮你看看这件是什么
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  images,
  streaming,
  hintMode,
}: { role: 'user' | 'assistant'; content: string; images?: string[]; streaming: boolean; hintMode?: 'thinking' | 'uploading' | null }) {
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
          <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_img]:my-2 [&_img]:rounded-xl [&_img]:border [&_img]:border-[hsl(var(--accent)/0.25)] [&_img]:max-h-72 [&_img]:object-cover [&_a]:text-[hsl(var(--accent))] [&_a]:underline">
            <ReactMarkdown
              components={{
                img: ({ node, ...props }) => (
                  <a href={props.src as string} target="_blank" rel="noreferrer">
                    <img {...props} loading="lazy" alt={props.alt || '示意图'} />
                  </a>
                ),
                a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
              }}
            >
              {content}
            </ReactMarkdown>
            {streaming && <span className="inline-block w-1.5 h-3 bg-[hsl(var(--accent))] align-middle ml-0.5 animate-pulse" />}
          </div>
        ) : (
          <div className="flex items-center gap-2 pt-1.5">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent)/0.7)] animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent)/0.7)] animate-bounce" style={{ animationDelay: '120ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent)/0.7)] animate-bounce" style={{ animationDelay: '240ms' }} />
            </div>
            {hintMode && <ThinkingHint mode={hintMode} />}
          </div>
        )}
      </div>
    </div>
  );
}
