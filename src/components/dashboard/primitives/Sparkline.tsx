import { cn } from '@/lib/utils';

interface Props {
  data: number[];
  className?: string;
  height?: number;
  accent?: string;
}

/** 7 天迷你柱状图 */
export function Sparkline({ data, className, height = 36, accent = 'hsl(var(--accent))' }: Props) {
  const max = Math.max(1, ...data);
  return (
    <div className={cn('flex items-end gap-1', className)} style={{ height }}>
      {data.map((v, i) => {
        const isLast = i === data.length - 1;
        const h = Math.max(3, (v / max) * 100);
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="flex-1 w-full flex items-end">
              <div
                className="w-full rounded-sm transition-all duration-700 ease-out"
                style={{
                  height: `${h}%`,
                  background: isLast ? accent : 'hsl(var(--primary-foreground) / 0.18)',
                  boxShadow: isLast ? `0 0 8px ${accent}` : 'none',
                  opacity: isLast ? 1 : 0.85,
                }}
                title={`${v}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
