import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export function ProductDetailCard({ result }: ProductDetailCardProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { isSpeaking, speak, stop } = useSpeech();

  const fullText = [
    result.description,
    result.sellingPoints?.length ? '卖点：\n' + result.sellingPoints.map(p => `· ${p}`).join('\n') : '',
    result.tips ? '小贴士：' + result.tips : '',
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

  return (
    <div className="space-y-4">
      {/* 商品标题 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{result.name}</CardTitle>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge>{CATEGORY_LABELS[result.category]}</Badge>
            {result.era && <Badge variant="outline">{result.era}</Badge>}
            {result.origin && <Badge variant="outline">{result.origin}</Badge>}
            {result.confidence && (
              <Badge variant="secondary">置信度 {Math.round(result.confidence * 100)}%</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm pt-0">
          {result.material && (
            <div><span className="text-muted-foreground">材质：</span>{result.material}</div>
          )}
          {result.craft && (
            <div><span className="text-muted-foreground">工艺：</span>{result.craft}</div>
          )}
          {result.dimensions && (
            <div><span className="text-muted-foreground">尺寸：</span>{result.dimensions}</div>
          )}
          {result.condition && (
            <div><span className="text-muted-foreground">品相：</span>{result.condition}</div>
          )}
        </CardContent>
      </Card>

      {/* 核心卖点 - 最显眼 */}
      {result.sellingPoints && result.sellingPoints.length > 0 && (
        <Card className="border-2 border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-primary text-lg">
              <Sparkles className="w-5 h-5" />
              核心卖点
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.sellingPoints.map((point, i) => (
                <li key={i} className="flex gap-2 leading-relaxed">
                  <span className="font-semibold text-primary shrink-0">{i + 1}.</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 详细介绍 */}
      {result.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="w-4 h-4" />
              商品介绍
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="leading-relaxed whitespace-pre-wrap">{result.description}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyAll}>
                {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied ? '已复制' : '复制全文'}
              </Button>
              <Button
                size="sm"
                variant={isSpeaking ? 'secondary' : 'outline'}
                onClick={() => (isSpeaking ? stop() : speak(fullText))}
              >
                {isSpeaking ? (
                  <><VolumeX className="w-4 h-4 mr-1" />停止</>
                ) : (
                  <><Volume2 className="w-4 h-4 mr-1" />朗读</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 店员小贴士 */}
      {result.tips && (
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
              <Lightbulb className="w-4 h-4" />
              店员小贴士
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{result.tips}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
