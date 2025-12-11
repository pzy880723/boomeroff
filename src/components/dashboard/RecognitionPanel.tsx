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

  const handleCapture = async (imageBase64: string) => {
    clearResult();
    setCurrentProductId(null);

    const recognitionResult = await recognizeProduct(imageBase64);
    
    if (recognitionResult && user) {
      try {
        // 保存商品到数据库
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
            image_url: imageBase64,
            scripts: JSON.parse(JSON.stringify(recognitionResult.scripts)),
            ai_analysis: JSON.parse(JSON.stringify(recognitionResult)),
            created_by: user.id,
          }])
          .select()
          .single();

        if (error) {
          console.error('Error saving product:', error);
        } else if (productData) {
          setCurrentProductId(productData.id);
          
          // 保存AI建议价格
          if (recognitionResult.suggestedPriceRange) {
            await supabase.from('price_records').insert({
              product_id: productData.id,
              price_type: 'suggested',
              price: recognitionResult.suggestedPriceRange.average,
              notes: `AI建议价格区间: ¥${recognitionResult.suggestedPriceRange.min} - ¥${recognitionResult.suggestedPriceRange.max}`,
            });
          }

          // 更新实时会话
          await updateSession(productData.id, user.id);

          toast({
            title: '识别完成',
            description: `已识别: ${recognitionResult.name}`,
          });
        }
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
