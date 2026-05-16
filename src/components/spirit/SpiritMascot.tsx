import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import mascot from '@/assets/spirit-mascot.png';
import idleApng from '@/assets/spirit/idle-anim.png';
import waveApng from '@/assets/spirit/wave-anim.png';
// 注：放弃 WebM/VP9-alpha（iOS Safari 渲染会带黑底），统一使用透明 APNG。

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

/** 中古小精灵 — 透明视频肢体动效 */
export function SpiritMascot({
  size = 56,
  state = 'idle',
  className,
  flat = false,
  disableActions = false,
}: Props) {
  const wantWave = !disableActions && (state === 'hover' || state === 'alert');
  const showThinking = state === 'thinking';
  const showAlertPing = state === 'alert';
  const [apngFailed, setApngFailed] = useState(false);

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
            'absolute inset-0 rounded-full transition-opacity duration-300 pointer-events-none',
            state === 'hover' ? 'opacity-100' : 'opacity-70',
          )}
          style={{
            background:
              'radial-gradient(circle at 50% 55%, hsl(var(--accent) / 0.45) 0%, hsl(var(--accent) / 0.15) 45%, transparent 70%)',
            filter: 'blur(2px)',
          }}
        />
      )}

      {/* 主体：透明 APNG（兼容 iOS Safari），失败回退静态 PNG */}
      <div
        className={cn(
          'relative w-full h-full',
          !disableActions && 'spirit-float-soft',
        )}
        style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))' }}
      >
        {apngFailed ? (
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
          <img
            src={wantWave ? waveApng : idleApng}
            alt=""
            width={size}
            height={size}
            onError={() => setApngFailed(true)}
            className="w-full h-full object-contain select-none pointer-events-none"
            draggable={false}
          />
        )}
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
            className="spirit-sparkle absolute text-[10px] leading-none pointer-events-none"
            style={{
              top: '10%',
              right: '6%',
              color: 'hsl(var(--accent))',
              animationDuration: showAlertPing ? '1s' : '2.6s',
            }}
          >✦</span>
          <span
            className="spirit-sparkle absolute text-[8px] leading-none pointer-events-none"
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
