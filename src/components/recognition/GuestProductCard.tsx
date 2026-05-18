import { Sparkles, BookOpen, Eye, ShieldAlert, FileText, Star, Gem, Quote } from 'lucide-react';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { normalizeSellingPoints } from '@/lib/script';
import type { GuestRecognitionResult } from '@/hooks/useGuestRecognition';

const SP_TAG_DOT: Record<string, string> = {
  身世: 'bg-violet-500',
  工艺: 'bg-emerald-500',
  趣味: 'bg-amber-500',
  稀缺: 'bg-rose-500',
};

const JP_CATS: ReadonlySet<ProductCategory> = new Set([
  'jp_porcelain','incense','anime_toy','otaku_goods','walkman','ccd','media_record','playback_device','game_console',
]);

/** 通用化的「编辑式杂志卡」数据结构 —— 既能渲染识别结果，也能渲染中古圈帖子。 */
export interface EditorialCardData {
  name: string;
  category: ProductCategory;
  era?: string | null;
  origin?: string | null;
  material?: string | null;
  craft?: string | null;
  dimensions?: string | null;
  condition?: string | null;
  sellingPoints?: unknown;
  story?: string | null;
  appreciation?: string | null;
  description?: string | null;
  careTips?: string | null;
  tips?: string | null;
  confidence?: number | null;
  rarity?: number | null;
  collectionValue?: string | null;
  marketValue?: string | null;
  buyReason?: string | null;
}

interface Props {
  result: GuestRecognitionResult | EditorialCardData;
  imageUrl?: string | null;
}

function SectionLabel({ children, en }: { children: React.ReactNode; en: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">{en}</div>
      <h3 className="font-display text-[17px] tracking-tight">{children}</h3>
    </div>
  );
}

function Block({
  icon: Icon, en, title, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  en: string; title: string; children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="w-7 h-7 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5" />
        </span>
        <SectionLabel en={en}>{title}</SectionLabel>
      </div>
      <div className="pl-[38px]">{children}</div>
    </section>
  );
}

function ValuationHero({
  rarity, buyReason, era, origin,
}: {
  rarity: number | null;
  buyReason: string | null;
  era: string | null;
  origin: string | null;
}) {
  const hasAny = (rarity != null) || buyReason || era || origin;
  if (!hasAny) return null;

  // 默认 4 星起步
  const raw = typeof rarity === 'number' && rarity > 0 ? Math.round(rarity) : 4;
  const stars = Math.min(5, Math.max(4, raw));

  return (
    <section className="relative mx-1 rounded-3xl overflow-hidden bg-gradient-to-br from-accent/12 via-background to-primary/8 ring-1 ring-accent/30 shadow-elevated">
      <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-accent/15 blur-3xl pointer-events-none" />
      <div className="absolute -left-10 -bottom-10 w-36 h-36 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="relative p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2 text-accent">
          <Gem className="w-3.5 h-3.5" />
          <div className="text-[10px] tracking-[0.24em] uppercase font-medium">Valuation · 估值速览</div>
        </div>

        <div className="space-y-1">
          <div className="text-[10.5px] tracking-[0.2em] uppercase text-muted-foreground/85">稀缺度</div>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`w-4 h-4 ${i < stars ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30'}`}
              />
            ))}
          </div>
        </div>

        {(era || origin) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {era && (
              <span className="px-2.5 py-1 rounded-full bg-background/80 ring-1 ring-border/60 text-[11.5px] tracking-wide">
                <span className="text-muted-foreground/80 mr-1">年代</span>{era}
              </span>
            )}
            {origin && (
              <span className="px-2.5 py-1 rounded-full bg-background/80 ring-1 ring-border/60 text-[11.5px] tracking-wide">
                <span className="text-muted-foreground/80 mr-1">产地</span>{origin}
              </span>
            )}
          </div>
        )}

        {buyReason && (
          <div className="relative pl-4 border-l-2 border-accent">
            <Quote className="absolute -left-[7px] top-0 w-3 h-3 text-accent fill-accent" />
            <p className="font-display text-[15px] leading-[1.6] text-foreground/90 italic">
              {buyReason}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/** 顾客视角的识别结果卡：编辑式杂志版式。 */
export function GuestProductCard({ result, imageUrl }: Props) {
  const sp = normalizeSellingPoints(result.sellingPoints as any);
  const meta = [
    result.material && { label: '材质', value: result.material },
    result.craft && { label: '工艺', value: result.craft },
    result.dimensions && { label: '尺寸', value: result.dimensions },
    result.condition && { label: '品相', value: result.condition },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const lowConfidence = typeof result.confidence === 'number' && result.confidence < 0.6;
  const careTipsText: string | null =
    (typeof result.careTips === 'string' && result.careTips) ||
    (typeof result.tips === 'string' && result.tips) ||
    null;

  // 日本相关品类：origin 缺失时兜底为「日本」
  const displayOrigin = result.origin || (JP_CATS.has(result.category) ? '日本' : null);

  return (
    <article className="space-y-6">
      <header className="space-y-4">
        {/* Hero 大图：保留品类 / 低置信度浮层，移除底部信息蒙层 */}
        {imageUrl && (
          <div className="relative rounded-3xl overflow-hidden ring-1 ring-border/50 shadow-elevated bg-muted">
            <img src={imageUrl} alt={result.name} className="w-full h-auto block" />
            <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
              <span className="px-2.5 py-1 rounded-full bg-background/85 backdrop-blur text-[10.5px] font-medium ring-1 ring-border/60">
                {CATEGORY_LABELS[result.category]}
              </span>
              {lowConfidence && (
                <span className="px-2.5 py-1 rounded-full bg-amber-500/90 backdrop-blur text-white text-[10.5px] font-medium">
                  AI 不太确定
                </span>
              )}
            </div>
          </div>
        )}

        {/* 标题：图片下方 */}
        <div className="px-1 space-y-2">
          <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">
            Discovery · {CATEGORY_LABELS[result.category]}
          </div>
          <h1 className="font-display text-[26px] sm:text-[30px] leading-[1.15] tracking-tight">
            {result.name}
          </h1>
        </div>

        {/* 估值速览卡 */}
        <ValuationHero
          rarity={typeof result.rarity === 'number' ? result.rarity : null}
          marketValue={result.marketValue ?? null}
          buyReason={result.buyReason ?? null}
          era={result.era ?? null}
          origin={displayOrigin}
        />

        {/* Meta 编辑式表格 */}
        {meta.length > 0 && (
          <div className="px-1">
            <div className="border-t border-border/60" />
            <dl className="grid grid-cols-2 gap-x-5 gap-y-3 py-4">
              {meta.map((m) => (
                <div key={m.label} className="space-y-0.5">
                  <dt className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground/80">
                    {m.label}
                  </dt>
                  <dd className="text-[13.5px] font-medium leading-snug">{m.value}</dd>
                </div>
              ))}
            </dl>
            <div className="border-b border-border/60" />
          </div>
        )}
      </header>

      {/* 它的故事 */}
      {result.story && (
        <Block icon={BookOpen} en="The Story" title="它的故事">
          <p className="text-[14px] leading-[1.85] text-foreground/85 whitespace-pre-wrap first-letter:font-display first-letter:text-[28px] first-letter:mr-1 first-letter:float-left first-letter:leading-[0.95] first-letter:text-accent">
            {result.story}
          </p>
        </Block>
      )}

      {/* 看点 */}
      {sp.length > 0 && (
        <Block icon={Sparkles} en="Highlights" title="值得留意的细节">
          <ul className="space-y-3.5">
            {sp.map((s, i) => {
              const tag = typeof s === 'string' ? '' : (s.tag || '');
              const text = typeof s === 'string' ? s : s.text;
              return (
                <li key={i} className="flex gap-3">
                  <span className="font-display text-[13px] text-accent tabular-nums shrink-0 mt-0.5 w-6">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 space-y-1">
                    {tag && (
                      <div className="flex items-center gap-1.5 text-[10.5px] tracking-[0.18em] uppercase text-muted-foreground/85">
                        <span className={`w-1.5 h-1.5 rounded-full ${SP_TAG_DOT[tag] || 'bg-muted-foreground'}`} />
                        {tag}
                      </div>
                    )}
                    <p className="text-[14px] leading-relaxed text-foreground/85">{text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      {/* 怎么欣赏 */}
      {result.appreciation && (
        <Block icon={Eye} en="Appreciation" title="怎么欣赏它">
          <p className="text-[14px] leading-[1.85] text-foreground/85 whitespace-pre-wrap">
            {result.appreciation}
          </p>
        </Block>
      )}

      {/* 完整介绍 */}
      {result.description && (
        <Block icon={FileText} en="Full Notes" title="完整介绍">
          <p className="text-[14px] leading-[1.85] text-foreground/85 whitespace-pre-wrap">
            {result.description}
          </p>
        </Block>
      )}

      {/* 保养与使用 — 高亮卡 */}
      {careTipsText && (
        <section className="rounded-2xl bg-accent/8 ring-1 ring-accent/25 p-5 space-y-2.5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-accent" />
            <div className="text-[10px] tracking-[0.22em] uppercase text-accent/90">Care Tips</div>
          </div>
          <h3 className="font-display text-[16px] tracking-tight">保养与使用</h3>
          <p className="text-[13.5px] leading-relaxed text-foreground/85 whitespace-pre-wrap">
            {careTipsText}
          </p>
        </section>
      )}

      {/* 免责小字 */}
      <p className="text-center text-[10.5px] text-muted-foreground/70 tracking-wide pt-1">
        以上内容由 AI 生成，仅供欣赏与了解参考
      </p>
    </article>
  );
}
