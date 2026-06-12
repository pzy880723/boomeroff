import { cn } from '@/lib/utils';
import idle from '@/assets/boomer/boomer-idle.png';
import wave from '@/assets/boomer/boomer-wave.png';
import think from '@/assets/boomer/boomer-think.png';
import cheer from '@/assets/boomer/boomer-cheer.png';
import scratch from '@/assets/boomer/boomer-scratch.png';
import sleep from '@/assets/boomer/boomer-sleep.png';
import bow from '@/assets/boomer/boomer-bow.png';
import avatar from '@/assets/boomer/boomer-avatar.png';

export type SpiritState =
  | 'idle'
  | 'talking'
  | 'thinking'
  | 'alert'
  | 'hover'
  | 'dragging'
  | 'wave'
  | 'cheer'
  | 'scratch'
  | 'sleep'
  | 'bow'
  | 'avatar';

const STATE_IMAGE: Record<SpiritState, string> = {
  idle,
  talking: wave,
  thinking: think,
  alert: scratch,
  hover: wave,
  dragging: idle,
  wave,
  cheer,
  scratch,
  sleep,
  bow,
  avatar,
};

interface Props {
  size?: number;
  state?: SpiritState;
  className?: string;
  /** 隐藏背景光晕（用于聊天小头像） */
  flat?: boolean;
  /** 关闭随机彩蛋动作（小头像场景） */
  disableActions?: boolean;
}

/** BOOMER · 禅意小水獭 — 中古门店里你的修行搭子 */
export function SpiritMascot({
  size = 56,
  state = 'idle',
  className,
  flat = false,
  disableActions = false,
}: Props) {
  const src = STATE_IMAGE[state] || idle;
  const showThinking = state === 'thinking';
  const showAlertPing = state === 'alert';
  const isCheer = state === 'cheer';

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
            state === 'hover' || isCheer ? 'opacity-100' : 'opacity-70',
          )}
          style={{
            background:
              'radial-gradient(circle at 50% 55%, hsl(var(--accent) / 0.45) 0%, hsl(var(--accent) / 0.15) 45%, transparent 70%)',
            filter: 'blur(2px)',
          }}
        />
      )}

      {/* 主体 */}
      <div
        className={cn(
          'relative w-full h-full',
          !disableActions && !isCheer && 'spirit-float-soft',
          isCheer && 'animate-bounce',
        )}
        style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))' }}
      >
        <img
          src={src}
          alt="BOOMER"
          width={size}
          height={size}
          loading="lazy"
          className="w-full h-full object-contain select-none pointer-events-none"
          draggable={false}
        />
      </div>

      {/* thinking 三个小点 */}
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
              animationDuration: showAlertPing || isCheer ? '1s' : '2.6s',
            }}
          >✦</span>
          <span
            className="spirit-sparkle absolute text-[8px] leading-none pointer-events-none"
            style={{
              bottom: '12%',
              left: '4%',
              color: 'hsl(var(--accent))',
              animationDelay: '0.8s',
              animationDuration: showAlertPing || isCheer ? '1s' : '2.6s',
            }}
          >✦</span>
        </>
      )}
    </div>
  );
}
