import { Check } from 'lucide-react';

interface StepBarProps {
  steps: string[];
  current: number; // 0-based index of current step (in-progress)
}

/**
 * 紧凑型步骤指引条:已完成/当前/未来三态。100% 简体中文,无英文。
 */
export function StepBar({ steps, current }: StepBarProps) {
  return (
    <div className="flex items-center gap-1.5 px-0.5">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center gap-1.5 flex-1 min-w-0">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-medium shrink-0 transition-colors ${
                done
                  ? 'bg-primary text-primary-foreground'
                  : active
                  ? 'bg-primary/15 text-primary ring-2 ring-primary/40'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span
              className={`text-[11px] truncate ${
                active ? 'text-foreground font-medium' : 'text-muted-foreground'
              }`}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className={`h-px flex-1 ${done ? 'bg-primary/60' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
