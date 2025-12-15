import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useProductRecognition } from '@/hooks/useProductRecognition';
import { useRealtimeSession } from '@/hooks/useRealtimeSession';
import { supabase } from '@/integrations/supabase/client';
import { 
  Camera, 
  Upload, 
  X, 
  Loader2, 
  Sparkles, 
  Copy, 
  Volume2,
  Save,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  Trash2,
  Edit,
  SwitchCamera
} from 'lucide-react';
import { CATEGORY_LABELS, PriceRecord, RecognitionResult } from '@/types';

export function LiveStreamPanel() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const [historicalPrices, setHistoricalPrices] = useState<PriceRecord[]>([]);
  const [livePrice, setLivePrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedStyle, setCopiedStyle] = useState<string | null>(null);
  const [recognitionTime, setRecognitionTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();
  const { user, role } = useAuth();
  const { isRecognizing, result, recognizeProduct, clearResult } = useProductRecognition();
  const { currentProduct, session, updateSession } = useRealtimeSession();
  
  const isAdmin = role === 'admin';

  // 获取历史价格
  useEffect(() => {
    if (currentProductId) {
      fetchHistoricalPrices(currentProductId);
    }
  }, [currentProductId]);

  // 同步实时会话的产品
  useEffect(() => {
    if (currentProduct && session?.product_id) {
      setCurrentProductId(session.product_id);
    }
  }, [currentProduct, session]);

  const fetchHistoricalPrices = async (productId: string) => {
    const { data, error } = await supabase
      .from('price_records')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setHistoricalPrices(data as PriceRecord[]);
    }
  };

  const startCamera = async (mode?: 'environment' | 'user') => {
    const targetMode = mode || facingMode;
    
    try {
      console.log('[Camera] Requesting camera access with mode:', targetMode);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetMode, width: 1920, height: 1080 },
      });
      console.log('[Camera] Stream obtained:', stream.getVideoTracks()[0]?.label);
      
      streamRef.current = stream;
      
      // video 元素始终存在，直接设置流
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        videoRef.current.onloadedmetadata = () => {
          console.log('[Camera] Metadata loaded');
          videoRef.current?.play().catch(console.error);
        };
        
        setIsStreaming(true);
        console.log('[Camera] Camera started successfully');
      } else {
        console.error('[Camera] videoRef.current is null');
        stream.getTracks().forEach(track => track.stop());
        toast({
          title: '摄像头初始化失败',
          description: '请刷新页面重试',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[Camera] Error:', error);
      toast({
        title: '无法启动摄像头',
        description: error instanceof Error ? error.message : '请确保已授权摄像头访问权限',
        variant: 'destructive',
      });
    }
  };

  const switchCamera = async () => {
    // 停止当前摄像头
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // 切换模式
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    
    // 用新模式重新启动
    await startCamera(newMode);
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // 极速压缩图片 - 更激进的压缩参数
  const compressImage = (imageData: string, maxWidth: number = 640): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // 按比例缩小到640px
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.5)); // 质量降到0.5
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
    // 极速压缩 - 640px + 0.5质量
    const maxWidth = 640;
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
      const imageData = canvas.toDataURL('image/jpeg', 0.5);
      setCapturedImage(imageData);
      await handleRecognition(imageData);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: '无效的文件类型',
        description: '请上传图片文件',
        variant: 'destructive',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawImage = event.target?.result as string;
      // 压缩图片
      const imageData = await compressImage(rawImage);
      setCapturedImage(imageData);
      await handleRecognition(imageData);
    };
    reader.readAsDataURL(file);
  };

  const handleRecognition = async (imageBase64: string) => {
    clearResult();
    setCurrentProductId(null);
    setHistoricalPrices([]);
    setLivePrice('');
    setRecognitionTime(null);
    setElapsedTime(0);

    // 启动计时器
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 100);

    const recognitionResult = await recognizeProduct(imageBase64);
    
    // 停止计时器并记录最终时间
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const finalTime = Date.now() - startTime;
    setElapsedTime(finalTime);
    setRecognitionTime(finalTime);
    
    if (recognitionResult && user) {
      try {
        // 如果是从缓存命中的，显示快速提示
        if (recognitionResult.fromCache) {
          toast({
            title: '知识库命中',
            description: `快速识别: ${recognitionResult.name}`,
          });
        }

        // 保存产品到数据库（包含image_hash用于后续匹配）
        const { data: productData, error: productError } = await supabase
          .from('products')
          .insert({
            name: recognitionResult.name,
            category: recognitionResult.category,
            description: recognitionResult.description,
            era: recognitionResult.era,
            material: recognitionResult.material,
            craft: recognitionResult.craft,
            dimensions: recognitionResult.dimensions,
            condition: recognitionResult.condition,
            scripts: recognitionResult.scripts,
            image_hash: recognitionResult.imageHash,
            created_by: user.id,
          })
          .select()
          .single();

        if (productError) throw productError;

        setCurrentProductId(productData.id);

        // 保存AI建议价格
        if (recognitionResult.suggestedPriceRange) {
          await supabase.from('price_records').insert({
            product_id: productData.id,
            price_type: 'suggested',
            price: recognitionResult.suggestedPriceRange.average,
            notes: `AI建议价格区间: ¥${recognitionResult.suggestedPriceRange.min}-${recognitionResult.suggestedPriceRange.max}`,
          });
        }

        // 更新实时会话
        await updateSession(productData.id, user.id);

        // 识别完成后自动滚动到结果区域
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);

        if (!recognitionResult.fromCache) {
          const { dismiss } = toast({
            title: '识别成功',
            description: `已识别并保存到知识库: ${recognitionResult.name}`,
          });
          // 500毫秒后自动关闭
          setTimeout(() => dismiss(), 500);
        }
      } catch (error) {
        console.error('Error saving product:', error);
        toast({
          title: '保存失败',
          description: '识别成功但保存出错',
          variant: 'destructive',
        });
      }
    }
  };

  const saveLivePrice = async () => {
    if (!currentProductId || !livePrice) return;
    
    setSaving(true);
    try {
      const { error } = await supabase.from('price_records').insert({
        product_id: currentProductId,
        price_type: 'sold',
        price: parseFloat(livePrice),
        notes: '直播成交价',
      });

      if (error) throw error;

      toast({
        title: '价格已记录',
        description: `直播价 ¥${livePrice} 已保存`,
      });
      setLivePrice('');
      fetchHistoricalPrices(currentProductId);
    } catch (error) {
      toast({
        title: '保存失败',
        description: '请重试',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const copyScript = async (text: string, style: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedStyle(style);
    setTimeout(() => setCopiedStyle(null), 2000);
    toast({ title: '已复制到剪贴板' });
  };

  const speakScript = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const deleteProduct = async () => {
    if (!currentProductId || !isAdmin) return;
    
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', currentProductId);

      if (error) throw error;

      toast({ title: '商品已删除' });
      setCurrentProductId(null);
      clearResult();
      setCapturedImage(null);
    } catch (error) {
      toast({
        title: '删除失败',
        description: '请重试',
        variant: 'destructive',
      });
    }
  };

  // 计算价格统计
  const displayResult = result || (currentProduct ? {
    name: currentProduct.name,
    category: currentProduct.category,
    era: currentProduct.era,
    material: currentProduct.material,
    craft: currentProduct.craft,
    description: currentProduct.description,
    scripts: currentProduct.scripts as RecognitionResult['scripts'],
  } as RecognitionResult : null);

  const soldPrices = historicalPrices.filter(p => p.price_type === 'sold').map(p => p.price);
  const hasHistoricalData = soldPrices.length > 0;
  const avgPrice = hasHistoricalData ? soldPrices.reduce((a, b) => a + b, 0) / soldPrices.length : null;
  const minPrice = hasHistoricalData ? Math.min(...soldPrices) : null;
  const maxPrice = hasHistoricalData ? Math.max(...soldPrices) : null;

  const displayPrices = hasHistoricalData
    ? { min: minPrice!, max: maxPrice!, average: avgPrice!, source: '历史成交' }
    : result?.suggestedPriceRange
    ? { ...result.suggestedPriceRange, source: 'AI建议' }
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 摄像头预览容器 - 始终正方形居中 */}
      <div className="flex-1 flex items-center justify-center bg-black p-2 sm:p-4 min-h-[50vh]">
        <div className="relative aspect-square w-full max-w-[min(100vw-1rem,70vh)] mx-auto bg-black rounded-lg overflow-hidden">
          {/* 摄像头视频流 - 始终渲染，通过CSS控制显示 */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${isStreaming && !capturedImage ? '' : 'hidden'}`}
          />

          {/* 捕获的图片 */}
          {capturedImage && (
            <img
              src={capturedImage}
              alt="Captured"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {/* 占位符 - 仅在没有流和图片时显示 */}
          {!isStreaming && !capturedImage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4">
              <Camera className="w-16 h-16 sm:w-24 sm:h-24 text-muted-foreground" />
              <p className="text-muted-foreground text-center text-sm sm:text-lg">
                点击下方按钮启动摄像头或上传图片
              </p>
            </div>
          )}

          {/* 识别中动画 + 计时器 */}
          {isRecognizing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-center text-white space-y-4">
                <Loader2 className="w-12 h-12 animate-spin mx-auto" />
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                  <span className="text-lg">AI识别中...</span>
                </div>
                <div className="text-2xl font-mono font-bold">
                  {(elapsedTime / 1000).toFixed(1)}s
                </div>
              </div>
            </div>
          )}

          {/* 识别完成后显示耗时 */}
          {recognitionTime && !isRecognizing && (
            <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1.5 rounded-full text-sm font-mono">
              识别耗时: {(recognitionTime / 1000).toFixed(2)}s
            </div>
          )}

          {/* 摄像头模式指示 */}
          {isStreaming && !capturedImage && (
            <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1.5 rounded-full text-sm">
              {facingMode === 'environment' ? '后置摄像头' : '前置摄像头'}
            </div>
          )}

          {/* 摄像头控制按钮 */}
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
                  title={facingMode === 'environment' ? '切换到前置摄像头' : '切换到后置摄像头'}
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
          <div className="space-y-4">
            {/* 继续拍摄按钮 - 固定在结果区顶部 */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b p-3">
              <Button 
                size="lg" 
                onClick={() => {
                  setCapturedImage(null);
                  clearResult();
                  setCurrentProductId(null);
                  setHistoricalPrices([]);
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

            <div className="p-4 space-y-4">
            {/* 商品信息 */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl">{displayResult.name}</CardTitle>
                    <Badge>{CATEGORY_LABELS[displayResult.category]}</Badge>
                    {displayResult.era && <Badge variant="outline">{displayResult.era}</Badge>}
                  </div>
                  {isAdmin && currentProductId && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={deleteProduct}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  {displayResult.material && <span>材质: {displayResult.material}</span>}
                  {displayResult.craft && <span>| 工艺: {displayResult.craft}</span>}
                </div>
              </CardContent>
            </Card>

            {/* 10秒精炼话术 - 突出显示 */}
            <Card className="border-2 border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-5 h-5" />
                  10秒精炼卖点
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg leading-relaxed mb-4">
                  {displayResult.scripts?.sales || displayResult.description || '暂无话术'}
                </p>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant={copiedStyle === 'sales' ? 'secondary' : 'outline'}
                    onClick={() => copyScript(displayResult.scripts?.sales || '', 'sales')}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    {copiedStyle === 'sales' ? '已复制' : '复制'}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => speakScript(displayResult.scripts?.sales || '')}
                  >
                    <Volume2 className="w-4 h-4 mr-1" />
                    朗读
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 价格区域 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  价格参考
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {displayPrices && (
                  <div className="space-y-3">
                    <Badge variant={hasHistoricalData ? 'default' : 'secondary'}>
                      {displayPrices.source}
                    </Badge>
                    
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-muted rounded-lg p-3">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                          <TrendingDown className="w-3 h-3" />
                          最低
                        </div>
                        <div className="text-lg font-semibold">
                          ¥{displayPrices.min.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-primary/10 rounded-lg p-3 ring-2 ring-primary/20">
                        <div className="flex items-center justify-center gap-1 text-primary text-xs mb-1">
                          <Minus className="w-3 h-3" />
                          建议价
                        </div>
                        <div className="text-xl font-bold text-primary">
                          ¥{Math.round(displayPrices.average).toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-muted rounded-lg p-3">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                          <TrendingUp className="w-3 h-3" />
                          最高
                        </div>
                        <div className="text-lg font-semibold">
                          ¥{displayPrices.max.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 直播价格输入 */}
                {currentProductId && (
                  <div className="border-t pt-4">
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="输入直播成交价"
                        value={livePrice}
                        onChange={(e) => setLivePrice(e.target.value)}
                        className="flex-1"
                      />
                      <Button onClick={saveLivePrice} disabled={saving || !livePrice}>
                        <Save className="w-4 h-4 mr-1" />
                        记录
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground p-4">
            <p>拍摄或上传商品图片开始识别</p>
          </div>
        )}
      </div>
    </div>
  );
}
