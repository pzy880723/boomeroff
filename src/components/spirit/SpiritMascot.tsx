import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import mascot from '@/assets/spirit-mascot.png';
import idleVideo from '@/assets/spirit/idle.webm';
import waveVideo from '@/assets/spirit/wave.webm';
import idleApng from '@/assets/spirit/idle-anim.png';
import waveApng from '@/assets/spirit/wave-anim.png';
import { randomIdleAction } from './spiritMoods';

export type SpiritState =
  | 'idle'
  | 'talking'
  | 'thinking'
  | 'alert'
  | 'hover'
  | 'dragging';

interface Props {
  size?: number;
  state?: SpiritState;
  className?: string;
  /** 隐藏背景光晕（用于聊天小头像） */
  flat?: boolean;
  /** 关闭随机彩蛋动作（小头像场景） */
  disableActions?: boolean;
}

/** 中古小精灵 — 漂浮、眨眼、随机小动作 */
export function SpiritMascot({
  size = 56,
  state = 'idle',
  className,
  flat = false,
  disableActions = false,
}: Props) {
  const [actionClass, setActionClass] = useState<string>('');
  // 0 = webm, 1 = apng, 2 = static png
  const [tier, setTier] = useState<0 | 1 | 2>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hover / alert / talking → 播挥手；其他状态播 idle 循环
  const wantWave =
    !disableActions && (state === 'hover' || state === 'alert' || state === 'talking');
  const videoSrc = wantWave ? waveVideo : idleVideo;
  const apngSrc = wantWave ? waveApng : idleApng;

  // 切源时让 video 从头播放
  useEffect(() => {
    if (tier !== 0) return;
    const v = videoRef.current;
    if (!v) return;
    try { v.currentTime = 0; v.play().catch(() => {}); } catch {}
  }, [videoSrc, tier]);

  // WebM 加载超时兜底：3s 内没拿到帧 → 切 APNG
  useEffect(() => {
    if (tier !== 0) return;
    const v = videoRef.current;
    if (!v) return;
    const t = setTimeout(() => {
      if (v.readyState < 2) setTier(1);
    }, 3000);
    return () => clearTimeout(t);
  }, [videoSrc, tier]);

  // 仅 idle 时随机叠加一点 CSS 微动作（让整体不死板）
  useEffect(() => {
    if (disableActions || state !== 'idle') {
      setActionClass('');
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    let cancelled = false;
    const schedule = () => {
      const delay = 6000 + Math.random() * 6000;
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        setActionClass(randomIdleAction());
        timerRef.current = setTimeout(() => {
          if (cancelled) return;
          setActionClass('');
          schedule();
        }, 1300);
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, disableActions]);

  // 各状态对应的中层动画
  const midAnim =
    state === 'talking'
      ? 'spirit-talk'
      : state === 'dragging'
      ? 'spirit-wiggle'
      : 'spirit-float';

  const showThinking = state === 'thinking';
  const showAlertPing = state === 'alert';

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* 背景光晕 */}
      {!flat && (
        <div
          className={cn(
            'absolute inset-0 rounded-full transition-opacity duration-300',
            state === 'hover' ? 'opacity-100' : 'opacity-70',
          )}
          style={{
            background:
              'radial-gradient(circle at 50% 55%, hsl(var(--accent) / 0.45) 0%, hsl(var(--accent) / 0.15) 45%, transparent 70%)',
            filter: 'blur(2px)',
          }}
        />
      )}

      {/* 外层：左右轻摆 */}
      <div className={cn('relative w-full h-full', !disableActions && 'spirit-sway')}>
        {/* 中层：呼吸/浮动/说话/拖动 */}
        <div className={cn('relative w-full h-full', midAnim)}>
          {/* 内层：一次性彩蛋动作 */}
          <div
            key={actionClass}
            className={cn(
              'relative w-full h-full',
              actionClass,
            )}
            style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))' }}
          >
            {videoFailed ? (
              <img
                src={mascot}
                alt=""
                width={size}
                height={size}
                loading="lazy"
                className="w-full h-full object-contain select-none pointer-events-none"
                draggable={false}
              />
            ) : (
              <video
                ref={videoRef}
                key={videoSrc}
                src={videoSrc}
                width={size}
                height={size}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                onError={() => setVideoFailed(true)}
                onLoadedData={() => {
                  // 部分浏览器不支持 vp9 alpha，会渲染成黑色 —
                  // 通过解码首帧像素检测：抽样若全黑，则回退到 PNG
                  const v = videoRef.current;
                  if (!v) return;
                  try {
                    const c = document.createElement('canvas');
                    c.width = 16; c.height = 16;
                    const ctx = c.getContext('2d');
                    if (!ctx) return;
                    ctx.clearRect(0, 0, 16, 16);
                    ctx.drawImage(v, 0, 0, 16, 16);
                    const data = ctx.getImageData(0, 0, 16, 16).data;
                    let opaque = 0;
                    for (let i = 3; i < data.length; i += 4) if (data[i] > 20) opaque++;
                    // 没有任何半透明像素说明 alpha 通道丢失（被当成实体）
                    // 或全透明（错误抠图）→ fallback
                    if (opaque === 0 || opaque === 256) setVideoFailed(true);
                  } catch { /* CORS/SecurityError 时忽略 */ }
                }}
                className="w-full h-full object-contain select-none pointer-events-none"
              />
            )}
          </div>
        </div>
      </div>

      {/* thinking：头顶三个小点 */}
      {showThinking && (
        <div
          className="absolute flex gap-1 items-end"
          style={{ top: '-6%', left: '50%', transform: 'translateX(-50%)' }}
        >
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="spirit-think-dot inline-block rounded-full bg-foreground/80"
              style={{
                width: Math.max(3, size * 0.06),
                height: Math.max(3, size * 0.06),
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* 闪光小星 */}
      {!flat && (
        <>
          <span
            className="spirit-sparkle absolute text-[10px] leading-none"
            style={{
              top: '10%',
              right: '6%',
              color: 'hsl(var(--accent))',
              animationDuration: showAlertPing ? '1s' : '2.6s',
            }}
          >✦</span>
          <span
            className="spirit-sparkle absolute text-[8px] leading-none"
            style={{
              bottom: '12%',
              left: '4%',
              color: 'hsl(var(--accent))',
              animationDelay: '0.8s',
              animationDuration: showAlertPing ? '1s' : '2.6s',
            }}
          >✦</span>
        </>
      )}
    </div>
  );
}
