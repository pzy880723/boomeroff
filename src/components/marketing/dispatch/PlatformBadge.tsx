// 5 个平台彩色徽标。统一颜色风格,不引外部 SVG。
import { cn } from '@/lib/utils';

const META: Record<string, { label: string; bg: string; fg: string; icon: string }> = {
  douyin:       { label: '抖音',   bg: 'bg-black',                 fg: 'text-white',   icon: 'D' },
  xhs:          { label: '小红书', bg: 'bg-rose-500',              fg: 'text-white',   icon: '小' },
  wechat_video: { label: '视频号', bg: 'bg-emerald-500',           fg: 'text-white',   icon: '视' },
  kuaishou:     { label: '快手',   bg: 'bg-orange-500',            fg: 'text-white',   icon: 'K' },
  bilibili:     { label: 'B站',    bg: 'bg-pink-400',              fg: 'text-white',   icon: 'B' },
  tiktok:       { label: 'TikTok', bg: 'bg-neutral-900',           fg: 'text-white',   icon: 'T' },
};

export function PlatformBadge({ platform, size = 'sm', showLabel = false, className }: {
  platform: string; size?: 'xs' | 'sm' | 'md'; showLabel?: boolean; className?: string;
}) {
  const m = META[platform] || { label: platform, bg: 'bg-muted', fg: 'text-foreground', icon: '?' };
  const sz = size === 'xs' ? 'w-5 h-5 text-[10px]' : size === 'md' ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-xs';
  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      <div className={cn('rounded-md inline-flex items-center justify-center font-bold', sz, m.bg, m.fg)}>
        {m.icon}
      </div>
      {showLabel && <span className="text-xs text-foreground">{m.label}</span>}
    </div>
  );
}

export function platformLabel(p: string) { return META[p]?.label || p; }
