import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useProductRecognition } from '@/hooks/useProductRecognition';
import { useRealtimeSession } from '@/hooks/useRealtimeSession';
import { supabase } from '@/integrations/supabase/client';
import {
  Camera, Upload, X, Loader2, Sparkles, Trash2, Edit, SwitchCamera,
} from 'lucide-react';
import { RecognitionResult, ProductCategory } from '@/types';
import { ProductEditDialog } from '@/components/history/ProductEditDialog';
import { ProductDetailCard } from '@/components/recognition/ProductDetailCard';
import { DailyKnowledgeCard } from './DailyKnowledgeCard';

export function LiveStreamPanel() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const [recognitionTime, setRecognitionTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const { user, role } = useAuth();
  const { isRecognizing, result, recognizeProduct, clearResult } = useProductRecognition();
  const { currentProduct, session, updateSession } = useRealtimeSession();

  const isAdmin = role === 'admin';

  const [editableProduct, setEditableProduct] = useState<{
    id: string;
    name: string;
    category: ProductCategory;
    era: string | null;
    origin: string | null;
    material: string | null;
    craft: string | null;
    description: string | null;
    dimensions: string | null;
    condition: string | null;
    selling_points: string[];
    tips: string | null;
  } | null>(null);

  useEffect(() => {
    if (currentProduct && session?.product_id) {
      setCurrentProductId(session.product_id);
    }
  }, [currentProduct, session]);

  // 上传图片到 storage
  const uploadImage = async (imageBase64: string, userId: string): Promise<string | null> => {
    try {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });
      const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const { error } = await supabase.storage
        .from('product-images')
        .upload(fileName, blob, { contentType: 'image/jpeg' });
      if (error) {
        console.error('[Upload] error:', error);
        return null;
      }
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
      return publicUrl;
    } catch (e) {
      console.error('[Upload] error:', e);
      return null;
    }
  };

  const startCamera = async (mode?: 'environment' | 'user') => {
    const targetMode = mode || facingMode;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetMode, width: 1920, height: 1080 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
        };
        setIsStreaming(true);
      } else {
        stream.getTracks().forEach(t => t.stop());
      }
    } catch (error) {
      toast({
        title: '无法启动摄像头',
        description: error instanceof Error ? error.message : '请授权摄像头访问权限',
        variant: 'destructive',
      });
    }
  };

  const switchCamera = async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    await startCamera(newMode);
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const compressImage = (imageData: string, maxWidth: number = 800): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } else {
          resolve(imageData);
        }
      };
      img.src = imageData;
    });
  };

  const captureAndRecognize = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    const maxWidth = 800;
    let width = videoRef.current.videoWidth;
    let height = videoRef.current.videoHeight;
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, width, height);
      const imageData = canvas.toDataURL('image/jpeg', 0.7);
      setCapturedImage(imageData);
      await handleRecognition(imageData);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: '无效文件类型', description: '请上传图片', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawImage = event.target?.result as string;
      const imageData = await compressImage(rawImage);
      setCapturedImage(imageData);
      await handleRecognition(imageData);
    };
    reader.readAsDataURL(file);
  };

  const handleRecognition = async (imageBase64: string) => {
    clearResult();
    setCurrentProductId(null);
    setRecognitionTime(null);
    setElapsedTime(0);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 100);

    if (!user) return;

    // 并行：上传图片 + 识别
    const [imageUrl, recognitionResult] = await Promise.all([
      uploadImage(imageBase64, user.id),
      recognizeProduct(imageBase64),
    ]);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const finalTime = Date.now() - startTime;
    setElapsedTime(finalTime);
    setRecognitionTime(finalTime);

    if (!recognitionResult) return;

    if (!imageUrl) {
      toast({ title: '图片上传失败', description: '商品信息已保存', variant: 'destructive' });
    }

    try {
      if (recognitionResult.fromCache) {
        toast({ title: '知识库命中', description: `快速识别: ${recognitionResult.name}` });
      }

      const { data: productData, error } = await supabase
        .from('products')
        .insert({
          name: recognitionResult.name,
          category: recognitionResult.category,
          description: recognitionResult.description,
          era: recognitionResult.era,
          origin: recognitionResult.origin,
          material: recognitionResult.material,
          craft: recognitionResult.craft,
          dimensions: recognitionResult.dimensions,
          condition: recognitionResult.condition,
          selling_points: recognitionResult.sellingPoints || [],
          tips: recognitionResult.tips,
          image_url: imageUrl,
          image_hash: recognitionResult.imageHash,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      setCurrentProductId(productData.id);
      await updateSession(productData.id, user.id);

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);

      if (!recognitionResult.fromCache) {
        const { dismiss } = toast({
          title: '识别成功',
          description: `已保存到知识库: ${recognitionResult.name}`,
        });
        setTimeout(() => dismiss(), 800);
      }
    } catch (error) {
      console.error('Error saving product:', error);
      toast({ title: '保存失败', description: '识别成功但保存出错', variant: 'destructive' });
    }
  };

  const deleteProduct = async () => {
    if (!currentProductId || !isAdmin) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', currentProductId);
      if (error) throw error;
      toast({ title: '商品已删除' });
      setCurrentProductId(null);
      clearResult();
      setCapturedImage(null);
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  };

  // 显示用结果（识别结果 or 实时同步）
  const displayResult: RecognitionResult | null = result || (currentProduct ? {
    name: currentProduct.name,
    category: currentProduct.category,
    era: currentProduct.era,
    origin: currentProduct.origin,
    material: currentProduct.material,
    craft: currentProduct.craft,
    dimensions: currentProduct.dimensions,
    condition: currentProduct.condition,
    description: currentProduct.description,
    sellingPoints: currentProduct.selling_points || [],
    tips: currentProduct.tips,
  } : null);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 每日知识点 */}
      <div className="container py-3">
        <DailyKnowledgeCard />
      </div>

      {/* 摄像头预览容器 */}
      <div className="flex-1 flex items-center justify-center bg-black p-2 sm:p-4 min-h-[50vh]">
        <div className="relative aspect-square w-full max-w-[min(100vw-1rem,70vh)] mx-auto bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${isStreaming && !capturedImage ? '' : 'hidden'}`}
          />

          {capturedImage && (
            <img
              src={capturedImage}
              alt="已捕获图片"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {!isStreaming && !capturedImage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4">
              <Camera className="w-16 h-16 sm:w-24 sm:h-24 text-muted-foreground" />
              <p className="text-muted-foreground text-center text-sm sm:text-lg">
                点击下方按钮启动摄像头或上传图片
              </p>
            </div>
          )}

          {isRecognizing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-center text-white space-y-4">
                <Loader2 className="w-12 h-12 animate-spin mx-auto" />
                <div className="flex items-center gap-2 justify-center">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                  <span className="text-lg">AI 识别中...</span>
                </div>
                <div className="text-2xl font-mono font-bold">
                  {(elapsedTime / 1000).toFixed(1)}s
                </div>
              </div>
            </div>
          )}

          {recognitionTime && !isRecognizing && (
            <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1.5 rounded-full text-sm font-mono">
              识别耗时: {(recognitionTime / 1000).toFixed(2)}s
            </div>
          )}

          {isStreaming && !capturedImage && (
            <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1.5 rounded-full text-sm">
              {facingMode === 'environment' ? '后置摄像头' : '前置摄像头'}
            </div>
          )}

          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap justify-center gap-2 sm:gap-3">
            {!isStreaming && !capturedImage && (
              <>
                <Button size="lg" onClick={() => startCamera()} className="gap-2">
                  <Camera className="w-5 h-5" />
                  启动摄像头
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2 bg-background/80"
                >
                  <Upload className="w-5 h-5" />
                  上传图片
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </>
            )}

            {isStreaming && (
              <>
                <Button
                  size="lg"
                  onClick={captureAndRecognize}
                  disabled={isRecognizing}
                  className="gap-2"
                >
                  <Camera className="w-5 h-5" />
                  拍照识别
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={switchCamera}
                  disabled={isRecognizing}
                  className="bg-background/80"
                >
                  <SwitchCamera className="w-5 h-5" />
                </Button>
                <Button size="lg" variant="outline" onClick={stopCamera} className="bg-background/80">
                  <X className="w-5 h-5" />
                </Button>
              </>
            )}

            {capturedImage && !isRecognizing && (
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  setCapturedImage(null);
                  startCamera();
                }}
                className="gap-2 bg-background/80"
              >
                继续拍摄
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 结果展示区 */}
      <div ref={resultRef} className="bg-background">
        {displayResult ? (
          <div>
            {/* 继续拍摄按钮 */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b p-3">
              <Button
                size="lg"
                onClick={() => {
                  setCapturedImage(null);
                  clearResult();
                  setCurrentProductId(null);
                  setRecognitionTime(null);
                  startCamera();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full gap-2 py-6 text-lg"
              >
                <Camera className="w-6 h-6" />
                继续拍摄下一件商品
              </Button>
              {recognitionTime && (
                <p className="text-center text-sm text-muted-foreground mt-2">
                  识别耗时: {(recognitionTime / 1000).toFixed(2)}s
                </p>
              )}
            </div>

            <div className="p-4 space-y-4 container">
              <ProductDetailCard result={displayResult} />

              {/* 管理员操作 */}
              {isAdmin && currentProductId && (
                <Card>
                  <CardContent className="flex justify-end gap-2 pt-6">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditableProduct({
                          id: currentProductId,
                          name: displayResult.name,
                          category: displayResult.category,
                          era: displayResult.era || null,
                          origin: displayResult.origin || null,
                          material: displayResult.material || null,
                          craft: displayResult.craft || null,
                          description: displayResult.description || null,
                          dimensions: displayResult.dimensions || null,
                          condition: displayResult.condition || null,
                          selling_points: displayResult.sellingPoints || [],
                          tips: displayResult.tips || null,
                        });
                        setEditDialogOpen(true);
                      }}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      编辑
                    </Button>
                    <Button size="sm" variant="destructive" onClick={deleteProduct}>
                      <Trash2 className="w-4 h-4 mr-1" />
                      删除
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground p-4">
            <p>拍摄或上传商品图片开始识别</p>
          </div>
        )}
      </div>

      <ProductEditDialog
        product={editableProduct}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={async () => {
          if (currentProductId) {
            const { data } = await supabase
              .from('products')
              .select('*')
              .eq('id', currentProductId)
              .maybeSingle();
            if (data) {
              setEditableProduct({
                id: data.id,
                name: data.name,
                category: data.category,
                era: data.era,
                origin: data.origin,
                material: data.material,
                craft: data.craft,
                description: data.description,
                dimensions: data.dimensions,
                condition: data.condition,
                selling_points: Array.isArray(data.selling_points) ? (data.selling_points as string[]) : [],
                tips: data.tips,
              });
            }
          }
          setEditDialogOpen(false);
          toast({ title: '商品信息已更新' });
        }}
      />
    </div>
  );
}
