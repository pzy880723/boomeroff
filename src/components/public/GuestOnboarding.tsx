import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface OnboardStep {
  /** 高亮目标元素 id；不传或找不到时，渲染居中插画卡 */
  targetId?: string;
  title: string;
  desc: string;
  /** 气泡相对高亮区放在上方还是下方；默认自动 */
  placement?: 'top' | 'bottom' | 'auto';
  /** 高亮形状：默认 rounded；底部 tab 用 pill */
  shape?: 'rounded' | 'pill' | 'square';
  /** 居中插画卡用的图标 */
  icon?: LucideIcon;
}

interface Props {
  steps: OnboardStep[];
  onDone: () => void;
  /** 进入页面到出现遮罩的延迟（ms） */
  startDelay?: number;
}

const PADDING = 8;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readRect(id: string): Rect | null {
  const el = document.getElementById(id);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function GuestOnboarding({ steps, onDone, startDelay = 400 }: Props) {
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vw, setVw] = useState(() =>
    typeof window === 'undefined' ? 0 : window.innerWidth,
  );
  const [vh, setVh] = useState(() =>
    typeof window === 'undefined' ? 0 : window.innerHeight,
  );

  const step = steps[stepIndex];

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), startDelay);
    return () => clearTimeout(t);
  }, [startDelay]);

  useLayoutEffect(() => {
    if (!visible || !step) return;
    let raf = 0;
    const measure = () => {
      const r = step.targetId ? readRect(step.targetId) : null;
      setRect(r);
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    measure();
    raf = window.setTimeout(measure, 80) as unknown as number;
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.clearTimeout(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [visible, step]);

  if (!visible || !step) return null;

  const isLast = stepIndex === steps.length - 1;

  const radius =
    step.shape === 'pill' ? 9999 : step.shape === 'square' ? 8 : 16;

  const hi = rect
    ? {
        top: Math.max(0, rect.top - PADDING),
        left: Math.max(0, rect.left - PADDING),
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      }
    : null;

  let bubbleTop = 0;
  let bubblePlacement: 'top' | 'bottom' = 'bottom';
  if (hi) {
    const spaceBelow = vh - (hi.top + hi.height);
    const spaceAbove = hi.top;
    bubblePlacement =
      step.placement === 'top'
        ? 'top'
        : step.placement === 'bottom'
        ? 'bottom'
        : spaceBelow > 220 || spaceBelow > spaceAbove
        ? 'bottom'
        : 'top';
    bubbleTop =
      bubblePlacement === 'bottom' ? hi.top + hi.height + 12 : hi.top - 12;
  }

  const handleNext = () => {
    if (isLast) {
      setVisible(false);
      onDone();
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const handleSkip = () => {
    setVisible(false);
    onDone();
  };

  const Icon = step.icon;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="使用引导"
    >
      {/* 遮罩 + 高亮挖洞 */}
      {hi ? (
        <>
          <div
            className="absolute left-0 right-0 top-0 bg-black/60"
            style={{ height: hi.top }}
          />
          <div
            className="absolute left-0 right-0 bg-black/60"
            style={{ top: hi.top + hi.height, bottom: 0 }}
          />
          <div
            className="absolute bg-black/60"
            style={{
              top: hi.top,
              left: 0,
              width: hi.left,
              height: hi.height,
            }}
          />
          <div
            className="absolute bg-black/60"
            style={{
              top: hi.top,
              left: hi.left + hi.width,
              right: 0,
              height: hi.height,
            }}
          />
          <div
            className="absolute pointer-events-none ring-2 ring-accent/80 shadow-[0_0_0_4px_hsl(var(--accent)/0.25)]"
            style={{
              top: hi.top,
              left: hi.left,
              width: hi.width,
              height: hi.height,
              borderRadius: radius,
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      )}

      {/* 气泡 / 插画卡 */}
      <div
        className={cn(
          'absolute left-1/2 -translate-x-1/2 w-[min(22rem,calc(100vw-2rem))]',
          'rounded-2xl bg-background text-foreground shadow-elevated ring-1 ring-border',
          'p-4 animate-in fade-in slide-in-from-bottom-2 duration-200',
        )}
        style={{
          top: hi
            ? bubblePlacement === 'bottom'
              ? bubbleTop
              : undefined
            : '50%',
          bottom:
            hi && bubblePlacement === 'top' ? vh - bubbleTop : undefined,
          transform: hi
            ? 'translate(-50%, 0)'
            : 'translate(-50%, -50%)',
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground tabular-nums">
            {stepIndex + 1} / {steps.length}
          </span>
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1 rounded-full transition-all',
                  i === stepIndex ? 'w-5 bg-accent' : 'w-1.5 bg-border',
                )}
              />
            ))}
          </div>
        </div>

        {!hi && Icon && (
          <div className="my-2 flex items-center justify-center">
            <span className="w-14 h-14 rounded-2xl bg-accent/15 text-accent flex items-center justify-center ring-1 ring-accent/30">
              <Icon className="w-7 h-7" strokeWidth={1.6} />
            </span>
          </div>
        )}

        <h3 className={cn(
          'font-display tracking-tight leading-tight',
          !hi ? 'text-[18px] text-center' : 'text-base',
        )}>
          {step.title}
        </h3>
        <p className={cn(
          'mt-1.5 text-[13px] text-muted-foreground leading-relaxed',
          !hi && 'text-center',
        )}>
          {step.desc}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-muted-foreground hover:text-foreground"
          >
            跳过
          </Button>
          <Button size="sm" onClick={handleNext} className="px-4">
            {isLast ? '开始体验' : '下一步'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
