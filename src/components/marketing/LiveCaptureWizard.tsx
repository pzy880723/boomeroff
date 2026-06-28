// 真人快拍向导:用前置摄像头按引导抓 3 张正脸/左侧/右侧照片,输出 File[]
// 设计目标:在不离开「新建角色」弹窗内,完成「采集→预览→重拍」闭环,质量自检后才允许下一步
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Check, AlertCircle, Loader2 } from 'lucide-react';

const SHOTS = [
  { key: 'front', label: '正脸平视', hint: '看向镜头,确保面部完整露出,光线均匀' },
  { key: 'left', label: '左转 45°', hint: '头向左微转,五官清晰' },
  { key: 'right', label: '右转 45°', hint: '头向右微转,五官清晰' },
] as const;

type Shot = { key: string; file: File; preview: string };

export function LiveCaptureWizard({
  onConfirm, disabled,
}: {
  onConfirm: (files: File[]) => void;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0..2 当前要拍的镜头
  const [shots, setShots] = useState<(Shot | null)[]>([null, null, null]);
  const [warn, setWarn] = useState<string | null>(null);

  useEffect(() => () => stop(), []);

  const start = async () => {
    if (active || starting) return;
    setStarting(true); setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play().catch(() => {});
      }
      setActive(true);
    } catch (e: any) {
      setErr(e?.message?.includes('Permission') ? '未授权摄像头,请在浏览器设置中允许后重试' : (e?.message || '无法启动摄像头'));
    } finally {
      setStarting(false);
    }
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  };

  const capture = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setWarn(null);
    const canvas = document.createElement('canvas');
    // 输出最长边 1280,够火山活体也够 reference image
    const maxSide = 1280;
    const ratio = Math.min(maxSide / Math.max(v.videoWidth, v.videoHeight), 1);
    canvas.width = Math.round(v.videoWidth * ratio);
    canvas.height = Math.round(v.videoHeight * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

    // 质量自检:最短边 ≥ 720 + 平均亮度在合理范围
    const minSide = Math.min(canvas.width, canvas.height);
    if (minSide < 720) { setWarn(`画面分辨率偏低(${minSide}px),建议靠近镜头或换更高清的摄像头`); }
    try {
      const sample = ctx.getImageData(0, 0, Math.min(64, canvas.width), Math.min(64, canvas.height)).data;
      let lum = 0;
      for (let i = 0; i < sample.length; i += 4) lum += 0.299 * sample[i] + 0.587 * sample[i + 1] + 0.114 * sample[i + 2];
      const avg = lum / (sample.length / 4);
      if (avg < 60) setWarn((p) => p || '画面太暗,建议补光后重拍');
      else if (avg > 230) setWarn((p) => p || '画面过曝,建议避开强光后重拍');
    } catch {}

    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.92));
    const file = new File([blob], `live-${SHOTS[step].key}-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const preview = URL.createObjectURL(blob);

    setShots((prev) => {
      const next = [...prev];
      if (next[step]?.preview) URL.revokeObjectURL(next[step]!.preview);
      next[step] = { key: SHOTS[step].key, file, preview };
      return next;
    });
    if (step < SHOTS.length - 1) setStep(step + 1);
    else stop();
  };

  const retake = (idx: number) => {
    setShots((prev) => {
      const next = [...prev];
      if (next[idx]?.preview) URL.revokeObjectURL(next[idx]!.preview);
      next[idx] = null;
      return next;
    });
    setStep(idx);
    setWarn(null);
    if (!active) start();
  };

  const allDone = shots.every(Boolean);
  const cur = SHOTS[step];

  return (
    <div className="space-y-2">
      {/* 取景框 */}
      <div className="relative aspect-square w-full bg-black rounded-md overflow-hidden border border-border">
        <video
          ref={videoRef}
          className={['w-full h-full object-cover', active ? '' : 'hidden'].join(' ')}
          autoPlay playsInline muted
          style={{ transform: 'scaleX(-1)' }}
        />
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/85">
            <Camera className="w-8 h-8 opacity-80" />
            <p className="text-[11.5px]">点击下方按钮启动前置摄像头</p>
            {err && <p className="text-[11px] text-red-300 px-4 text-center">{err}</p>}
            <Button size="sm" onClick={start} disabled={starting} className="mt-2">
              {starting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}启动摄像头
            </Button>
          </div>
        )}
        {active && (
          <>
            {/* 人脸引导椭圆 */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[55%] h-[72%] rounded-[50%] border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
              <span className="bg-black/60 text-white text-[11px] px-2 py-0.5 rounded">
                {step + 1} / {SHOTS.length} · {cur.label}
              </span>
              <button onClick={stop} className="bg-black/60 text-white text-[10px] px-2 py-0.5 rounded">关闭</button>
            </div>
            <p className="absolute bottom-14 left-0 right-0 text-center text-white text-[11px] px-3">{cur.hint}</p>
            <div className="absolute bottom-2 left-0 right-0 flex justify-center">
              <button
                onClick={capture}
                className="w-12 h-12 rounded-full bg-white border-4 border-white/60 active:scale-95 transition"
                aria-label="拍摄"
              />
            </div>
          </>
        )}
      </div>

      {warn && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{warn}</span>
        </div>
      )}

      {/* 3 张缩略 */}
      <div className="grid grid-cols-3 gap-1.5">
        {SHOTS.map((s, i) => (
          <div key={s.key} className="space-y-1">
            <div className={[
              'relative aspect-square rounded border overflow-hidden',
              shots[i] ? 'border-emerald-500/60' : i === step && active ? 'border-accent' : 'border-dashed border-border',
            ].join(' ')}>
              {shots[i] ? (
                <>
                  <img src={shots[i]!.preview} className="w-full h-full object-cover" alt={s.label} />
                  <span className="absolute top-0.5 right-0.5 bg-emerald-500 text-white w-4 h-4 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3" />
                  </span>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground bg-muted/30">
                  待拍
                </div>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground truncate">{s.label}</span>
              {shots[i] && (
                <button onClick={() => retake(i)} className="text-accent inline-flex items-center gap-0.5">
                  <RefreshCw className="w-2.5 h-2.5" />重拍
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Button
        className="w-full h-9"
        disabled={!allDone || disabled}
        onClick={() => onConfirm(shots.filter(Boolean).map((s) => s!.file))}
      >
        {allDone ? '使用这 3 张照片建角色并发起认证' : `还需拍 ${shots.filter((x) => !x).length} 张`}
      </Button>
    </div>
  );
}
