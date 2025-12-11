import { useState } from 'react';
import { CameraCapture } from '@/components/recognition/CameraCapture';
import { ScriptDisplay } from '@/components/recognition/ScriptDisplay';
import { PriceDisplay } from '@/components/recognition/PriceDisplay';
import { useProductRecognition } from '@/hooks/useProductRecognition';
import { useRealtimeSession } from '@/hooks/useRealtimeSession';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function RecognitionPanel() {
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const { isRecognizing, result, recognizeProduct, clearResult } = useProductRecognition();
  const { updateSession } = useRealtimeSession();
  const { user, role } = useAuth();
  const { toast } = useToast();

  const canRecognize = role === 'admin' || role === 'anchor';

  // 异步上传图片（后台静默执行，不阻塞主流程）
  const uploadImageAsync = async (imageBase64: string, productId: string, userId: string) => {
    try {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });
      
      const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, blob, { contentType: 'image/jpeg' });
      
      if (!uploadError && uploadData) {
        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(fileName);
        
        // 更新商品的图片URL
        await supabase
          .from('products')
          .update({ image_url: publicUrl })
          .eq('id', productId);
        
        console.log('[Upload] Image uploaded successfully');
      }
    } catch (err) {
      console.error('[Upload] Background image upload error:', err);
    }
  };

  const handleCapture = async (imageBase64: string) => {
    clearResult();
    setCurrentProductId(null);

    const recognitionResult = await recognizeProduct(imageBase64);
    
    if (recognitionResult && user) {
      try {
        // 1. 立即保存商品到数据库（不等待图片上传）
        const { data: productData, error } = await supabase
          .from('products')
          .insert([{
            name: recognitionResult.name,
            category: recognitionResult.category,
            description: recognitionResult.description,
            era: recognitionResult.era,
            material: recognitionResult.material,
            craft: recognitionResult.craft,
            dimensions: recognitionResult.dimensions,
            condition: recognitionResult.condition,
            image_url: null, // 图片后台异步上传
            scripts: JSON.parse(JSON.stringify(recognitionResult.scripts)),
            ai_analysis: JSON.parse(JSON.stringify(recognitionResult)),
            created_by: user.id,
          }])
          .select()
          .single();

        if (error) {
          console.error('Error saving product:', error);
          return;
        }

        setCurrentProductId(productData.id);

        // 2. 并行执行：图片上传（后台）+ 价格保存 + 会话更新
        // 图片上传完全异步，不阻塞
        void uploadImageAsync(imageBase64, productData.id, user.id);

        // 价格保存和会话更新并行执行
        const sessionPromise = updateSession(productData.id, user.id);

        if (recognitionResult.suggestedPriceRange) {
          void supabase.from('price_records').insert({
            product_id: productData.id,
            price_type: 'suggested',
            price: recognitionResult.suggestedPriceRange.average,
            notes: `AI建议: ¥${recognitionResult.suggestedPriceRange.min}-${recognitionResult.suggestedPriceRange.max}`,
          });
        }

        await sessionPromise;

        toast({
          title: '识别完成',
          description: `已识别: ${recognitionResult.name}`,
        });
      } catch (error) {
        console.error('Error:', error);
      }
    }
  };

  if (!canRecognize) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">
            您当前的角色没有识别商品的权限，请联系管理员升级权限。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 左侧：摄像头/图片捕获 */}
      <div className="space-y-4">
        <CameraCapture onCapture={handleCapture} disabled={isRecognizing} />
        
        {isRecognizing && (
          <Card>
            <CardContent className="py-8">
              <div className="flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <p className="text-muted-foreground">AI正在识别商品...</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 右侧：识别结果 */}
      <div className="space-y-4">
        {result && (
          <>
            <ScriptDisplay result={result} />
            <PriceDisplay result={result} productId={currentProductId || undefined} />
          </>
        )}
        
        {!result && !isRecognizing && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>拍照或上传商品图片开始识别</p>
                <p className="text-sm mt-2">AI将在1-3秒内识别商品并生成话术</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
