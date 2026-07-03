import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  /** Pixel height of the wordmark; width auto-scales. */
  height?: number;
  /** Override color (defaults to brand red). */
  color?: string;
  title?: string;
}

/**
 * BOOMER GO 品牌横排文字 mark。
 * 用内联 SVG 渲染,天生透明背景,任意底色都不出白边。
 */
export function BrandWordmark({
  className,
  height = 20,
  color = 'hsl(var(--primary))',
  title = 'BOOMER GO',
}: Props) {
  // viewBox 宽高比按实际字形匹配 (~4.2:1)
  const w = Math.round(height * 4.2);
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox="0 0 420 100"
      width={w}
      height={height}
      className={cn('select-none', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <text
        x="210"
        y="52"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily='"PingFang SC","HarmonyOS Sans SC",-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI","Helvetica Neue",Arial,sans-serif'
        fontWeight={900}
        fontSize="72"
        letterSpacing="-2"
        fill={color}
      >
        BOOMER GO
      </text>
    </svg>
  );
}
