import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RecognitionResult, ProductCategory } from '@/types';
import { useToast } from '@/hooks/use-toast';

export function useProductRecognition() {
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const { toast } = useToast();

  const recognizeProduct = async (input: string | string[]) => {
    setIsRecognizing(true);
    setResult(null);

    try {
      const body = Array.isArray(input)
        ? { imageBase64: input[0], images: input }
        : { imageBase64: input };
      const { data, error } = await supabase.functions.invoke('recognize-product', {
        body,
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      const validCategories: ProductCategory[] = [
        'porcelain', 'incense', 'stationery', 'lacquerware',
        'bronze', 'woodcraft', 'textile', 'jewelry', 'painting', 'other'
      ];

      const category = validCategories.includes(data.category) ? data.category : 'other';

      // 卖点：兼容字符串 / 带标签对象
      const sellingPoints: Array<string | { tag: string; text: string }> = Array.isArray(data.sellingPoints)
        ? data.sellingPoints.filter((s: unknown) => {
            if (typeof s === 'string') return s.trim();
            return s && typeof s === 'object' && typeof (s as any).text === 'string' && (s as any).text.trim();
          })
        : [];

      // pitch（开场+亮点双句模板）
      const pitch = (data.pitch && typeof data.pitch === 'object')
        ? {
            opener: typeof data.pitch.opener === 'string' ? data.pitch.opener : '',
            highlight: typeof data.pitch.highlight === 'string' ? data.pitch.highlight : '',
          }
        : undefined;

      // tips：可能是对象（新）或字符串（旧）
      let tips: RecognitionResult['tips'];
      if (data.tips && typeof data.tips === 'object') {
        tips = {
          memory: typeof data.tips.memory === 'string' ? data.tips.memory : undefined,
          objection: typeof data.tips.objection === 'string' ? data.tips.objection : undefined,
        };
      } else if (typeof data.tips === 'string') {
        tips = data.tips;
      }

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
        imageHash: data.imageHash,
        fromCache: data.fromCache,
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
