import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useProductRecognition } from '@/hooks/useProductRecognition';
import { useRealtimeSession } from '@/hooks/useRealtimeSession';
import { supabase } from '@/integrations/supabase/client';
import {
  Camera, Upload, X, Loader2, Sparkles, Trash2, Edit, SwitchCamera, BookmarkPlus, Check, Layers, Image as ImageIcon, RotateCcw, Award, Star, MessageSquareWarning,
} from 'lucide-react';
import { RecognitionResult, ProductCategory } from '@/types';
import { ProductEditDialog } from '@/components/history/ProductEditDialog';
import { ProductDetailCard } from '@/components/recognition/ProductDetailCard';
import { RefineDialog } from '@/components/recognition/RefineDialog';
import { ShareToCommunityButton } from '@/components/community/ShareToCommunityButton';
import { serializeTips, normalizeSellingPoints } from '@/lib/script';

type CaptureMode = 'single' | 'multi';
const MAX_MULTI_IMAGES = 5;

export function LiveStreamPanel() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('single');
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const [recognitionTime, setRecognitionTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [knowledgeAdded, setKnowledgeAdded] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [savingFav, setSavingFav] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [overriddenResult, setOverriddenResult] = useState<RecognitionResult | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
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

  // 高清压缩：单图 1280px/0.85（保留底款细节），多图 1024px/0.8（控制总体积）
  const compressImage = (imageData: string, maxWidth?: number, quality?: number): Promise<string> => {
    const isMulti = captureMode === 'multi';
    const w = maxWidth ?? (isMulti ? 1024 : 1280);
    const q = quality ?? (isMulti ? 0.8 : 0.85);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > w) {
          height = (height * w) / width;
          width = w;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', q));
        } else {
          resolve(imageData);
        }
      };
      img.src = imageData;
    });
  };

  const grabFrame = (): string | null => {
    if (!videoRef.current) return null;
    const isMulti = captureMode === 'multi';
    const maxWidth = isMulti ? 1024 : 1280;
    const quality = isMulti ? 0.8 : 0.85;
    const canvas = document.createElement('canvas');
    let width = videoRef.current.videoWidth;
    let height = videoRef.current.videoHeight;
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  };

  const handleCaptureClick = async () => {
    const frame = grabFrame();
    if (!frame) return;
    if (captureMode === 'single') {
      setCapturedImage(frame);
      await handleRecognition([frame]);
    } else {
      if (capturedImages.length >= MAX_MULTI_IMAGES) {
        toast({ title: `最多 ${MAX_MULTI_IMAGES} 张` });
        return;
      }
      setCapturedImages((prev) => [...prev, frame]);
    }
  };

  const finishMultiCapture = async () => {
    if (capturedImages.length === 0) return;
    setCapturedImage(capturedImages[0]);
    await handleRecognition(capturedImages);
  };

  const removeMultiImage = (index: number) => {
    setCapturedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const valid = files.filter((f) => f.type.startsWith('image/'));
    if (valid.length === 0) {
      toast({ title: '无效文件类型', description: '请上传图片', variant: 'destructive' });
      return;
    }

    const readFile = (file: File) =>
      new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const raw = ev.target?.result as string;
          resolve(await compressImage(raw));
        };
        reader.readAsDataURL(file);
      });

    if (captureMode === 'single') {
      const img = await readFile(valid[0]);
      setCapturedImage(img);
      await handleRecognition([img]);
    } else {
      const remain = MAX_MULTI_IMAGES - capturedImages.length;
      const list = await Promise.all(valid.slice(0, remain).map(readFile));
      setCapturedImages((prev) => [...prev, ...list]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRecognition = async (imageList: string[]) => {
    clearResult();
    setCurrentProductId(null);
    setRecognitionTime(null);
    setElapsedTime(0);
    setKnowledgeAdded(false);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 100);

    if (!user) return;

    const [imageUrl, recognitionResult] = await Promise.all([
      uploadImage(imageList[0], user.id),
      recognizeProduct(imageList.length > 1 ? imageList : imageList[0]),
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
          selling_points: (recognitionResult.sellingPoints || []) as any,
          tips: serializeTips(recognitionResult.tips ?? null),
          image_url: imageUrl,
          image_hash: recognitionResult.imageHash,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      setCurrentProductId(productData.id);
      setProductImageUrl(imageUrl);
      setOverriddenResult(null);
      await updateSession(productData.id, user.id);

      // 不再自动发到中古圈，改为用户在结果卡上手动点「分享到中古圈」按钮
      // 避免大量错识别污染社区

      // 多张图清空缓冲
      setCapturedImages([]);
      setFavorited(false);

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);

      if (!recognitionResult.fromCache) {
        const { dismiss } = toast({
          title: '识别成功',
          description: recognitionResult.name,
        });
        setTimeout(() => dismiss(), 800);
      }
    } catch (error) {
      console.error('Error saving product:', error);
      toast({ title: '保存失败', description: '识别成功但保存出错', variant: 'destructive' });
    }
  };

  const addToKnowledge = async () => {
    if (!currentProductId || !user || !displayResult) return;
    setSavingKnowledge(true);
    try {
      const sp = displayResult.sellingPoints || [];

      // 拉取已上传的真实图片 URL（避免把 base64 写进 jsonb/text）
      const { data: prod } = await supabase
        .from('products')
        .select('image_url')
        .eq('id', currentProductId)
        .maybeSingle();
      const coverUrl = prod?.image_url || null;

      // 现状探查
      const [pkRes, ofRes] = await Promise.all([
        supabase
          .from('product_knowledge')
          .select('id')
          .eq('product_id', currentProductId)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('official_knowledge')
          .select('id')
          .eq('source_product_id', currentProductId)
          .limit(1)
          .maybeSingle(),
      ]);

      let didSomething = false;

      // 缺 product_knowledge → 补
      if (!pkRes.data) {
        const { error } = await supabase.from('product_knowledge').insert({
          product_id: currentProductId,
          category: displayResult.category,
          product_name: displayResult.name,
          selling_points: sp as any,
          tips: serializeTips(displayResult.tips ?? null),
          era: displayResult.era || null,
          origin: displayResult.origin || null,
          image_url: coverUrl,
          created_by: user.id,
          is_official: isAdmin,
        });
        if (error) throw error;
        didSomething = true;
      } else if (isAdmin) {
        // 已存在但旧版未标记 official → 升级
        await supabase
          .from('product_knowledge')
          .update({ is_official: true })
          .eq('id', pkRes.data.id);
      }

      // admin 且缺 official_knowledge → 补建
      if (isAdmin && !ofRes.data) {
        const { error: ofErr } = await supabase.from('official_knowledge').insert({
          name: displayResult.name,
          category: displayResult.category,
          summary: displayResult.description || null,
          content: {
            material: displayResult.material || null,
            craft: displayResult.craft || null,
            dimensions: displayResult.dimensions || null,
            condition: displayResult.condition || null,
          },
          era: displayResult.era || null,
          origin: displayResult.origin || null,
          cover_url: coverUrl,
          gallery: coverUrl ? [coverUrl] : [],
          selling_points: sp as any,
          tips: serializeTips(displayResult.tips ?? null),
          source_product_id: currentProductId,
          created_by: user.id,
        });
        if (ofErr) throw ofErr;
        didSomething = true;
      }

      setKnowledgeAdded(true);

      if (!didSomething) {
        toast({ title: '已在知识库中', description: '无需重复添加' });
      } else {
        toast({
          title: isAdmin ? '已收录为官方知识' : '已申请收录',
          description: isAdmin ? '所有同事都能在「官方知识」看到' : '已加入团队池，等待管理员审核',
        });
      }
    } catch (e: any) {
      console.error('[Knowledge] insert error:', e);
      const code = e?.code || '';
      if (code === '42501' || /row-level security/i.test(e?.message || '')) {
        toast({ title: '权限不足', description: '需要店员或管理员权限', variant: 'destructive' });
      } else {
        toast({ title: '加入失败', description: e?.message || '请稍后重试', variant: 'destructive' });
      }
    } finally {
      setSavingKnowledge(false);
    }
  };

  const toggleFavorite = async () => {
    if (!currentProductId || !user || !displayResult) return;
    setSavingFav(true);
    try {
      if (favorited) {
        await supabase.from('user_favorites').delete()
          .eq('user_id', user.id).eq('source_type', 'recognition').eq('source_id', currentProductId);
        setFavorited(false);
        toast({ title: '已取消收藏' });
      } else {
        // 拉已上传的真实 URL，避免把 base64 dataURL 写进 jsonb
        const { data: prod } = await supabase
          .from('products')
          .select('image_url')
          .eq('id', currentProductId)
          .maybeSingle();
        const coverUrl = prod?.image_url || null;
        const { error } = await supabase.from('user_favorites').insert({
          user_id: user.id,
          source_type: 'recognition',
          source_id: currentProductId,
          snapshot: {
            name: displayResult.name,
            category: displayResult.category,
            cover_url: coverUrl,
            image_url: coverUrl,
            summary: displayResult.description || null,
          },
        });
        if (error && !error.message.includes('duplicate')) throw error;
        setFavorited(true);
        toast({ title: '已收藏到个人知识库' });
      }
    } catch (e) {
      console.error('[Favorite] error:', e);
      toast({ title: '操作失败', variant: 'destructive' });
    } finally {
      setSavingFav(false);
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

  const baseResult: RecognitionResult | null = result || (currentProduct ? {
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
  const displayResult: RecognitionResult | null = overriddenResult || baseResult;

  // 进入已识别商品时，同步「加入知识库」与「收藏」状态，避免重复入库
  useEffect(() => {
    if (!currentProductId || !user) {
      setKnowledgeAdded(false);
      setFavorited(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [pkRes, favRes, ofRes] = await Promise.all([
        supabase
          .from('product_knowledge')
          .select('id')
          .eq('product_id', currentProductId)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('user_favorites')
          .select('id')
          .eq('user_id', user.id)
          .eq('source_type', 'recognition')
          .eq('source_id', currentProductId)
          .limit(1)
          .maybeSingle(),
        // admin 还要确认 official_knowledge 也存在，才算"已收录"
        isAdmin
          ? supabase
              .from('official_knowledge')
              .select('id')
              .eq('source_product_id', currentProductId)
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: { id: 'skip' } } as any),
      ]);
      if (cancelled) return;
      setKnowledgeAdded(!!pkRes.data && !!ofRes.data);
      setFavorited(!!favRes.data);
    })();
    return () => { cancelled = true; };
  }, [currentProductId, user, isAdmin]);

  const switchMode = (mode: CaptureMode) => {
    if (mode === captureMode) return;
    setCaptureMode(mode);
    setCapturedImages([]);
  };

  return (
    <div className="min-h-[calc(100vh-3.75rem)] bg-gradient-surface flex flex-col">
      {/* 拍摄模式分段切换 */}
      {!capturedImage && !isRecognizing && (
        <div className="px-3 sm:px-4 pt-3">
          <div className="mx-auto max-w-[min(100vw-1.5rem,68vh)] flex items-center bg-muted/60 rounded-full p-1 ring-1 ring-border/40">
            <button
              type="button"
              onClick={() => switchMode('single')}
              className={`flex-1 h-9 rounded-full text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                captureMode === 'single'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              单张快拍
            </button>
            <button
              type="button"
              onClick={() => switchMode('multi')}
              className={`flex-1 h-9 rounded-full text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                captureMode === 'multi'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              <Layers className="w-4 h-4" />
              多角度合并
              {capturedImages.length > 0 && (
                <span className="ml-1 px-1.5 py-px rounded-full bg-accent text-accent-foreground text-[10px] tabular-nums">
                  {capturedImages.length}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

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
                  {captureMode === 'single'
                    ? '对准商品拍照，AI 自动识别年份、工艺与销售卖点'
                    : `多角度拍摄（最多 ${MAX_MULTI_IMAGES} 张），合并送 AI 综合识别`}
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
                {captureMode === 'multi' && (
                  <span className="ml-1 tabular-nums">· {capturedImages.length}/{MAX_MULTI_IMAGES}</span>
                )}
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

          {/* 多角度缩略图条 */}
          {captureMode === 'multi' && isStreaming && capturedImages.length > 0 && !capturedImage && (
            <div className="absolute left-3 right-3 bottom-24 sm:bottom-28 flex gap-1.5 overflow-x-auto pb-1">
              {capturedImages.map((src, i) => (
                <div key={i} className="relative shrink-0">
                  <img
                    src={src}
                    alt={`角度 ${i + 1}`}
                    className="h-14 w-14 rounded-lg object-cover ring-2 ring-white/40"
                  />
                  <button
                    type="button"
                    onClick={() => removeMultiImage(i)}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/80 text-white flex items-center justify-center hover:bg-black"
                    aria-label="删除"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

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
                    multiple={captureMode === 'multi'}
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
                  <Button
                    onClick={handleCaptureClick}
                    disabled={isRecognizing || (captureMode === 'multi' && capturedImages.length >= MAX_MULTI_IMAGES)}
                    className="h-16 w-16 rounded-full bg-white hover:bg-white/90 text-neutral-900 shadow-glow ring-4 ring-white/20 p-0"
                  >
                    <div className="w-12 h-12 rounded-full border-2 border-neutral-900 flex items-center justify-center">
                      <Camera className="w-5 h-5" />
                    </div>
                  </Button>
                  {captureMode === 'multi' && capturedImages.length > 0 ? (
                    <Button
                      size="lg"
                      onClick={finishMultiCapture}
                      disabled={isRecognizing}
                      className="h-12 px-4 rounded-full bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5"
                    >
                      <Sparkles className="w-4 h-4" />
                      识别 ({capturedImages.length})
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={stopCamera}
                      className="h-12 w-12 rounded-full bg-white/10 backdrop-blur text-white border-white/20 hover:bg-white/20 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  )}
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
                  <RotateCcw className="w-5 h-5" />
                  重拍这一张
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
            <div className="sticky top-[3.75rem] z-20 glass border-b border-border/60 px-3 py-3 safe-bottom">
              <div className="container px-0">
                <Button
                  size="lg"
                  onClick={() => {
                    setCapturedImage(null);
                    setCapturedImages([]);
                    clearResult();
                    setCurrentProductId(null);
                    setRecognitionTime(null);
                    setKnowledgeAdded(false);
                    startCamera();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full gap-2 h-12 rounded-full bg-gradient-primary text-primary-foreground hover:opacity-95 shadow-soft text-base font-medium"
                >
                  <Camera className="w-5 h-5" />
                  识别下一件商品
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

              {/* 团队/官方知识库 + 个人收藏 */}
              {currentProductId && (
                <div className="space-y-2 pt-1">
                  {/* 主按钮：申请收录 / 直接收录为官方 */}
                  <Button
                    onClick={addToKnowledge}
                    disabled={knowledgeAdded || savingKnowledge}
                    size="lg"
                    className={`w-full h-12 rounded-full gap-2 text-base font-medium shadow-soft ${
                      knowledgeAdded
                        ? 'bg-success text-success-foreground hover:bg-success'
                        : 'bg-gradient-accent text-accent-foreground hover:opacity-95'
                    }`}
                  >
                    {savingKnowledge ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        正在收录...
                      </>
                    ) : knowledgeAdded ? (
                      <>
                        <Check className="w-5 h-5" />
                        {isAdmin ? '已收录为官方知识' : '已申请收录'}
                      </>
                    ) : (
                      <>
                        <Award className="w-5 h-5" />
                        {isAdmin ? '直接收录为官方知识' : '申请收录到官方知识库'}
                      </>
                    )}
                  </Button>

                  {/* 次按钮：个人收藏 */}
                  <Button
                    onClick={toggleFavorite}
                    disabled={savingFav}
                    variant={favorited ? 'outline' : 'secondary'}
                    size="lg"
                    className="w-full h-11 rounded-full gap-2"
                  >
                    {savingFav ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Star className={`w-4 h-4 ${favorited ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                    )}
                    {favorited ? '已加入我的学习清单' : '收藏到我的学习清单'}
                  </Button>

                  {/* 跟 AI 纠正识别 */}
                  <Button
                    onClick={() => setRefineOpen(true)}
                    variant="outline"
                    size="lg"
                    className="w-full h-11 rounded-full gap-2 border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                  >
                    <MessageSquareWarning className="w-4 h-4" />
                    识别不对？跟 AI 纠正
                  </Button>

                  {/* 分享到中古圈 */}
                  <ShareToCommunityButton
                    productId={currentProductId}
                    name={displayResult.name}
                    category={displayResult.category}
                    era={displayResult.era}
                    origin={displayResult.origin}
                    imageUrl={productImageUrl}
                    sellingPoints={displayResult.sellingPoints || []}
                    tips={displayResult.tips}
                    size="lg"
                    className="w-full h-11 rounded-full"
                  />

                  {/* 引导提示 */}
                  <p className="text-[11px] text-muted-foreground text-center px-2 leading-relaxed">
                    收藏只有自己看得到 · {isAdmin ? '收录后所有同事都能学到' : '申请收录会让所有同事都能学到'}
                  </p>
                </div>
              )}

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

      {displayResult && (
        <RefineDialog
          open={refineOpen}
          onOpenChange={setRefineOpen}
          imageUrl={productImageUrl}
          productId={currentProductId}
          current={displayResult}
          onApplied={(next) => setOverriddenResult(next)}
        />
      )}
    </div>
  );
}
