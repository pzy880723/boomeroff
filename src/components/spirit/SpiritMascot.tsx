import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import mascot from '@/assets/spirit-mascot.png';
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 仅 idle 时随机播放彩蛋动作；其他状态不打扰
  useEffect(() => {
    if (disableActions || state !== 'idle') {
      setActionClass('');
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    let cancelled = false;

    const schedule = () => {
      const delay = 4000 + Math.random() * 5000; // 4~9s
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        const cls = randomIdleAction();
        setActionClass(cls);
        // 动画时长大约 1.2s 后清除
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
            key={actionClass /* 重新触发动画 */}
            className={cn('relative w-full h-full', actionClass)}
          >
            <img
              src={mascot}
              alt=""
              width={size}
              height={size}
              loading="lazy"
              className="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.25)] select-none pointer-events-none"
              draggable={false}
            />
            {/* 眨眼覆盖 */}
            <span
              className="spirit-blink absolute"
              style={{
                top: '38%',
                left: '34%',
                width: '8%',
                height: '3%',
                background: 'rgba(60,40,30,0.95)',
                borderRadius: '50%',
              }}
            />
            <span
              className="spirit-blink absolute"
              style={{
                top: '38%',
                right: '34%',
                width: '8%',
                height: '3%',
                background: 'rgba(60,40,30,0.95)',
                borderRadius: '50%',
              }}
            />
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
