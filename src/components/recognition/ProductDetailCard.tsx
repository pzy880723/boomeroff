import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Volume2, VolumeX, Sparkles, Lightbulb, Info } from 'lucide-react';
import { RecognitionResult, CATEGORY_LABELS } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useSpeech } from '@/hooks/useSpeech';

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
    | 'tips'
    | 'confidence'
  >;
}

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/80">{label}</span>
    <span className="text-sm font-medium">{value}</span>
  </div>
);

export function ProductDetailCard({ result }: ProductDetailCardProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { isSpeaking, speak, stop } = useSpeech();

  const fullText = [
    result.description,
    result.sellingPoints?.length ? '卖点：\n' + result.sellingPoints.map((p) => `· ${p}`).join('\n') : '',
    result.tips ? '小贴士：' + result.tips : '',
  ]
    .filter(Boolean)
    .join('\n\n');

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

  return (
    <div className="space-y-4">
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
              {result.confidence && (
                <Badge variant="secondary" className="rounded-full">
                  置信度 {Math.round(result.confidence * 100)}%
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

      {/* 核心卖点 - 最显眼 */}
      {result.sellingPoints && result.sellingPoints.length > 0 && (
        <Card className="border-accent/30 bg-accent-soft/40 shadow-soft overflow-hidden">
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-accent flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-accent-foreground" />
              </div>
              <div>
                <h3 className="font-display text-lg leading-none">核心卖点</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">话术参考 · 直接对客户讲</p>
              </div>
            </div>
            <ul className="space-y-2.5 pl-1">
              {result.sellingPoints.map((point, i) => (
                <li key={i} className="flex gap-3 leading-relaxed text-[15px]">
                  <span className="font-display font-bold text-accent shrink-0 w-6 text-right tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="flex-1">{point}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 详细介绍 */}
      {result.description && (
        <Card className="border-border/60 shadow-soft">
          <CardContent className="pt-5 pb-4 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">商品介绍</h3>
            </div>
            <p className="leading-relaxed whitespace-pre-wrap text-[15px] text-foreground/90">
              {result.description}
            </p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={copyAll} className="rounded-full">
                {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
                {copied ? '已复制' : '复制全文'}
              </Button>
              <Button
                size="sm"
                variant={isSpeaking ? 'secondary' : 'outline'}
                onClick={() => (isSpeaking ? stop() : speak(fullText))}
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

      {/* 店员小贴士 */}
      {result.tips && (
        <Card className="border-amber-300/50 dark:border-amber-700/40 bg-gradient-to-br from-amber-50 to-amber-100/40 dark:from-amber-950/30 dark:to-amber-900/10 shadow-soft">
          <CardContent className="pt-4 pb-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0">
                <Lightbulb className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">店员小贴士</h3>
                <p className="text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">{result.tips}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
