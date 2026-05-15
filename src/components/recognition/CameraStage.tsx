import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Camera, Upload, X, Loader2, Sparkles, SwitchCamera,
  Layers, Image as ImageIcon, RotateCcw, Check,
} from 'lucide-react';

type CaptureMode = 'single' | 'multi';
const MAX_MULTI_IMAGES = 5;

/** 识别叙事步骤:让等待过程"有事情在发生",而不是干瞪倒计时。 */
const SINGLE_STEPS: Array<{ label: string; at: number }> = [
  { label: '正在解析图片细节', at: 0 },
  { label: '正在比对商品知识库', at: 800 },
  { label: '正在全网检索同款资料', at: 1600 },
  { label: '正在整理年代 · 产地 · 故事', at: 2600 },
];
const buildMultiSteps = (n: number): Array<{ label: string; at: number }> => [
  { label: `正在对齐 ${n} 张图像`, at: 0 },
  { label: '正在解析每张图的关键特征', at: 700 },
  { label: '正在比对商品知识库', at: 1600 },
  { label: '正在全网检索同款资料', at: 2600 },
  { label: '正在整理年代 · 产地 · 故事', at: 3800 },
];

export interface CameraStageHandle {
  /** 外部重置：回到「未启动」状态 */
  reset: () => void;
}

interface CameraStageProps {
  /** 父级处理识别业务，返回 true 视为成功；返回 false / 抛错则展示重试遮罩 */
  onRecognize: (images: string[]) => Promise<boolean>;
  /** 拍摄完成后是否保留预览（默认 true）。顾客版跳走结果页，可设为 false 让相机回到待机 */
  keepPreviewAfterSuccess?: boolean;
}

/**
 * 通用相机壳子：方形大取景框、四角准星、白色快门键、前后置切换、单/多角度。
 * 与店员版 LiveStreamPanel 视觉&交互一致。业务逻辑由父级 onRecognize 决定。
 */
export const CameraStage = forwardRef<CameraStageHandle, CameraStageProps>(function CameraStage(
  { onRecognize, keepPreviewAfterSuccess = true },
  ref,
) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('single');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionFailed, setRecognitionFailed] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [recognitionTime, setRecognitionTime] = useState<number | null>(null);
  const [narrativeSteps, setNarrativeSteps] = useState<Array<{ label: string; at: number }>>(SINGLE_STEPS);
  const [forceAllDone, setForceAllDone] = useState(false);

  const currentStepIndex = useMemo(() => {
    if (forceAllDone) return narrativeSteps.length;
    let idx = 0;
    for (let i = 0; i < narrativeSteps.length; i++) {
      if (elapsedTime >= narrativeSteps[i].at) idx = i;
    }
    return idx;
  }, [elapsedTime, narrativeSteps, forceAllDone]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const timerStartRef = useRef<number>(0);
  const lastInputRef = useRef<string[] | null>(null);

  const { toast } = useToast();

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  useImperativeHandle(ref, () => ({
    reset: () => {
      setCapturedImage(null);
      setCapturedImages([]);
      setRecognitionFailed(false);
      setRecognitionTime(null);
      stopCamera();
    },
  }), [stopCamera]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) cancelAnimationFrame(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const startCamera = async (mode?: 'environment' | 'user') => {
    const targetMode = mode || facingMode;
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md || typeof md.getUserMedia !== 'function') {
      const isWeChat = typeof navigator !== 'undefined' && /MicroMessenger|QQ\//i.test(navigator.userAgent);
      toast({
        title: '当前浏览器不支持摄像头',
        description: isWeChat
          ? '请点击右上角「···」选择「在浏览器中打开」，或改用「上传」按钮'
          : '请改用「上传」按钮选择图片',
        variant: 'destructive',
      });
      return;
    }
    try {
      const stream = await md.getUserMedia({
        video: { facingMode: targetMode, width: 1920, height: 1080 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          try {
            videoRef.current?.play().catch(() => { /* noop */ });
          } catch { /* noop */ }
        };
        setIsStreaming(true);
      } else {
        stream.getTracks().forEach((t) => t.stop());
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
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    await startCamera(newMode);
  };

  const compressImage = (imageData: string): Promise<string> => {
    const isMulti = captureMode === 'multi';
    const w = isMulti ? 576 : 640;
    const q = isMulti ? 0.6 : 0.62;
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
    const maxWidth = isMulti ? 576 : 640;
    const quality = isMulti ? 0.6 : 0.62;
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

  const stopTimer = () => {
    if (timerRef.current != null) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
  };

  const runRecognize = async (images: string[]) => {
    if (images.length === 0) return;
    lastInputRef.current = images;
    setRecognitionFailed(false);
    setRecognitionTime(null);
    setElapsedTime(0);
    setForceAllDone(false);
    setNarrativeSteps(images.length > 1 ? buildMultiSteps(images.length) : SINGLE_STEPS);
    setIsRecognizing(true);

    timerStartRef.current = performance.now();
    stopTimer();
    const tick = () => {
      setElapsedTime(performance.now() - timerStartRef.current);
      timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);

    let ok = false;
    try {
      ok = await onRecognize(images);
    } catch (e) {
      console.error('[CameraStage] recognize error:', e);
      ok = false;
    } finally {
      stopTimer();
      const finalTime = performance.now() - timerStartRef.current;
      setElapsedTime(finalTime);
      setRecognitionTime(finalTime);
      if (ok) {
        // 让用户看到一次"全部 ✓"的完成感再收起遮罩
        setForceAllDone(true);
        await new Promise((r) => setTimeout(r, 260));
      }
      setIsRecognizing(false);
    }

    if (!ok) {
      setRecognitionFailed(true);
      return;
    }
    setCapturedImages([]);
    if (!keepPreviewAfterSuccess) {
      setCapturedImage(null);
    }
  };

  const handleCaptureClick = async () => {
    const frame = grabFrame();
    if (!frame) return;
    if (captureMode === 'single') {
      setCapturedImage(frame);
      await runRecognize([frame]);
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
    await runRecognize(capturedImages);
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
      await runRecognize([img]);
    } else {
      const remain = MAX_MULTI_IMAGES - capturedImages.length;
      const list = await Promise.all(valid.slice(0, remain).map(readFile));
      setCapturedImages((prev) => [...prev, ...list]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const switchMode = (mode: CaptureMode) => {
    if (mode === captureMode) return;
    setCaptureMode(mode);
    setCapturedImages([]);
  };

  const retryLast = () => {
    if (lastInputRef.current && lastInputRef.current.length > 0) {
      void runRecognize(lastInputRef.current);
    }
  };

  return (
    <div className="flex flex-col">
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
              id="onboard-multi-mode"
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
      <div className="flex items-center justify-center px-3 sm:px-4 pt-3 pb-4">
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
                    ? '对准商品拍照，AI 自动识别年份、工艺与背景故事'
                    : `多角度拍摄（最多 ${MAX_MULTI_IMAGES} 张），合并送 AI 综合识别`}
                </p>
              </div>
            </div>
          )}

          {isRecognizing && (
            <div className="absolute inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center animate-fade-in px-6">
              <div className="w-full max-w-[18rem] text-white">
                {/* 顶部小标 */}
                <div className="flex items-center gap-2 mb-5">
                  <Loader2 className="w-4 h-4 animate-spin text-accent" strokeWidth={2} />
                  <span className="text-[13px] tracking-wide font-medium">AI 正在识别</span>
                  <Sparkles className="w-3.5 h-3.5 text-accent/80 animate-pulse-glow ml-auto" />
                </div>

                {/* 步骤列表 */}
                <ul className="space-y-2.5">
                  {narrativeSteps.map((step, i) => {
                    const done = i < currentStepIndex;
                    const active = i === currentStepIndex && !forceAllDone;
                    const allDone = forceAllDone;
                    const isDone = done || allDone;
                    return (
                      <li
                        key={i}
                        className={`flex items-center gap-2.5 text-[13px] leading-tight transition-all duration-200 ${
                          isDone
                            ? 'text-accent'
                            : active
                              ? 'text-white'
                              : 'text-white/35'
                        }`}
                      >
                        <span
                          className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                            isDone
                              ? 'bg-accent/15 ring-1 ring-accent/40'
                              : active
                                ? 'bg-white/10 ring-1 ring-white/30'
                                : 'ring-1 ring-white/15'
                          }`}
                        >
                          {isDone ? (
                            <Check className="w-2.5 h-2.5 text-accent animate-scale-in" strokeWidth={3} />
                          ) : active ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin" strokeWidth={2.5} />
                          ) : null}
                        </span>
                        <span className="truncate">
                          {step.label}
                          {active && <span className="inline-block ml-1 animate-pulse">···</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {/* 计时器(辅助信息) */}
                <div className="mt-5 text-center text-[11px] text-white/45 tabular-nums">
                  {(elapsedTime / 1000).toFixed(1)}s
                </div>
              </div>
            </div>
          )}


          {!isRecognizing && recognitionFailed && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center animate-fade-in p-6">
              <div className="text-center text-white space-y-4 max-w-xs">
                <div className="w-14 h-14 mx-auto rounded-full bg-destructive/20 ring-1 ring-destructive/40 flex items-center justify-center">
                  <X className="w-8 h-8 text-destructive" strokeWidth={2} />
                </div>
                <div className="space-y-1">
                  <p className="font-display text-lg">识别未成功</p>
                  <p className="text-white/60 text-xs leading-relaxed">网络较慢或商品角度不清，请检查信号或换个角度后重试。</p>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button size="sm" onClick={retryLast}>
                    <RotateCcw className="w-4 h-4 mr-1.5" /> 重新识别
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRecognitionFailed(false)}>
                    取消
                  </Button>
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
                    id="onboard-start-camera"
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

              {capturedImage && !isRecognizing && !recognitionFailed && (
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
    </div>
  );
});
