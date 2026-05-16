import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Quote, Volume2, Square, Copy, Sparkles, BookOpen } from 'lucide-react';
import { KnowledgeCard } from '@/lib/knowledgeCard';
import { useSpeech } from '@/hooks/useSpeech';
import { toast } from 'sonner';

interface Hints {
  name?: string;
  category?: string;
  era?: string | null;
  origin?: string | null;
  ip?: string | null;
}

interface Props {
  card: KnowledgeCard | null;
  loading?: boolean;
  /** 占位提示文案，例如「正在为本次识别生成知识卡…」 */
  loadingText?: string;
  /** 用于在等待期渲染"边看边等"的趣味提示卡 */
  hints?: Hints;
}

/**
 * 共享「知识卡」渲染：金句 / 速记卡 / 客户话术 / 富卖点 / 易混对比 / 别名读音
 * 用于：官方知识详情、个人识别历史、个人手建词条、AI 识别结果
 * 不渲染 body（深度阅读）
 */
export function KnowledgeCardSections({ card, loading, loadingText, hints }: Props) {
  const { isSpeaking, speak, stop } = useSpeech();
  const speakOrStop = (t: string) => (isSpeaking ? stop() : speak(t));
  const copyText = (t: string) =>
    navigator.clipboard.writeText(t).then(
      () => toast.success('已复制'),
      () => toast.error('复制失败'),
    );

  if (!card) {
    if (!loading) return null;
    return <EnrichingPlaceholder hints={hints} loadingText={loadingText} />;
  }

  return (
    <div className="space-y-4">
      {(card.pronunciation || (card.aliases && card.aliases.length > 0)) && (
        <div className="text-xs text-muted-foreground space-x-2">
          {card.pronunciation && <span>{card.pronunciation}</span>}
          {card.aliases && card.aliases.length > 0 && (
            <span>· 别名：{card.aliases.join(' / ')}</span>
          )}
        </div>
      )}

      {card.one_liner && (
        <Card className="p-4 bg-gradient-to-br from-primary/15 via-accent/20 to-background border-primary/30">
          <div className="flex items-start gap-3">
            <Quote className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                一句话讲给客人
              </div>
              <div className="text-lg font-semibold leading-snug">{card.one_liner}</div>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => speakOrStop(card.one_liner!)}>
                {isSpeaking ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyText(card.one_liner!)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {card.quick_facts && card.quick_facts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground">速记卡</h2>
          <div className="grid grid-cols-2 gap-2">
            {card.quick_facts.map((f, i) => (
              <div key={i} className="rounded-lg border bg-muted/20 p-2.5">
                <div className="text-[10px] text-muted-foreground">{f.label}</div>
                <div className="text-sm font-medium leading-tight mt-0.5">{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {card.customer_pitches && card.customer_pitches.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground">客户话术</h2>
          <div className="space-y-2">
            {card.customer_pitches.map((p, i) => (
              <Card key={i} className="p-3">
                <div className="flex items-start gap-2">
                  <Badge variant="secondary" className="shrink-0">{p.scene}</Badge>
                  <div className="flex-1 text-sm leading-relaxed">{p.line}</div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={() => speakOrStop(p.line)}
                  >
                    {isSpeaking ? <Square className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {card.selling_points_rich && card.selling_points_rich.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground">核心卖点</h2>
          <ul className="space-y-2.5">
            {card.selling_points_rich.map((p, i) => (
              <li key={i} className="rounded-lg border bg-muted/10 p-3">
                <div className="flex items-baseline gap-2">
                  {p.tag && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/40 text-accent-foreground shrink-0">
                      {p.tag}
                    </span>
                  )}
                  <span className="text-[15px] font-medium leading-snug">{p.text}</span>
                </div>
                {p.detail && (
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{p.detail}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.comparisons && card.comparisons.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground">易混对比</h2>
          <div className="space-y-1.5">
            {card.comparisons.map((c, i) => (
              <Card key={i} className="p-3 text-sm">
                <span className="font-semibold text-primary">vs {c.name}：</span>
                <span className="text-foreground/85 leading-relaxed">{c.diff}</span>
              </Card>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="text-[11px] text-muted-foreground text-center py-1.5 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3 h-3 animate-pulse text-primary" />
          知识卡还在补充中…
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 知识卡等待期：骨架 + 计时 + 轮播趣味提示卡
 * ──────────────────────────────────────────────────────────── */

function EnrichingPlaceholder({ hints, loadingText }: { hints?: Hints; loadingText?: string }) {
  // rAF 驱动的读秒，单位 0.1s
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(performance.now());
  useEffect(() => {
    startRef.current = performance.now();
    let raf = 0;
    const tick = () => {
      setElapsedMs(performance.now() - startRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tips = useMemo(() => buildEnrichingTips(hints), [hints]);
  const [tipIdx, setTipIdx] = useState(0);
  useEffect(() => {
    if (tips.length <= 1) return;
    const id = window.setInterval(() => setTipIdx((i) => (i + 1) % tips.length), 2800);
    return () => window.clearInterval(id);
  }, [tips.length]);

  return (
    <div className="space-y-3 animate-fade-in">
      {/* 顶部状态条：让用户知道系统在动 */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse-glow shrink-0" />
        <span className="flex-1 truncate">
          {loadingText || '小精灵正在翻它的中古笔记本…'}
        </span>
        <span className="tabular-nums opacity-70">{(elapsedMs / 1000).toFixed(1)}s</span>
      </div>

      {/* 轮播趣味提示卡（拿当前识别字段填模板，不调 AI） */}
      {tips.length > 0 && (
        <Card className="p-3.5 border-primary/25 bg-gradient-to-br from-primary/10 via-accent/15 to-background overflow-hidden">
          <div className="flex items-start gap-2.5">
            <span className="shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">
                等的时候，先了解一下
              </div>
              <p key={tipIdx} className="text-sm leading-relaxed text-foreground/90 animate-fade-in">
                {tips[tipIdx]}
              </p>
              {tips.length > 1 && (
                <div className="mt-2 flex gap-1">
                  {tips.map((_, i) => (
                    <span
                      key={i}
                      className={`h-0.5 rounded-full transition-all ${
                        i === tipIdx ? 'w-6 bg-primary' : 'w-2 bg-primary/20'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* 骨架：占住"一句话 / 速记卡 / 客户话术 / 易混对比"四块 */}
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-background p-4 space-y-2">
        <SkeletonLine w="40%" h="10px" />
        <SkeletonLine w="85%" h="18px" />
        <SkeletonLine w="60%" h="18px" />
      </div>

      <div>
        <SkeletonLine w="20%" h="12px" className="mb-2" />
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-muted/20 p-2.5 space-y-1.5">
              <SkeletonLine w="50%" h="9px" />
              <SkeletonLine w="80%" h="14px" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <SkeletonLine w="20%" h="12px" className="mb-2" />
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Card key={i} className="p-3 flex items-center gap-2">
              <SkeletonLine w="44px" h="18px" className="shrink-0 rounded-full" />
              <SkeletonLine w="70%" h="14px" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function SkeletonLine({
  w,
  h,
  className = '',
}: {
  w: string;
  h: string;
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded bg-muted/60 ${className}`}
      style={{ width: w, height: h }}
    />
  );
}

function buildEnrichingTips(hints?: Hints): string[] {
  const out: string[] = [];
  const name = hints?.name?.trim();
  const era = hints?.era?.trim();
  const origin = hints?.origin?.trim();
  const ip = hints?.ip?.trim();

  if (era && origin) out.push(`${era} 的 ${origin} 同类件，越来越多被收进中古杂货店——稀缺度也跟着上来了。`);
  if (era) out.push(`${era}：那个年代的工艺细节，等会儿"速记卡"会一条条列给您。`);
  if (origin) out.push(`产地 ${origin}：客人最常问"哪里出的、怎么辨真假"，AI 正在替您整理标准答案。`);
  if (ip) out.push(`${ip} 系列同年代周边，老客最容易心动；待会儿话术里会给您一条直接念出来的。`);
  if (name) out.push(`正在为「${name}」生成一句话推介 + 顾客常问应答，您一会儿就能直接照着讲。`);

  // 通用兜底
  out.push('小贴士：拍底款、铭牌、包装侧面，识别更准——下次试试"多角度"。');
  out.push('知识卡只在第一次生成时慢一点，下次同款命中缓存会秒出。');
  out.push('如果识别错了，下面的「有疑问？」直接告诉 AI，几句话就能纠正过来。');

  // 去重、限制 6 条
  return Array.from(new Set(out)).slice(0, 6);
}

