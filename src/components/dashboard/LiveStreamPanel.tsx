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
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-surface flex flex-col">
      {/* 摄像头预览容器 */}
      <div className="flex-1 flex items-center justify-center px-3 sm:px-4 pt-3 pb-4">
        <div className="relative aspect-square w-full max-w-[min(100vw-1.5rem,68vh)] mx-auto bg-neutral-950 rounded-3xl overflow-hidden shadow-elevated ring-1 ring-border/40 animate-scale-in">
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

          {/* 取景框装饰 */}
          {isStreaming && !capturedImage && !isRecognizing && (
            <div className="pointer-events-none absolute inset-6 sm:inset-10 border border-white/30 rounded-2xl">
              <span className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-accent rounded-tl-2xl" />
              <span className="absolute -top-px -right-px w-6 h-6 border-t-2 border-r-2 border-accent rounded-tr-2xl" />
              <span className="absolute -bottom-px -left-px w-6 h-6 border-b-2 border-l-2 border-accent rounded-bl-2xl" />
              <span className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-accent rounded-br-2xl" />
            </div>
          )}

          {!isStreaming && !capturedImage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-6 bg-gradient-to-b from-neutral-900 to-neutral-950">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/5 backdrop-blur ring-1 ring-white/10 flex items-center justify-center">
                <Camera className="w-9 h-9 sm:w-11 sm:h-11 text-accent" strokeWidth={1.5} />
              </div>
              <div className="text-center space-y-1.5">
                <p className="text-white font-display text-lg sm:text-xl tracking-tight">即时识别 · 秒级反馈</p>
                <p className="text-white/60 text-xs sm:text-sm max-w-[18rem]">
                  对准商品拍照，AI 自动识别年份、工艺与销售卖点
                </p>
              </div>
            </div>
          )}

          {isRecognizing && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center animate-fade-in">
              <div className="text-center text-white space-y-4">
                <div className="relative w-16 h-16 mx-auto">
                  <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
                  <Loader2 className="w-16 h-16 animate-spin text-accent" strokeWidth={1.5} />
                </div>
                <div className="flex items-center gap-2 justify-center">
                  <Sparkles className="w-4 h-4 text-accent animate-pulse-glow" />
                  <span className="text-sm tracking-wide uppercase">AI 识别中</span>
                </div>
                <div className="text-3xl font-display font-bold tabular-nums">
                  {(elapsedTime / 1000).toFixed(1)}<span className="text-base font-sans font-normal text-white/60">s</span>
                </div>
              </div>
            </div>
          )}

          {/* 顶部状态条 */}
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
            {isStreaming && !capturedImage && (
              <div className="px-2.5 py-1 rounded-full bg-black/50 backdrop-blur text-white/90 text-[11px] font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                {facingMode === 'environment' ? '后置' : '前置'}
              </div>
            )}
            <div className="ml-auto">
              {recognitionTime && !isRecognizing && (
                <div className="px-2.5 py-1 rounded-full bg-success/90 backdrop-blur text-success-foreground text-[11px] font-medium tabular-nums">
                  ⚡ {(recognitionTime / 1000).toFixed(2)}s
                </div>
              )}
            </div>
          </div>

          {/* 底部渐变遮罩 + 操作按钮 */}
          <div className="absolute inset-x-0 bottom-0 pt-12 pb-3 px-3 bg-gradient-to-t from-black/70 via-black/40 to-transparent">
            <div className="flex justify-center items-center gap-2.5">
              {!isStreaming && !capturedImage && (
                <>
                  <Button
                    size="lg"
                    onClick={() => startCamera()}
                    className="gap-2 h-12 px-6 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground shadow-glow font-medium"
                  >
                    <Camera className="w-5 h-5" />
                    启动摄像头
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-2 h-12 px-5 rounded-full bg-white/10 backdrop-blur text-white border-white/20 hover:bg-white/20 hover:text-white"
                  >
                    <Upload className="w-5 h-5" />
                    上传
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
                    size="icon"
                    variant="outline"
                    onClick={switchCamera}
                    disabled={isRecognizing}
                    className="h-12 w-12 rounded-full bg-white/10 backdrop-blur text-white border-white/20 hover:bg-white/20 hover:text-white"
                  >
                    <SwitchCamera className="w-5 h-5" />
                  </Button>
                  {/* 主拍照按钮 - 放大 */}
                  <Button
                    onClick={captureAndRecognize}
                    disabled={isRecognizing}
                    className="h-16 w-16 rounded-full bg-white hover:bg-white/90 text-neutral-900 shadow-glow ring-4 ring-white/20 p-0"
                  >
                    <div className="w-12 h-12 rounded-full border-2 border-neutral-900 flex items-center justify-center">
                      <Camera className="w-5 h-5" />
                    </div>
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={stopCamera}
                    className="h-12 w-12 rounded-full bg-white/10 backdrop-blur text-white border-white/20 hover:bg-white/20 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </>
              )}

              {capturedImage && !isRecognizing && (
                <Button
                  size="lg"
                  onClick={() => {
                    setCapturedImage(null);
                    startCamera();
                  }}
                  className="gap-2 h-12 px-6 rounded-full bg-white text-neutral-900 hover:bg-white/90"
                >
                  <Camera className="w-5 h-5" />
                  继续拍摄
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 结果展示区 */}
      <div ref={resultRef} className="bg-background">
        {displayResult ? (
          <div className="animate-fade-in">
            {/* 继续拍摄按钮 */}
            <div className="sticky top-14 z-20 glass border-b border-border/60 px-3 py-3 safe-bottom">
              <div className="container px-0">
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
                  className="w-full gap-2 h-12 rounded-full bg-gradient-primary text-primary-foreground hover:opacity-95 shadow-soft text-base font-medium"
                >
                  <Camera className="w-5 h-5" />
                  继续拍摄下一件商品
                </Button>
                {recognitionTime && (
                  <p className="text-center text-xs text-muted-foreground mt-2 tabular-nums">
                    本次识别耗时 <span className="font-medium text-foreground">{(recognitionTime / 1000).toFixed(2)}s</span>
                  </p>
                )}
              </div>
            </div>

            <div className="container py-4 space-y-4">
              <ProductDetailCard result={displayResult} />

              {/* 管理员操作 */}
              {isAdmin && currentProductId && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
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
                  <Button size="sm" variant="destructive" className="rounded-full" onClick={deleteProduct}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    删除
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground text-sm px-4">
            拍摄或上传商品图片开始识别
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
