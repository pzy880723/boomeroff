import { Sparkles, BookOpen, Eye, ShieldAlert, FileText } from 'lucide-react';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { normalizeSellingPoints } from '@/lib/script';
import type { GuestRecognitionResult } from '@/hooks/useGuestRecognition';

const SP_TAG_DOT: Record<string, string> = {
  身世: 'bg-violet-500',
  工艺: 'bg-emerald-500',
  趣味: 'bg-amber-500',
  稀缺: 'bg-rose-500',
};

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

  return (
    <article className="space-y-6">
      {/* Hero 大图 + 浮层标签 */}
      <header className="space-y-4">
        {imageUrl && (
          <div className="relative rounded-3xl overflow-hidden ring-1 ring-border/50 shadow-elevated bg-muted">
            <img src={imageUrl} alt={result.name} className="w-full h-auto block" />
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/55 via-black/15 to-transparent pointer-events-none" />
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
            {result.era && (
              <div className="absolute left-4 right-4 bottom-3 text-white">
                <div className="text-[10px] tracking-[0.22em] uppercase opacity-80">Era</div>
                <div className="font-display text-[16px] tracking-tight leading-tight">
                  {result.era}
                  {result.origin && <span className="opacity-80"> · {result.origin}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 标题 */}
        <div className="px-1 space-y-2">
          <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">
            Discovery · {CATEGORY_LABELS[result.category]}
          </div>
          <h1 className="font-display text-[26px] sm:text-[30px] leading-[1.15] tracking-tight">
            {result.name}
          </h1>
          {!imageUrl && (result.era || result.origin) && (
            <div className="text-[12.5px] text-muted-foreground tracking-wide">
              {[result.era, result.origin].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>

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
      {result.careTips && (
        <section className="rounded-2xl bg-accent/8 ring-1 ring-accent/25 p-5 space-y-2.5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-accent" />
            <div className="text-[10px] tracking-[0.22em] uppercase text-accent/90">Care Tips</div>
          </div>
          <h3 className="font-display text-[16px] tracking-tight">保养与使用</h3>
          <p className="text-[13.5px] leading-relaxed text-foreground/85 whitespace-pre-wrap">
            {result.careTips}
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
