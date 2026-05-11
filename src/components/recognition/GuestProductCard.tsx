import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, BookOpen, Eye, ShieldAlert } from 'lucide-react';
import { CATEGORY_LABELS } from '@/types';
import { normalizeSellingPoints } from '@/lib/script';
import type { GuestRecognitionResult } from '@/hooks/useGuestRecognition';

const SP_TAG_COLOR: Record<string, string> = {
  身世: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  工艺: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  趣味: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  稀缺: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
};

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/80">{label}</span>
    <span className="text-sm font-medium">{value}</span>
  </div>
);

interface Props {
  result: GuestRecognitionResult;
  imageUrl?: string | null;
}

/** 顾客视角的识别结果卡：故事 / 鉴赏 / 保养小贴士，去掉店员话术与价格。 */
export function GuestProductCard({ result, imageUrl }: Props) {
  const sp = normalizeSellingPoints(result.sellingPoints as any);

  return (
    <div className="space-y-4">
      {imageUrl && (
        <div className="rounded-xl overflow-hidden border border-border/60 bg-muted">
          <img src={imageUrl} alt={result.name} className="w-full h-auto block" />
        </div>
      )}

      <Card className="overflow-hidden border-border/60 shadow-soft">
        <div className="h-1 bg-gradient-accent" />
        <CardContent className="pt-5 pb-4 space-y-3">
          <h2 className="font-display text-2xl sm:text-[26px] leading-tight tracking-tight">
            {result.name}
          </h2>
          {result.era && (
            <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-accent/25 via-accent/10 to-transparent border border-accent/40 px-3.5 py-2.5">
              <span className="text-[10px] uppercase tracking-[0.2em] text-accent font-semibold shrink-0">年代</span>
              <span className="font-display text-lg leading-none font-semibold text-foreground truncate">{result.era}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Badge className="rounded-full bg-primary text-primary-foreground">
              {CATEGORY_LABELS[result.category]}
            </Badge>
            {result.origin && (
              <Badge variant="outline" className="rounded-full">{result.origin}</Badge>
            )}
            {typeof result.confidence === 'number' && result.confidence < 0.6 && (
              <Badge variant="outline" className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
                AI 不太确定，仅供参考
              </Badge>
            )}
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

      {/* 物件故事 */}
      {result.story && (
        <Card className="border-border/60 shadow-soft">
          <CardContent className="pt-4 pb-4 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" /> 它的故事
            </h3>
            <p className="text-[14px] leading-relaxed text-foreground/85 whitespace-pre-wrap">
              {result.story}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 看点 */}
      {sp.length > 0 && (
        <Card className="border-border/60 shadow-soft">
          <CardContent className="pt-4 pb-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> 看点
            </h3>
            <ul className="space-y-2.5">
              {sp.map((s, i) => {
                const tag = typeof s === 'string' ? '' : (s.tag || '');
                const text = typeof s === 'string' ? s : s.text;
                return (
                  <li key={i} className="flex gap-2.5 items-start">
                    {tag && (
                      <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${SP_TAG_COLOR[tag] || 'bg-muted text-muted-foreground border-border'}`}>
                        {tag}
                      </span>
                    )}
                    <p className="flex-1 text-[14px] leading-relaxed text-foreground/85">{text}</p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 怎么欣赏 */}
      {result.appreciation && (
        <Card className="border-border/60 shadow-soft">
          <CardContent className="pt-4 pb-4 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" /> 怎么欣赏
            </h3>
            <p className="text-[14px] leading-relaxed text-foreground/85 whitespace-pre-wrap">
              {result.appreciation}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 保养与使用 */}
      {result.careTips && (
        <Card className="border-amber-300/50 dark:border-amber-700/40 bg-gradient-to-br from-amber-50 to-amber-100/40 dark:from-amber-950/30 dark:to-amber-900/10 shadow-soft">
          <CardContent className="pt-4 pb-4 space-y-2">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> 保养与使用
            </h3>
            <p className="text-[14px] leading-relaxed text-amber-900/95 dark:text-amber-100/95 whitespace-pre-wrap">
              {result.careTips}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 完整介绍 */}
      {result.description && (
        <Card className="border-border/60 shadow-soft">
          <CardContent className="pt-4 pb-3 space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              完整介绍
            </h3>
            <p className="leading-relaxed whitespace-pre-wrap text-[14px] text-foreground/85">
              {result.description}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
