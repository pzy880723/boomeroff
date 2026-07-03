import { APP_BRAND_LOGO, APP_BRAND_NAME, APP_BRAND_TAGLINE } from '@/assets/brand';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  /** logo 像素高度，默认 28 */
  size?: number;
  /** 是否显示右侧文字（品牌 + slogan），默认 true */
  showText?: boolean;
}

/**
 * BOOMER GO 门店运营系统 - 全站统一品牌入口。
 * 更换 logo 时替换 src/assets/boomer-go-logo.png 即可。
 */
export function BrandLogo({ className, size = 28, showText = true }: Props) {
  return (
    <div className={cn('flex items-center gap-2 select-none', className)}>
      <img
        src={APP_BRAND_LOGO}
        alt={APP_BRAND_NAME}
        style={{ height: size, width: size }}
        className="object-contain rounded-md"
        draggable={false}
      />
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className="text-[15px] font-black tracking-wide text-foreground">{APP_BRAND_NAME}</span>
          <span className="text-[10px] text-muted-foreground -mt-0.5">{APP_BRAND_TAGLINE}</span>
        </div>
      )}
    </div>
  );
}
