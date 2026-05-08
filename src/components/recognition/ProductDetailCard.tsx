import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Lightbulb, Info, History, Coins, Share2 } from 'lucide-react';
import { RecognitionResult, CATEGORY_LABELS } from '@/types';
import {
  normalizeSellingPoints,
  normalizePitch,
  normalizeTips,
  SELLING_TAG_STYLE,
} from '@/lib/script';
import { ShareMenu } from '@/components/share/ShareMenu';
import { KnowledgeCardSections } from '@/components/knowledge/KnowledgeCardSections';
import { pickKnowledgeCard } from '@/lib/knowledgeCard';

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

export function ProductDetailCard({ result, imageUrl, shareLink }: ProductDetailCardProps) {
  const [showLong, setShowLong] = useState(false);

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
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-2xl sm:text-[26px] leading-tight tracking-tight flex-1">
                {result.name}
              </h2>
              <ShareMenu
                data={{
                  kind: 'recognition',
                  name: result.name,
                  category: CATEGORY_LABELS[result.category],
                  era: result.era,
                  origin: result.origin,
                  coverUrl: imageUrl || null,
                  pitch: enriched?.one_liner || pitch?.highlight || description || null,
                  summary: description,
                  points: sellingPoints.map((p) => p.text).filter(Boolean),
                  tips: [tips?.memory, tips?.objection].filter(Boolean).join(' / ') || null,
                  recentPrice: priceText,
                  link: shareLink || null,
                }}
                trigger={
                  <button
                    className="shrink-0 w-9 h-9 rounded-full bg-muted hover:bg-accent flex items-center justify-center"
                    aria-label="分享"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                }
              />
            </div>
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


      {/* 富知识卡：金句 / 速记卡 / 客户话术 / 易混对比 — 与官方知识卡一致 */}
      <KnowledgeCardSections
        card={pickKnowledgeCard(enriched)}
        loading={!!result.isEnriching}
        loadingText="正在为本次识别生成知识卡…"
      />

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
