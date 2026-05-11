import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { computeImageHash } from '@/lib/imageHash';
import type { RecognitionResult, ProductCategory } from '@/types';
import { useToast } from '@/hooks/use-toast';

const VALID_CATS: ProductCategory[] = [
  'jp_porcelain', 'eu_porcelain', 'incense', 'antique_art', 'local_craft',
  'anime_toy', 'otaku_goods', 'luxury', 'vintage_jewelry', 'game_console',
  'walkman', 'ccd', 'media_record', 'playback_device', 'home_appliance',
  'hobby', 'other',
];

export interface GuestRecognitionResult extends RecognitionResult {
  remaining?: number;
}

/** 游客版识别 hook：调用 recognize-product-public，无需登录 */
export function useGuestRecognition() {
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [result, setResult] = useState<GuestRecognitionResult | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const { toast } = useToast();

  const recognize = async (input: string | string[]) => {
    setIsRecognizing(true);
    setResult(null);
    try {
      const firstImage = Array.isArray(input) ? input[0] : input;
      const imageHash = firstImage ? await computeImageHash(firstImage) : null;
      const body: Record<string, unknown> = Array.isArray(input)
        ? { imageBase64: input[0], images: input }
        : { imageBase64: input };
      if (imageHash) body.imageHash = imageHash;

      const { data, error } = await supabase.functions.invoke('recognize-product-public', { body });

      if (error) {
        // 边缘函数会把详细错误塞在 data 中（429/limit）
        const msg = (error as any)?.message || '识别失败';
        toast({ title: '识别失败', description: msg, variant: 'destructive' });
        return null;
      }
      if (data?.error) {
        toast({ title: '识别未完成', description: data.error, variant: 'destructive' });
        if (typeof data.remaining === 'number') setRemaining(data.remaining);
        return null;
      }

      const category: ProductCategory = VALID_CATS.includes(data.category) ? data.category : 'other';
      const out: GuestRecognitionResult = {
        name: data.name || '未知商品',
        category,
        era: data.era || undefined,
        origin: data.origin || undefined,
        material: data.material || undefined,
        craft: data.craft || undefined,
        description: data.description || undefined,
        sellingPoints: Array.isArray(data.sellingPoints) ? data.sellingPoints : [],
        pitch: data.pitch && typeof data.pitch === 'object' ? data.pitch : undefined,
        tips: data.tips,
        confidence: typeof data.confidence === 'number' ? data.confidence : 0.7,
        imageHash: data.imageHash || imageHash || undefined,
        fromCache: !!data.fromCache,
        cacheSource: data.cacheSource,
        cachedAt: data.cachedAt,
        cachedProductId: data.cachedProductId,
        __pipeline: data.__pipeline,
        remaining: typeof data.remaining === 'number' ? data.remaining : undefined,
      };
      setResult(out);
      if (typeof data.remaining === 'number') setRemaining(data.remaining);
      return out;
    } catch (e: any) {
      toast({ title: '识别失败', description: e?.message || '请重试', variant: 'destructive' });
      return null;
    } finally {
      setIsRecognizing(false);
    }
  };

  const clear = () => setResult(null);

  return { isRecognizing, result, remaining, recognize, clear };
}
