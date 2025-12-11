import { useRealtimeSession } from '@/hooks/useRealtimeSession';
import { ScriptDisplay } from '@/components/recognition/ScriptDisplay';
import { PriceDisplay } from '@/components/recognition/PriceDisplay';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Radio, Image } from 'lucide-react';
import { RecognitionResult } from '@/types';

export function ViewerPanel() {
  const { currentProduct, loading } = useRealtimeSession();

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">正在连接...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!currentProduct) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <Radio className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>等待操作员识别商品...</p>
            <p className="text-sm mt-2">商品识别后将实时同步到此页面</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 转换为 RecognitionResult 格式
  const scriptsData = currentProduct.scripts as Record<string, string> | null;
  const result: RecognitionResult = {
    name: currentProduct.name,
    category: currentProduct.category,
    era: currentProduct.era || undefined,
    material: currentProduct.material || undefined,
    craft: currentProduct.craft || undefined,
    dimensions: currentProduct.dimensions || undefined,
    condition: currentProduct.condition || undefined,
    description: currentProduct.description || undefined,
    scripts: {
      professional: scriptsData?.professional || '',
      sales: scriptsData?.sales || '',
      cultural: scriptsData?.cultural || '',
    },
    suggestedPriceRange: (currentProduct.ai_analysis as any)?.suggestedPriceRange,
    confidence: (currentProduct.ai_analysis as any)?.confidence,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="default" className="animate-pulse">
          <Radio className="w-3 h-3 mr-1" />
          实时同步
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 左侧：商品图片 */}
        <Card>
          <CardContent className="p-0">
            {currentProduct.image_url ? (
              <div className="aspect-[4/3] overflow-hidden rounded-lg">
                <img
                  src={currentProduct.image_url}
                  alt={currentProduct.name}
                  className="w-full h-full object-contain bg-muted"
                />
              </div>
            ) : (
              <div className="aspect-[4/3] flex items-center justify-center bg-muted rounded-lg">
                <Image className="w-12 h-12 text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 右侧：识别结果 */}
        <div className="space-y-4">
          <ScriptDisplay result={result} />
          <PriceDisplay result={result} productId={currentProduct.id} />
        </div>
      </div>
    </div>
  );
}
