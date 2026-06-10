// 抵用券海报：DOM 形态，可被 html-to-image 截图，也可直接展示
import { forwardRef } from 'react';
import { QrCanvas } from './QrCanvas';
import { type VoucherTemplate, formatVoucherRule } from '@/lib/voucher';

interface Props {
  voucher: Pick<VoucherTemplate, 'name' | 'threshold_type' | 'discount_amount' | 'min_spend' | 'valid_days' | 'template_terms'>;
  shareUrl: string;
  shortCode?: string | null;
}

export const VoucherPoster = forwardRef<HTMLDivElement, Props>(
  ({ voucher, shareUrl, shortCode }, ref) => {
    return (
      <div
        ref={ref}
        className="relative w-full overflow-hidden rounded-3xl"
        style={{
          aspectRatio: '3 / 4',
          background:
            'linear-gradient(135deg, #1f1409 0%, #3b2410 38%, #6b3a18 70%, #b48142 100%)',
          color: '#fff5e1',
          fontFamily: 'system-ui, -apple-system, "PingFang SC", sans-serif',
        }}
      >
        <div
          className="absolute -top-20 -right-16 w-64 h-64 rounded-full opacity-30 blur-3xl"
          style={{ background: '#f5c66e' }}
        />
        <div
          className="absolute -bottom-24 -left-10 w-72 h-72 rounded-full opacity-20 blur-3xl"
          style={{ background: '#ffd28a' }}
        />

        <div className="relative h-full p-6 flex flex-col">
          <div className="flex items-center justify-between">
            <div className="text-[11px] tracking-[0.3em] opacity-80">BOOMER-OFF</div>
            <div className="text-[11px] opacity-70">限量专属券</div>
          </div>

          <div className="mt-5">
            <div className="text-[13px] opacity-70">为你专属准备</div>
            <h2 className="mt-1 text-2xl font-semibold leading-tight tracking-wide">
              {voucher.name}
            </h2>
          </div>

          <div className="mt-6 flex items-baseline gap-1">
            <span className="text-3xl font-bold" style={{ color: '#ffd28a' }}>¥</span>
            <span
              className="font-bold tabular-nums leading-none"
              style={{ fontSize: '88px', color: '#ffd28a', letterSpacing: '-2px' }}
            >
              {voucher.discount_amount}
            </span>
          </div>
          <div className="mt-2 text-[15px] font-medium" style={{ color: '#ffe7bd' }}>
            {formatVoucherRule(voucher)}
          </div>
          <div className="mt-1 text-[12px] opacity-70">
            有效期 {voucher.valid_days} 天 · 仅到店消费
          </div>

          <div className="relative my-5">
            <div
              className="h-px w-full"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(to right, rgba(255,231,189,0.5) 0 6px, transparent 6px 12px)',
              }}
            />
          </div>

          <div className="mt-auto flex items-end gap-4">
            <div className="bg-white rounded-xl p-2 shrink-0">
              <QrCanvas value={shareUrl} size={120} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] opacity-80">扫码 / 长按识别领取</div>
              <div className="mt-1 text-[13px] font-mono break-all opacity-90">
                {shareUrl.replace(/^https?:\/\//, '')}
              </div>
              {shortCode && (
                <div
                  className="mt-2 inline-block px-2 py-1 rounded-md text-[11px] font-mono tracking-widest"
                  style={{ background: 'rgba(255,231,189,0.18)' }}
                >
                  券码 {shortCode}
                </div>
              )}
            </div>
          </div>

          {voucher.template_terms && (
            <p className="mt-4 text-[10px] opacity-60 leading-snug line-clamp-2">
              {voucher.template_terms}
            </p>
          )}
        </div>
      </div>
    );
  },
);
VoucherPoster.displayName = 'VoucherPoster';
