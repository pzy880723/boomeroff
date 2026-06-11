// 活动分享海报：实时根据 window.location.origin 生成二维码与海报图片
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Copy } from 'lucide-react';
import { buildActivityShareUrl } from '@/lib/voucher';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activity: {
    name: string;
    description?: string | null;
    cover_url?: string | null;
    share_token: string;
    requires_review: boolean;
  } | null;
}

const W = 750;
const H = 1180;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const ch of text) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = ch;
      if (lines.length === maxLines - 1) {
        // last line, add ellipsis if overflow
        let rest = current;
        for (let i = 0; i < text.length; i++) {
          // append remaining chars until overflow then ellipsis
        }
        // simpler: take remaining text and truncate with ellipsis
        const idx = text.indexOf(ch);
        let remaining = text.slice(idx);
        while (remaining.length && ctx.measureText(remaining + '…').width > maxWidth) {
          remaining = remaining.slice(0, -1);
        }
        lines.push(remaining + (remaining.length < text.slice(idx).length ? '…' : ''));
        return lines;
      }
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function ActivityShareDialog({ open, onOpenChange, activity }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [generating, setGenerating] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string>('');

  useEffect(() => {
    if (!open || !activity) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    setGenerating(true);
    setDataUrl(null);

    // Real-time: read window.location.origin at click time
    const url = buildActivityShareUrl(activity.share_token);
    setShareUrl(url);

    (async () => {
      // Let loading frame paint first
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 50));

      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) { setGenerating(false); return; }

      // Background
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#f8fafc');
      bg.addColorStop(1, '#eef2f7');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Decorative top band
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, 90);

      // Brand
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 28px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('BOOMER-OFF', 40, 45);
      ctx.font = '400 18px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'right';
      ctx.fillText('限时活动 · 扫码参与', W - 40, 45);
      ctx.textAlign = 'left';

      // Card area
      const cardX = 40, cardY = 130, cardW = W - 80;
      // Cover
      let coverH = 0;
      if (activity.cover_url) {
        const img = await loadImage(activity.cover_url);
        if (img && !cancelled) {
          coverH = 320;
          ctx.save();
          // rounded clip
          const r = 20;
          ctx.beginPath();
          ctx.moveTo(cardX + r, cardY);
          ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + coverH, r);
          ctx.arcTo(cardX + cardW, cardY + coverH, cardX, cardY + coverH, r);
          ctx.arcTo(cardX, cardY + coverH, cardX, cardY, r);
          ctx.arcTo(cardX, cardY, cardX + cardW, cardY, r);
          ctx.closePath();
          ctx.clip();
          // cover-fit
          const iw = img.naturalWidth, ih = img.naturalHeight;
          const scale = Math.max(cardW / iw, coverH / ih);
          const dw = iw * scale, dh = ih * scale;
          const dx = cardX + (cardW - dw) / 2;
          const dy = cardY + (coverH - dh) / 2;
          ctx.drawImage(img, dx, dy, dw, dh);
          ctx.restore();
        }
      }

      let cursorY = cardY + (coverH ? coverH + 30 : 10);

      // Badge
      const badgeText = activity.requires_review ? '需审核' : '免审核';
      ctx.font = '500 20px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      const badgeW = ctx.measureText(badgeText).width + 28;
      const badgeH = 32;
      ctx.fillStyle = activity.requires_review ? '#fef3c7' : '#dcfce7';
      ctx.beginPath();
      ctx.roundRect(cardX, cursorY, badgeW, badgeH, 16);
      ctx.fill();
      ctx.fillStyle = activity.requires_review ? '#92400e' : '#166534';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, cardX + 14, cursorY + badgeH / 2);
      cursorY += badgeH + 24;

      // Title
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 44px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = 'top';
      const titleLines = wrapText(ctx, activity.name, cardW, 2);
      for (const line of titleLines) {
        ctx.fillText(line, cardX, cursorY);
        cursorY += 56;
      }
      cursorY += 8;

      // Description
      if (activity.description) {
        ctx.fillStyle = '#475569';
        ctx.font = '400 24px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
        const descLines = wrapText(ctx, activity.description, cardW, 3);
        for (const line of descLines) {
          ctx.fillText(line, cardX, cursorY);
          cursorY += 36;
        }
      }

      // QR area: bottom card
      const qrCardY = H - 440;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(cardX, qrCardY, cardW, 380, 24);
      ctx.fill();
      // subtle shadow line
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cardX, qrCardY, cardW, 4);

      // QR code
      const qrSize = 280;
      const qrDataUrl = await QRCode.toDataURL(url, {
        margin: 1,
        width: qrSize,
        errorCorrectionLevel: 'M',
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      const qrImg = await loadImage(qrDataUrl);
      if (qrImg) {
        ctx.drawImage(qrImg, (W - qrSize) / 2, qrCardY + 40, qrSize, qrSize);
      }

      // QR caption
      ctx.fillStyle = '#0f172a';
      ctx.font = '600 26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('长按或扫码参与活动', W / 2, qrCardY + qrSize + 60);
      ctx.font = '400 18px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText('长按图片保存到相册分享', W / 2, qrCardY + qrSize + 100);
      ctx.textAlign = 'left';

      if (cancelled) return;
      const out = canvas.toDataURL('image/png');
      setDataUrl(out);
      setGenerating(false);
    })().catch((e) => {
      console.error('[share-poster]', e);
      if (!cancelled) {
        setGenerating(false);
        toast.error('生成海报失败');
      }
    });

    return () => { cancelled = true; };
  }, [open, activity]);

  const handleDownload = () => {
    if (!dataUrl || !activity) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `活动-${activity.name}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); toast.success('链接已复制'); }
    catch { toast.success(shareUrl); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle className="text-base">分享活动海报</DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-3">
          <div className="aspect-[750/1180] w-full bg-muted rounded-lg overflow-hidden flex items-center justify-center relative">
            {generating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80 backdrop-blur-sm z-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">正在生成分享海报…</p>
              </div>
            )}
            {dataUrl && (
              // eslint-disable-next-line jsx-a11y/img-redundant-alt
              <img src={dataUrl} alt="分享海报" className="w-full h-full object-contain" />
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            移动端可长按图片保存到相册
          </p>
        </div>

        <div className="px-5 pb-5 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={handleCopyLink} disabled={!shareUrl}>
            <Copy className="w-4 h-4 mr-1.5" /> 复制链接
          </Button>
          <Button onClick={handleDownload} disabled={!dataUrl || generating}>
            <Download className="w-4 h-4 mr-1.5" /> 保存图片
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
