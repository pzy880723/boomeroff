// 活动分享海报：实时根据 window.location.origin 生成二维码与海报图片
// 设计：中古和风纸质海报，仪式感、印章、衬线大标题
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Copy } from 'lucide-react';
import { buildActivityShareUrl } from '@/lib/voucher';
import { toast } from 'sonner';
import brandLogo from '@/assets/boomer-off-vintage-logo.png';

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
const H = 1334;

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
  let i = 0;
  const chars = Array.from(text);
  while (i < chars.length) {
    const test = current + chars[i];
    if (ctx.measureText(test).width > maxWidth) {
      if (lines.length === maxLines - 1) {
        // last allowed line: fit remaining + ellipsis
        let remaining = chars.slice(i).join('');
        let lastLine = current;
        while (remaining.length && ctx.measureText(lastLine + '…').width > maxWidth) {
          lastLine = lastLine.slice(0, -1);
        }
        lines.push(lastLine + '…');
        return lines;
      }
      lines.push(current);
      current = chars[i];
    } else {
      current = test;
    }
    i++;
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

      // 色板 —— 中古和风纸
      const C_PAPER_TOP = '#f7f0e0';
      const C_PAPER_BOT = '#ede2cb';
      const C_INK = '#1c1816';
      const C_INK_SOFT = '#5a4f44';
      const C_INK_MUTE = '#9a8b7a';
      const C_ACCENT = '#b3331d'; // 朱印红
      const C_LINE = '#8b7a64';
      const C_CARD = '#fbf6ea';

      // 1. 纸质底色
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, C_PAPER_TOP);
      bg.addColorStop(1, C_PAPER_BOT);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // 纸质噪点
      const noise = ctx.createImageData(W, H);
      for (let i = 0; i < noise.data.length; i += 4) {
        const v = (Math.random() - 0.5) * 14;
        noise.data[i] = noise.data[i + 1] = noise.data[i + 2] = 0;
        noise.data[i + 3] = Math.max(0, v);
      }
      ctx.putImageData(noise, 0, 0);

      // 2. 双线外框
      const M = 36;
      ctx.strokeStyle = C_LINE;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(M, M, W - M * 2, H - M * 2);
      ctx.lineWidth = 0.8;
      ctx.strokeRect(M + 8, M + 8, W - (M + 8) * 2, H - (M + 8) * 2);

      // 3. 顶部品牌区：logo 居中 + 两侧装饰线 + 副标题
      const headerY = M + 56;
      const logoImg = await loadImage(brandLogo);
      if (logoImg) {
        const logoH = 88;
        const logoW = logoImg.naturalWidth * (logoH / logoImg.naturalHeight);
        const lx = (W - logoW) / 2;
        ctx.drawImage(logoImg, lx, headerY, logoW, logoH);
        // 两侧细线
        ctx.strokeStyle = C_LINE;
        ctx.lineWidth = 1;
        const lineY = headerY + logoH / 2;
        ctx.beginPath();
        ctx.moveTo(M + 60, lineY); ctx.lineTo(lx - 24, lineY);
        ctx.moveTo(lx + logoW + 24, lineY); ctx.lineTo(W - M - 60, lineY);
        ctx.stroke();
      }

      // 副标题 tracking-wide
      ctx.fillStyle = C_INK_SOFT;
      ctx.font = '500 16px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const sub = '中  古  邀  请  函';
      ctx.fillText(sub, W / 2, headerY + 100);

      // 朱印小章 ——「活动」
      const sealX = W / 2 - 32, sealY = headerY + 138, sealS = 64;
      ctx.fillStyle = C_ACCENT;
      ctx.fillRect(sealX, sealY, sealS, sealS);
      ctx.fillStyle = '#fff';
      ctx.font = '700 22px "STSong", "SimSun", "Songti SC", serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('活动', sealX + sealS / 2, sealY + sealS / 2 + 1);
      // 印章纹理破损感
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fillRect(sealX + Math.random() * sealS, sealY + Math.random() * sealS, Math.random() * 2 + 1, Math.random() * 2 + 1);
      }
      ctx.globalCompositeOperation = 'source-over';

      let cursorY = sealY + sealS + 36;

      // 4. 封面（可选）
      const cardX = M + 36;
      const cardW = W - (M + 36) * 2;
      if (activity.cover_url) {
        const img = await loadImage(activity.cover_url);
        if (img && !cancelled) {
          const coverH = 280;
          // 阴影
          ctx.fillStyle = 'rgba(28,24,22,0.18)';
          ctx.fillRect(cardX + 4, cursorY + 6, cardW, coverH);
          // 裁剪
          ctx.save();
          ctx.beginPath();
          ctx.rect(cardX, cursorY, cardW, coverH);
          ctx.clip();
          const iw = img.naturalWidth, ih = img.naturalHeight;
          const scale = Math.max(cardW / iw, coverH / ih);
          const dw = iw * scale, dh = ih * scale;
          ctx.drawImage(img, cardX + (cardW - dw) / 2, cursorY + (coverH - dh) / 2, dw, dh);
          ctx.restore();
          // 细边框
          ctx.strokeStyle = C_INK;
          ctx.lineWidth = 1;
          ctx.strokeRect(cardX, cursorY, cardW, coverH);
          cursorY += coverH + 40;
        }
      }

      // 5. 标题 —— 衬线大字
      ctx.fillStyle = C_INK;
      ctx.font = '700 52px "STSong", "Songti SC", "SimSun", "PingFang SC", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const titleLines = wrapText(ctx, activity.name, cardW, 2);
      for (const line of titleLines) {
        ctx.fillText(line, W / 2, cursorY);
        cursorY += 64;
      }

      // 标题装饰：菱形分隔符
      cursorY += 10;
      const diamondY = cursorY + 6;
      ctx.fillStyle = C_ACCENT;
      ctx.save();
      ctx.translate(W / 2, diamondY);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
      ctx.strokeStyle = C_LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 120, diamondY); ctx.lineTo(W / 2 - 18, diamondY);
      ctx.moveTo(W / 2 + 18, diamondY); ctx.lineTo(W / 2 + 120, diamondY);
      ctx.stroke();
      cursorY += 30;

      // 6. 描述
      if (activity.description) {
        ctx.fillStyle = C_INK_SOFT;
        ctx.font = '400 22px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        const descLines = wrapText(ctx, activity.description, cardW - 40, 2);
        for (const line of descLines) {
          ctx.fillText(line, W / 2, cursorY);
          cursorY += 34;
        }
      }

      // 7. 状态徽章（审核/免审核）—— 描边小标签
      cursorY += 18;
      const badgeText = activity.requires_review ? '需 · 审 · 核' : '免 · 审 · 核';
      ctx.font = '500 16px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      const bw = ctx.measureText(badgeText).width + 32;
      const bh = 30;
      const bx = (W - bw) / 2;
      ctx.strokeStyle = C_INK;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, cursorY, bw, bh);
      ctx.strokeRect(bx + 3, cursorY + 3, bw - 6, bh - 6);
      ctx.fillStyle = C_INK;
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, W / 2, cursorY + bh / 2 + 1);

      // 8. 二维码区 —— 居中卡片
      const qrCardY = H - 360;
      const qrCardX = M + 60;
      const qrCardW = W - (M + 60) * 2;
      const qrCardH = 280;

      // 卡片底色
      ctx.fillStyle = C_CARD;
      ctx.fillRect(qrCardX, qrCardY, qrCardW, qrCardH);
      ctx.strokeStyle = C_INK;
      ctx.lineWidth = 1;
      ctx.strokeRect(qrCardX, qrCardY, qrCardW, qrCardH);

      // 二维码
      const qrSize = 220;
      const qrDataUrl = await QRCode.toDataURL(url, {
        margin: 1,
        width: qrSize,
        errorCorrectionLevel: 'H',
        color: { dark: C_INK, light: '#00000000' },
      });
      const qrImg = await loadImage(qrDataUrl);
      const qrY = qrCardY + (qrCardH - qrSize) / 2;
      if (qrImg) {
        ctx.drawImage(qrImg, qrCardX + 26, qrY, qrSize, qrSize);
      }

      // 右侧文字
      const textX = qrCardX + 26 + qrSize + 28;
      ctx.fillStyle = C_INK;
      ctx.font = '700 26px "STSong", "Songti SC", "SimSun", serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('扫 码', textX, qrY + 30);
      ctx.fillText('参 与', textX, qrY + 70);
      // 红线
      ctx.fillStyle = C_ACCENT;
      ctx.fillRect(textX, qrY + 116, 40, 3);
      ctx.fillStyle = C_INK_SOFT;
      ctx.font = '400 16px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('长按识别二维码', textX, qrY + 134);
      ctx.fillText('或截图保存分享', textX, qrY + 160);

      // 9. 底部签名行
      ctx.textAlign = 'center';
      ctx.fillStyle = C_INK_MUTE;
      ctx.font = '400 13px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('由  BOOMER · OFF  中  古  小  店  呈  上', W / 2, H - M - 30);


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
