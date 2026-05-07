import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RecognitionResult, ProductCategory, CATEGORY_ORDER } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { computeImageHash } from '@/lib/imageHash';

interface RecognizeOptions {
  forceRefresh?: boolean;
}

export function useProductRecognition() {
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const { toast } = useToast();

  const recognizeProduct = async (
    input: string | string[],
    options: RecognizeOptions = {},
  ) => {
    setIsRecognizing(true);
    setResult(null);

    try {
      const firstImage = Array.isArray(input) ? input[0] : input;
      const tHash = Date.now();
      const imageHash = firstImage ? await computeImageHash(firstImage) : null;
      console.log('[FE] hash compute:', Date.now() - tHash, 'ms');

      const body: Record<string, unknown> = Array.isArray(input)
        ? { imageBase64: input[0], images: input }
        : { imageBase64: input };
      if (imageHash) body.imageHash = imageHash;
      if (options.forceRefresh) body.forceRefresh = true;

      const tInvoke = Date.now();
      const { data, error } = await supabase.functions.invoke('recognize-product', { body });
      console.log('[FE] edge invoke:', Date.now() - tInvoke, 'ms');

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      const validSet = new Set<string>(CATEGORY_ORDER as readonly string[]);
      // 兼容 AI 偶尔返回的旧品类（jewelry / porcelain 等）
      const legacy = new Set(['porcelain','stationery','lacquerware','bronze','woodcraft','textile','jewelry','painting']);
      const category: ProductCategory = (validSet.has(data.category) || legacy.has(data.category))
        ? data.category as ProductCategory
        : 'other';

      const sellingPoints: Array<string | { tag: string; text: string }> = Array.isArray(data.sellingPoints)
        ? data.sellingPoints.filter((s: unknown) => {
            if (typeof s === 'string') return s.trim();
            return s && typeof s === 'object' && typeof (s as any).text === 'string' && (s as any).text.trim();
          })
        : [];

      const pitch = (data.pitch && typeof data.pitch === 'object')
        ? {
            opener: typeof data.pitch.opener === 'string' ? data.pitch.opener : '',
            highlight: typeof data.pitch.highlight === 'string' ? data.pitch.highlight : '',
            story: typeof data.pitch.story === 'string' ? data.pitch.story : undefined,
          }
        : undefined;

      let tips: RecognitionResult['tips'];
      if (data.tips && typeof data.tips === 'object') {
        tips = {
          memory: typeof data.tips.memory === 'string' ? data.tips.memory : undefined,
          objection: typeof data.tips.objection === 'string' ? data.tips.objection : undefined,
        };
      } else if (typeof data.tips === 'string') {
        tips = data.tips;
      }

      const recentPrice = (data.recentPrice && typeof data.recentPrice === 'object' && typeof data.recentPrice.price === 'number')
        ? {
            price: data.recentPrice.price,
            price_type: typeof data.recentPrice.price_type === 'string' ? data.recentPrice.price_type : null,
            recorded_at: typeof data.recentPrice.recorded_at === 'string' ? data.recentPrice.recorded_at : null,
          }
        : undefined;

      const recognitionResult: RecognitionResult = {
        name: data.name || '未知商品',
        category,
        era: data.era || undefined,
        origin: data.origin || undefined,
        material: data.material || undefined,
        craft: data.craft || undefined,
        dimensions: data.dimensions || undefined,
        condition: data.condition || undefined,
        description: data.description || undefined,
        sellingPoints,
        pitch,
        tips,
        confidence: data.confidence || 0.85,
        imageHash: data.imageHash || imageHash || undefined,
        fromCache: !!data.fromCache,
        cacheSource: typeof data.cacheSource === 'string' ? data.cacheSource : undefined,
        cachedAt: typeof data.cachedAt === 'string' ? data.cachedAt : undefined,
        cachedProductId: typeof data.cachedProductId === 'string' ? data.cachedProductId : undefined,
        recentPrice,
        __pipeline: data.__pipeline && typeof data.__pipeline === 'object' ? data.__pipeline : undefined,
      };

      setResult(recognitionResult);
      return recognitionResult;
    } catch (error) {
      console.error('Recognition error:', error);
      toast({
        title: '识别失败',
        description: error instanceof Error ? error.message : '请重试',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsRecognizing(false);
    }
  };

  const clearResult = () => setResult(null);

  return { isRecognizing, result, recognizeProduct, clearResult };
}
