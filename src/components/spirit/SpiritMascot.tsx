import { cn } from '@/lib/utils';
import mascot from '@/assets/spirit-mascot.png';

export type SpiritState = 'idle' | 'talking' | 'alert';

interface Props {
  size?: number;
  state?: SpiritState;
  className?: string;
  /** 隐藏背景光晕（用于聊天小头像） */
  flat?: boolean;
}

/** 中古小精灵 — 会漂浮、眨眼、说话时抖动 */
export function SpiritMascot({ size = 56, state = 'idle', className, flat = false }: Props) {
  const isTalking = state === 'talking';
  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* 背景光晕 */}
      {!flat && (
        <div
          className="absolute inset-0 rounded-full opacity-70"
          style={{
            background:
              'radial-gradient(circle at 50% 55%, hsl(var(--accent) / 0.45) 0%, hsl(var(--accent) / 0.15) 45%, transparent 70%)',
            filter: 'blur(2px)',
          }}
        />
      )}

      {/* 小精灵主体 */}
      <div className={cn('relative w-full h-full', isTalking ? 'spirit-talk' : 'spirit-float')}>
        <img
          src={mascot}
          alt=""
          width={size}
          height={size}
          className="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.25)] select-none pointer-events-none"
          draggable={false}
        />
        {/* 眨眼覆盖 — 极简: 两个小椭圆贴在眼睛位置 */}
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

      {/* 闪光小星 */}
      {!flat && (
        <>
          <span
            className="spirit-sparkle absolute text-[10px] leading-none"
            style={{ top: '10%', right: '6%', color: 'hsl(var(--accent))' }}
          >✦</span>
          <span
            className="spirit-sparkle absolute text-[8px] leading-none"
            style={{ bottom: '12%', left: '4%', color: 'hsl(var(--accent))', animationDelay: '0.8s' }}
          >✦</span>
        </>
      )}
    </div>
  );
}
