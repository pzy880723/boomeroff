// 活动分享海报：首次生成后上传到 storage，固化到 activities.poster_url，下次直接打开转发
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download } from 'lucide-react';
import { buildActivityShareUrl } from '@/lib/voucher';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';


interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activity: {
    id: string;
    name: string;
    description?: string | null;
    cover_url?: string | null;
    share_token: string;
    requires_review: boolean;
    poster_url?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
  } | null;
  onPosterSaved?: (url: string) => void;
}

const W = 750;
const H = 1334;
const POSTER_VERSION = 'v3';


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
    const ch = chars[i];
    if (ch === '\n') {
      lines.push(current);
      current = '';
      if (lines.length >= maxLines) return lines.slice(0, maxLines);
      i++;
      continue;
    }
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth) {
      if (lines.length === maxLines - 1) {
        let lastLine = current;
        while (lastLine.length && ctx.measureText(lastLine + '…').width > maxWidth) {
          lastLine = lastLine.slice(0, -1);
        }
        lines.push(lastLine + '…');
        return lines;
      }
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
    i++;
  }
  if (current) lines.push(current);
  return lines;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function ActivityShareDialog({ open, onOpenChange, activity, onPosterSaved }: Props) {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [generating, setGenerating] = useState(false);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !activity) {
      setDisplayUrl(null);
      return;
    }
    // 已有缓存 + 版本匹配 → 直接展示
    if (activity.poster_url && activity.poster_url.includes(`_${POSTER_VERSION}.png`)) {
      setDisplayUrl(activity.poster_url);
      return;
    }

    let cancelled = false;
    setGenerating(true);
    setDisplayUrl(null);

    const url = buildActivityShareUrl(activity.share_token);

    (async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 30));

      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) { setGenerating(false); return; }

      // —— 优惠券同款暖棕渐变色板 ——
      const C_BG_1 = '#1f1409';
      const C_BG_2 = '#3b2410';
      const C_BG_3 = '#6b3a18';
      const C_BG_4 = '#b48142';
      const C_GOLD = '#ffd28a';
      const C_GOLD_DEEP = '#f5c66e';
      const C_TEXT = '#fff5e1';
      const C_TEXT_SOFT = '#ffe7bd';
      const C_TEXT_MUTE = 'rgba(255, 245, 225, 0.65)';

      // 主背景
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, C_BG_1);
      bg.addColorStop(0.38, C_BG_2);
      bg.addColorStop(0.70, C_BG_3);
      bg.addColorStop(1, C_BG_4);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // 两个柔光圆斑（与券面呼应）
      const drawGlow = (cx: number, cy: number, r: number, color: string, alpha: number) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      };
      drawGlow(W - 60, 60, 360, C_GOLD_DEEP, 0.35);
      drawGlow(60, H - 80, 420, '#ffd28a', 0.22);

      const M = 56;
      let cursorY = M + 24;

      // —— 顶部：品牌 + 限量邀请 ——
      ctx.fillStyle = C_TEXT;
      ctx.font = '700 22px -apple-system, "PingFang SC", "Helvetica Neue", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      // letter-spacing 0.3em 模拟
      const brand = 'BOOMER-OFF';
      const brandSpacing = 0.3 * 22;
      let bx = M;
      for (const ch of brand) {
        ctx.fillText(ch, bx, cursorY + 6);
        bx += ctx.measureText(ch).width + brandSpacing;
      }
      ctx.textAlign = 'right';
      ctx.font = '400 18px -apple-system, "PingFang SC", sans-serif';
      ctx.fillStyle = C_TEXT_MUTE;
      ctx.fillText('限量邀请', W - M, cursorY + 10);

      cursorY += 70;

      // —— 副标 ——
      ctx.fillStyle = C_TEXT_SOFT;
      ctx.font = '400 22px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('为你专属准备', M, cursorY);
      cursorY += 38;

      // —— 大标题 ——
      ctx.fillStyle = C_TEXT;
      ctx.font = '700 56px -apple-system, "PingFang SC", "Helvetica Neue", sans-serif';
      const titleLines = wrapText(ctx, activity.name, W - M * 2, 2);
      for (const line of titleLines) {
        ctx.fillText(line, M, cursorY);
        cursorY += 70;
      }
      cursorY += 10;

      // —— 中部封面（可选）——
      if (activity.cover_url) {
        const img = await loadImage(activity.cover_url);
        if (img && !cancelled) {
          const coverH = 320;
          const coverW = W - M * 2;
          // 投影
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.45)';
          ctx.shadowBlur = 24;
          ctx.shadowOffsetY = 10;
          const radius = 24;
          ctx.beginPath();
          ctx.moveTo(M + radius, cursorY);
          ctx.lineTo(M + coverW - radius, cursorY);
          ctx.quadraticCurveTo(M + coverW, cursorY, M + coverW, cursorY + radius);
          ctx.lineTo(M + coverW, cursorY + coverH - radius);
          ctx.quadraticCurveTo(M + coverW, cursorY + coverH, M + coverW - radius, cursorY + coverH);
          ctx.lineTo(M + radius, cursorY + coverH);
          ctx.quadraticCurveTo(M, cursorY + coverH, M, cursorY + coverH - radius);
          ctx.lineTo(M, cursorY + radius);
          ctx.quadraticCurveTo(M, cursorY, M + radius, cursorY);
          ctx.closePath();
          ctx.fillStyle = '#000';
          ctx.fill();
          ctx.restore();
          // 裁剪绘制
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(M + radius, cursorY);
          ctx.lineTo(M + coverW - radius, cursorY);
          ctx.quadraticCurveTo(M + coverW, cursorY, M + coverW, cursorY + radius);
          ctx.lineTo(M + coverW, cursorY + coverH - radius);
          ctx.quadraticCurveTo(M + coverW, cursorY + coverH, M + coverW - radius, cursorY + coverH);
          ctx.lineTo(M + radius, cursorY + coverH);
          ctx.quadraticCurveTo(M, cursorY + coverH, M, cursorY + coverH - radius);
          ctx.lineTo(M, cursorY + radius);
          ctx.quadraticCurveTo(M, cursorY, M + radius, cursorY);
          ctx.closePath();
          ctx.clip();
          const iw = img.naturalWidth, ih = img.naturalHeight;
          const scale = Math.max(coverW / iw, coverH / ih);
          const dw = iw * scale, dh = ih * scale;
          ctx.drawImage(img, M + (coverW - dw) / 2, cursorY + (coverH - dh) / 2, dw, dh);
          ctx.restore();
          cursorY += coverH + 32;
        }
      }

      // —— 描述 ——
      if (activity.description) {
        ctx.fillStyle = C_TEXT_SOFT;
        ctx.font = '400 22px -apple-system, "PingFang SC", sans-serif';
        ctx.textAlign = 'left';
        const descLines = wrapText(ctx, activity.description, W - M * 2, 4);
        for (const line of descLines) {
          ctx.fillText(line, M, cursorY);
          cursorY += 34;
        }
        cursorY += 14;
      }

      // —— 活动时间 ——
      const fmt = (d?: string | null) => d ? format(new Date(d), 'yyyy.MM.dd') : null;
      const startTxt = fmt(activity.starts_at);
      const endTxt = fmt(activity.ends_at);
      let timeText = '长期有效';
      if (startTxt && endTxt) timeText = `${startTxt} — ${endTxt}`;
      else if (startTxt) timeText = `${startTxt} 起`;
      else if (endTxt) timeText = `截止 ${endTxt}`;
      ctx.fillStyle = C_GOLD;
      ctx.font = '500 22px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText(`活动时间　${timeText}`, M, cursorY);
      cursorY += 36;

      // —— 虚线分隔 ——
      const drawDashed = (y: number) => {
        ctx.save();
        ctx.strokeStyle = C_TEXT_SOFT;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 10]);
        ctx.beginPath();
        ctx.moveTo(M, y);
        ctx.lineTo(W - M, y);
        ctx.stroke();
        ctx.restore();
      };

      // —— 底部 QR 卡片（白底圆角）——
      const qrCardSize = 280;
      const qrPad = 24;
      const qrCardX = M;
      const qrCardY = H - M - qrCardSize - 30;

      drawDashed(qrCardY - 32);

      const drawRoundRect = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      };

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#ffffff';
      drawRoundRect(qrCardX, qrCardY, qrCardSize, qrCardSize, 24);
      ctx.fill();
      ctx.restore();

      const qrInner = qrCardSize - qrPad * 2;
      const qrDataUrl = await QRCode.toDataURL(url, {
        margin: 0,
        width: qrInner,
        errorCorrectionLevel: 'H',
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      const qrImg = await loadImage(qrDataUrl);
      if (qrImg) ctx.drawImage(qrImg, qrCardX + qrPad, qrCardY + qrPad, qrInner, qrInner);

      // —— 右侧文案 ——
      const textX = qrCardX + qrCardSize + 28;
      ctx.fillStyle = C_TEXT;
      ctx.font = '700 36px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('扫码报名', textX, qrCardY + 24);
      ctx.fillText('立即领券', textX, qrCardY + 78);

      ctx.fillStyle = C_GOLD;
      ctx.fillRect(textX, qrCardY + 138, 56, 3);

      ctx.fillStyle = C_TEXT_SOFT;
      ctx.font = '400 20px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText('长按识别二维码', textX, qrCardY + 158);
      ctx.fillText('或截图转发到微信', textX, qrCardY + 188);

      // 域名小字
      const domain = (() => {
        try { return new URL(url).host; } catch { return ''; }
      })();
      if (domain) {
        ctx.fillStyle = C_TEXT_MUTE;
        ctx.font = '400 14px ui-monospace, Menlo, monospace';
        ctx.fillText(domain, textX, qrCardY + qrCardSize - 22);
      }

      // —— 底部品牌签名 ——
      ctx.fillStyle = C_TEXT_MUTE;
      ctx.font = '400 14px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BOOMER · OFF　·　中古限定礼遇', W / 2, H - M / 2 - 8);


      if (cancelled) return;

      const out = canvas.toDataURL('image/png');

      // —— 上传到 storage 并固化到 DB ——
      try {
        if (user) {
          const blob = await dataUrlToBlob(out);
          const path = `${user.id}/${activity.id}_${POSTER_VERSION}.png`;
          const { error: upErr } = await supabase.storage
            .from('activity-posters')
            .upload(path, blob, { upsert: true, contentType: 'image/png' });
          if (!upErr) {
            const { data: signed } = await supabase.storage
              .from('activity-posters')
              .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // 10 年
            const persistUrl = signed?.signedUrl || out;
            await supabase.from('activities').update({ poster_url: persistUrl }).eq('id', activity.id);
            onPosterSaved?.(persistUrl);
            if (!cancelled) setDisplayUrl(persistUrl);
            setGenerating(false);
            return;
          }
        }
      } catch (err) {
        console.warn('[share-poster] persist failed, fallback to local', err);
      }

      if (!cancelled) {
        setDisplayUrl(out);
        setGenerating(false);
      }
    })().catch((e) => {
      console.error('[share-poster]', e);
      if (!cancelled) {
        setGenerating(false);
        toast.error('生成海报失败');
      }
    });

    return () => { cancelled = true; };
  }, [open, activity, user, onPosterSaved]);

  const handleDownload = async () => {
    if (!displayUrl || !activity) return;
    try {
      const res = await fetch(displayUrl);
      const blob = await res.blob();
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = `活动-${activity.name}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      const a = document.createElement('a');
      a.href = displayUrl;
      a.download = `活动-${activity.name}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-1">
          <DialogTitle className="text-base">活动分享海报</DialogTitle>
          <p className="text-[11px] text-muted-foreground mt-1">长按图片即可保存或转发到微信</p>
        </DialogHeader>

        <div className="px-5 pb-3">
          <div className="aspect-[750/1334] w-full bg-muted rounded-lg overflow-hidden flex items-center justify-center relative">
            {generating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80 backdrop-blur-sm z-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">正在生成分享海报…</p>
              </div>
            )}
            {displayUrl && (
              // eslint-disable-next-line jsx-a11y/img-redundant-alt
              <img src={displayUrl} alt="活动海报" className="w-full h-full object-contain" />
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>

        <div className="px-5 pb-5">
          <Button onClick={handleDownload} disabled={!displayUrl || generating} className="w-full">
            <Download className="w-4 h-4 mr-1.5" /> 保存图片
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
