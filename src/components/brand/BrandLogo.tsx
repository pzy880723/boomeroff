import brand from '@/assets/boomer-off-wordmark.png.asset.json';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  /** height in px, default 24 */
  size?: number;
  alt?: string;
}

/**
 * BOOMER-OFF 品牌 wordmark (纯朱红文字 logo)。
 * 全站统一入口 — 更换 logo 时只需替换 asset。
 */
export function BrandLogo({ className, size = 24, alt = 'BOOMER-OFF' }: Props) {
  return (
    <img
      src={brand.url}
      alt={alt}
      style={{ height: size }}
      className={cn('w-auto object-contain select-none', className)}
      draggable={false}
    />
  );
}
