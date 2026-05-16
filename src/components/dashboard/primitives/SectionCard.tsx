import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  delay?: number;
}

/** 工作台暗色卡片：1px 暖色描边 + 极轻内发光，进场错峰淡入 */
export function SectionCard({ children, className, onClick, delay = 0 }: Props) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative rounded-2xl border border-[hsl(var(--accent)/0.18)] bg-[hsl(var(--accent)/0.05)] backdrop-blur-sm',
        'shadow-[inset_0_1px_0_hsl(var(--accent)/0.12)] animate-card-enter',
        onClick && 'cursor-pointer transition-transform hover:-translate-y-0.5 hover:bg-[hsl(var(--accent)/0.08)]',
        className,
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {children}
    </div>
  );
}
