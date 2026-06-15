import { Check } from 'lucide-react';

interface StepBarProps {
  steps: string[];
  current: number; // 0-based index of current step (in-progress)
}

/**
 * 年鉴版步骤指引条:01/02 serif 序号 · 古铜金细线串联 · 居中陈列。
 */
export function StepBar({ steps, current }: StepBarProps) {
  return (
    <div className="flex items-center justify-center gap-2 px-0.5 flex-wrap">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const num = String(i + 1).padStart(2, '0');
        return (
          <div key={i} className="flex items-center gap-2 shrink-0">
            <div
              className={[
                'flex items-center justify-center w-7 h-7 rounded-full shrink-0 transition-all',
                done
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : active
                  ? 'bg-card text-accent ring-1 ring-accent/50 shadow-sm'
                  : 'bg-card text-muted-foreground/60 ring-1 ring-border',
              ].join(' ')}
            >
              {done ? (
                <Check className="w-3.5 h-3.5" strokeWidth={2.2} />
              ) : (
                <span className="font-display text-[11px] leading-none">{num}</span>
              )}
            </div>
            <span
              className={[
                'text-[11px] tracking-wide whitespace-nowrap',
                active ? 'text-foreground font-medium' : 'text-muted-foreground',
              ].join(' ')}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className={`h-px w-6 ${done ? 'bg-accent/60' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
