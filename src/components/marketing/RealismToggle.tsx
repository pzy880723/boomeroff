import { cn } from '@/lib/utils';
import { REALISM_OPTIONS, type Realism } from '@/lib/realism';

interface Props {
  value: Realism;
  onChange: (v: Realism) => void;
  className?: string;
  size?: 'sm' | 'xs';
}

/** 画风分段选择器:插画风 / 真人写实。 */
export function RealismToggle({ value, onChange, className, size = 'sm' }: Props) {
  const isXs = size === 'xs';
  return (
    <div
      role="radiogroup"
      aria-label="画风"
      className={cn(
        'inline-flex items-center rounded-full border border-accent/20 bg-muted/40 p-0.5',
        className,
      )}
    >
      {REALISM_OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            title={o.hint}
            className={cn(
              'rounded-full transition-colors whitespace-nowrap',
              isXs ? 'px-2.5 py-0.5 text-[10px]' : 'px-3 py-1 text-[11px]',
              active
                ? 'bg-accent text-accent-foreground shadow-sm font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
