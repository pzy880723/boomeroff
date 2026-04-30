import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RecognitionResult, ProductCategory } from '@/types';
import { useToast } from '@/hooks/use-toast';

export function useProductRecognition() {
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const { toast } = useToast();

  const recognizeProduct = async (imageBase64: string) => {
    setIsRecognizing(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('recognize-product', {
        body: { imageBase64 },
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      const validCategories: ProductCategory[] = [
        'porcelain', 'incense', 'stationery', 'lacquerware',
        'bronze', 'woodcraft', 'textile', 'jewelry', 'painting', 'other'
      ];

      const category = validCategories.includes(data.category) ? data.category : 'other';

      const sellingPoints: string[] = Array.isArray(data.sellingPoints)
        ? data.sellingPoints.filter((s: unknown) => typeof s === 'string' && s.trim())
        : [];

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
        tips: data.tips || undefined,
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
