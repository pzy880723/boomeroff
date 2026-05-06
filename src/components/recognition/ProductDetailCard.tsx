import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Volume2, VolumeX, Sparkles, Lightbulb, Info, Quote, History, Coins, Share2 } from 'lucide-react';
import { RecognitionResult, CATEGORY_LABELS } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useSpeech } from '@/hooks/useSpeech';
import {
  normalizeSellingPoints,
  normalizePitch,
  normalizeTips,
  buildSpeakText,
  SELLING_TAG_STYLE,
} from '@/lib/script';
import { ShareMenu } from '@/components/share/ShareMenu';

interface ProductDetailCardProps {
  result: Pick<
    RecognitionResult,
    | 'name'
    | 'category'
    | 'era'
    | 'origin'
    | 'material'
    | 'craft'
    | 'dimensions'
    | 'condition'
    | 'description'
    | 'sellingPoints'
    | 'pitch'
    | 'tips'
    | 'confidence'
    | 'fromCache'
    | 'cacheSource'
    | 'cachedAt'
    | 'recentPrice'
    | '__pipeline'
    | 'enriched'
    | 'isEnriching'
  >;
  imageUrl?: string | null;
  shareLink?: string | null;
}

// 把 pipeline 元数据翻译成一个店员看得懂的小徽章
function pipelineBadge(p?: RecognitionResult['__pipeline']) {
  if (!p) return null;
  switch (p.source) {
    case 'hash_cache':
      return { text: '📦 命中缓存 · 未调用 AI', cls: 'bg-muted text-muted-foreground border-border' };
    case 'name_cache':
      return { text: '📚 名称匹配缓存 · 未跑主识别', cls: 'bg-muted text-muted-foreground border-border' };
    case 'lovable_gemini':
      return p.webSearchUsed
        ? { text: `🌐 ${p.model || 'Gemini'} · 已联网核实`, cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' }
        : { text: `✨ ${p.model || 'Gemini'}`, cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30' };
    default:
      return null;
  }
}

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/80">{label}</span>
    <span className="text-sm font-medium">{value}</span>
  </div>
);

export function ProductDetailCard({ result }: ProductDetailCardProps) {
  const [copied, setCopied] = useState(false);
  const [showLong, setShowLong] = useState(false);
  const { toast } = useToast();
  const { isSpeaking, speak, stop } = useSpeech();

  const enriched = result.enriched;
  const sellingPoints = normalizeSellingPoints(
    enriched?.sellingPoints && enriched.sellingPoints.length >= 3
      ? enriched.sellingPoints
      : result.sellingPoints,
  );
  const basePitch = normalizePitch(result.pitch, result.description);
  const pitch = basePitch
    ? {
        ...basePitch,
        highlight: enriched?.highlight || basePitch.highlight,
        story: enriched?.story || basePitch.story,
      }
    : (enriched?.story || enriched?.highlight)
      ? { opener: '', highlight: enriched.highlight || '', story: enriched.story }
      : null;
  const baseTips = normalizeTips(result.tips);
  const tips = (enriched?.objection || enriched?.memory)
    ? {
        memory: enriched?.memory || baseTips?.memory,
        objection: enriched?.objection || baseTips?.objection,
      }
    : baseTips;
  const description = enriched?.description || result.description;

  const speakText = buildSpeakText({ pitch, sellingPoints, description });

  const fullText = [
    pitch?.opener,
    pitch?.highlight,
    pitch?.story,
    sellingPoints.length ? '核心卖点：\n' + sellingPoints.map(p => `· [${p.tag}] ${p.text}`).join('\n') : '',
    description && description !== pitch?.opener ? '完整介绍：\n' + description : '',
    tips?.memory ? '记忆口诀：' + tips.memory : '',
    tips?.objection ? '顾客常问：' + tips.objection : '',
  ].filter(Boolean).join('\n\n');

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      toast({ title: '已复制到剪贴板' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: '复制失败', variant: 'destructive' });
    }
  };

  const cacheLabel = result.cacheSource === 'official'
    ? '匹配到官方知识库'
    : result.cacheSource === 'history'
      ? '门店此前识别过同款'
      : result.cacheSource === 'hash'
        ? '同一张照片此前识别过'
        : null;
  const cachedDate = result.cachedAt
    ? new Date(result.cachedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : null;
  const priceText = result.recentPrice
    ? `¥${result.recentPrice.price.toLocaleString('zh-CN')}`
    : null;
  const priceDate = result.recentPrice?.recorded_at
    ? new Date(result.recentPrice.recorded_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
    : null;

  return (
    <div className="space-y-4">
      {/* 路径徽章：让店员一眼看到本次到底走了缓存还是真 AI、有没有联网 */}
      {(() => {
        const badge = pipelineBadge(result.__pipeline);
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {badge && (
              <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${badge.cls}`}>
                <span>{badge.text}</span>
                {typeof result.__pipeline?.aiTimeMs === 'number' && (
                  <span className="opacity-70">· {(result.__pipeline.aiTimeMs / 1000).toFixed(1)}s</span>
                )}
              </div>
            )}
            {result.isEnriching && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                深度故事补充中…
              </div>
            )}
            {!result.isEnriching && enriched?.story && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                ✨ 已补充深度故事{enriched.webSearchUsed ? ' · 含联网核实' : ''}
              </div>
            )}
          </div>
        );
      })()}

      {/* 命中缓存横幅 */}
      {result.fromCache && cacheLabel && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/8 px-3.5 py-2.5 text-sm">
          <History className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="text-foreground font-medium">{cacheLabel}</span>
            {cachedDate && <span className="text-muted-foreground ml-1.5 text-xs">· 入库于 {cachedDate}</span>}
          </div>
        </div>
      )}

      {/* 商品标题 */}
      <Card className="overflow-hidden border-border/60 shadow-soft">
        <div className="h-1 bg-gradient-accent" />
        <CardContent className="pt-5 pb-4 space-y-3">
          <div className="space-y-2">
            <h2 className="font-display text-2xl sm:text-[26px] leading-tight tracking-tight">
              {result.name}
            </h2>
            {result.era && (
              <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-accent/25 via-accent/10 to-transparent border border-accent/40 px-3.5 py-2.5 shadow-soft">
                <span className="text-[10px] uppercase tracking-[0.2em] text-accent font-semibold shrink-0">年代</span>
                <span className="font-display text-lg leading-none font-semibold text-foreground truncate">{result.era}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Badge className="rounded-full bg-primary text-primary-foreground">
                {CATEGORY_LABELS[result.category]}
              </Badge>
              {result.origin && (
                <Badge variant="outline" className="rounded-full">
                  {result.origin}
                </Badge>
              )}
              {typeof result.confidence === 'number' && (
                <Badge
                  className={`rounded-full ${
                    result.confidence >= 0.8
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      : result.confidence >= 0.6
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                        : 'bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30'
                  }`}
                  variant="outline"
                >
                  {result.confidence >= 0.8
                    ? `高置信 ${Math.round(result.confidence * 100)}%`
                    : result.confidence >= 0.6
                      ? `中等 ${Math.round(result.confidence * 100)}% · 可参考`
                      : `低 ${Math.round(result.confidence * 100)}% · 建议补拍`}
                </Badge>
              )}
              {priceText && (
                <Badge
                  variant="outline"
                  className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1"
                >
                  <Coins className="w-3 h-3" />
                  最近成交 {priceText}{priceDate ? ` · ${priceDate}` : ''}
                </Badge>
              )}
            </div>
          </div>

          {(result.material || result.craft || result.dimensions || result.condition) && (
            <>
              <div className="divider-accent" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1">
                {result.material && <Meta label="材质" value={result.material} />}
                {result.craft && <Meta label="工艺" value={result.craft} />}
                {result.dimensions && <Meta label="尺寸" value={result.dimensions} />}
                {result.condition && <Meta label="品相" value={result.condition} />}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 一句话开场 + 亮点 —— 直接念给客户 */}
      {pitch && (pitch.opener || pitch.highlight) && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/8 via-background to-accent/8 shadow-soft overflow-hidden">
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Quote className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="font-display text-lg leading-none">张口就讲</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">含完整故事段 · 念给客户 15-20 秒</p>
              </div>
            </div>
            <div className="space-y-2.5">
              {pitch.opener && (
                <p className="text-[17px] leading-relaxed font-medium text-foreground">
                  「{pitch.opener}」
                </p>
              )}
              {pitch.highlight && (
                <p className="text-[15px] leading-relaxed text-foreground/85">
                  「{pitch.highlight}」
                </p>
              )}
              {pitch.story && (
                <div className="mt-1 rounded-lg bg-background/60 border border-border/50 px-3.5 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1.5">故事段 · 直接念</div>
                  <p className="text-[14.5px] leading-[1.7] text-foreground/90 whitespace-pre-wrap">
                    {pitch.story}
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={copyAll} className="rounded-full">
                {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
                {copied ? '已复制' : '复制全文'}
              </Button>
              <Button
                size="sm"
                variant={isSpeaking ? 'secondary' : 'outline'}
                onClick={() => (isSpeaking ? stop() : speak(speakText))}
                className="rounded-full"
              >
                {isSpeaking ? (
                  <>
                    <VolumeX className="w-4 h-4 mr-1.5" />
                    停止
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4 mr-1.5" />
                    朗读
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 核心卖点 - 带分类标签 */}
      {sellingPoints.length > 0 && (
        <Card className="border-accent/30 bg-accent-soft/40 shadow-soft overflow-hidden">
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-accent flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-accent-foreground" />
              </div>
              <div>
                <h3 className="font-display text-lg leading-none">核心卖点</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">分类速记 · 一眼抓重点</p>
              </div>
            </div>
            <ul className="space-y-2.5">
              {sellingPoints.map((point, i) => (
                <li key={i} className="flex gap-2.5 items-start leading-relaxed">
                  <span
                    className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${SELLING_TAG_STYLE[point.tag]}`}
                  >
                    {point.tag}
                  </span>
                  <span className="flex-1 text-[15px]">{point.text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 完整介绍（折叠） */}
      {description && description.trim() && description !== pitch?.opener && (
        <Card className="border-border/60 shadow-soft">
          <CardContent className="pt-4 pb-3">
            <button
              type="button"
              onClick={() => setShowLong(v => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                <Info className="w-4 h-4" />
                完整介绍
              </span>
              <span className="text-[11px] text-muted-foreground">{showLong ? '收起' : '展开'}</span>
            </button>
            {showLong && (
              <p className="leading-relaxed whitespace-pre-wrap text-[14px] text-foreground/85 mt-3">
                {description}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 店员小贴士 - 记忆口诀 + 顾客常问 */}
      {tips && (tips.memory || tips.objection) && (
        <Card className="border-amber-300/50 dark:border-amber-700/40 bg-gradient-to-br from-amber-50 to-amber-100/40 dark:from-amber-950/30 dark:to-amber-900/10 shadow-soft">
          <CardContent className="pt-4 pb-4 space-y-3">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              店员小抄
            </h3>
            {tips.memory && (
              <div className="flex gap-2.5 items-start">
                <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-amber-200/60 text-amber-900 border-amber-300/70 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700/40">
                  记忆口诀
                </span>
                <p className="flex-1 text-[14px] leading-relaxed text-amber-900/95 dark:text-amber-100/95">
                  {tips.memory}
                </p>
              </div>
            )}
            {tips.objection && (
              <div className="flex gap-2.5 items-start">
                <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-rose-200/60 text-rose-900 border-rose-300/70 dark:bg-rose-900/40 dark:text-rose-100 dark:border-rose-700/40">
                  顾客常问
                </span>
                <p className="flex-1 text-[14px] leading-relaxed text-amber-900/95 dark:text-amber-100/95">
                  {tips.objection}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
