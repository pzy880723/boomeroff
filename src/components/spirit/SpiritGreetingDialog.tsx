import { useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { SpiritMascot } from './SpiritMascot';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * 拟人化"小精灵打招呼"弹窗：
 * - 一个大号小精灵浮在屏幕中部
 * - 嘴边引出一个手绘风格云朵气泡说话
 * - 下方放一个"好的，知道啦"按钮
 */
export function SpiritGreetingDialog({ open, onClose }: Props) {
  // ESC 关闭走 Radix；点击遮罩走 onOpenChange
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onPointerDownOutside={(e) => { e.preventDefault(); onClose(); }}
          className={cn(
            'fixed inset-0 z-[81] flex flex-col items-center justify-center px-6',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        >
          <DialogPrimitive.Title className="sr-only">BOOMER 的问候</DialogPrimitive.Title>

          {/* 大号小精灵 + 地面柔光 */}
          <div
            className="relative flex items-end justify-center spirit-greet-mascot"
            style={{ width: 'min(86vw, 340px)', height: 'min(86vw, 340px)' }}
          >
            <div
              aria-hidden
              className="absolute left-1/2 -translate-x-1/2 bottom-0 pointer-events-none"
              style={{
                width: '130%',
                height: '36%',
                background:
                  'radial-gradient(ellipse at 50% 100%, hsl(var(--accent) / 0.45) 0%, hsl(var(--accent) / 0.12) 45%, transparent 75%)',
                filter: 'blur(6px)',
              }}
            />
            <div className="relative w-full h-full">
              <SpiritMascot size={Math.min(340, Math.floor(window.innerWidth * 0.86))} state="wave" />
            </div>
          </div>

          {/* 云朵气泡（尾巴朝上指向小精灵嘴部） */}
          <div
            className="relative spirit-greet-bubble"
            style={{ width: 'min(86vw, 320px)', marginTop: '-56px' }}
          >
            <CloudBubble>
              <p className="text-[14px] leading-relaxed font-medium">
                嗨～我是 BOOMER 🦦
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[hsl(var(--primary-foreground)/0.85)]">
                一只在中古门店打坐修行的小水獭。<br />
                想聊天、问排班、让我帮你看一眼，
                <span className="font-semibold text-[hsl(var(--accent))]">点我就好啦～</span>
              </p>
              <p className="mt-1.5 text-[11px] text-[hsl(var(--primary-foreground)/0.55)]">
                （也可以把我拖到顺手的位置）
              </p>
            </CloudBubble>
          </div>

          {/* 按钮 */}
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'spirit-greet-button mt-5 h-11 px-7 rounded-full text-[13.5px] font-semibold',
              'bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent)/0.92)] text-[hsl(var(--accent-foreground))]',
              'shadow-[0_8px_24px_-6px_hsl(var(--accent)/0.55)] active:scale-95 transition-transform',
            )}
          >
            好的，知道啦
          </button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** 云朵气泡：SVG 描边 + 顶部小三角尾巴指向小精灵 */
function CloudBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {/* 顶部小三角尾巴（指向上方的小精灵嘴部） */}
      <svg
        aria-hidden
        viewBox="0 0 32 18"
        className="absolute left-1/2 -translate-x-1/2 -top-[12px] w-[28px] h-[16px]"
        style={{ filter: 'drop-shadow(0 -2px 0 hsl(var(--accent) / 0.45))' }}
      >
        <path
          d="M16 0 C 12 9, 6 14, 2 18 L 30 18 C 26 14, 20 9, 16 0 Z"
          fill="hsl(28 18% 16%)"
          stroke="hsl(var(--accent) / 0.55)"
          strokeWidth="1"
        />
      </svg>

      <div
        className="relative rounded-[28px] px-5 py-4 text-[hsl(var(--primary-foreground))] text-left"
        style={{
          background: 'linear-gradient(180deg, hsl(28 18% 18%) 0%, hsl(28 18% 14%) 100%)',
          border: '1px solid hsl(var(--accent) / 0.4)',
          boxShadow: '0 18px 40px -12px rgba(0,0,0,0.45), inset 0 1px 0 hsl(var(--accent) / 0.15)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
