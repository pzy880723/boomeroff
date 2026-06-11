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
import brandLogo from '@/assets/boomer-off-vintage-logo.png';

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
const POSTER_VERSION = 'v2';


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

      // —— 中古和风色板 ——
      const C_PAPER_TOP = '#f8f1df';
      const C_PAPER_BOT = '#ecdfc1';
      const C_INK = '#1c1816';
      const C_INK_SOFT = '#5a4f44';
      const C_INK_MUTE = '#9a8b7a';
      const C_ACCENT = '#b3331d';
      const C_ACCENT_DEEP = '#8e1f10';
      const C_LINE = '#bba78b';
      const C_CARD = '#fdf8ec';

      // 纸色底
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, C_PAPER_TOP);
      bg.addColorStop(0.5, '#f3e8cd');
      bg.addColorStop(1, C_PAPER_BOT);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // 纸纹噪点
      ctx.save();
      ctx.globalAlpha = 0.04;
      ctx.fillStyle = C_INK;
      for (let i = 0; i < 800; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.restore();

      // 双线外框
      const M = 44;
      ctx.strokeStyle = C_LINE;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(M, M, W - M * 2, H - M * 2);
      ctx.lineWidth = 0.6;
      ctx.strokeRect(M + 10, M + 10, W - (M + 10) * 2, H - (M + 10) * 2);

      // 四角小装饰
      const cornerSize = 22;
      ctx.strokeStyle = C_ACCENT;
      ctx.lineWidth = 2;
      const drawCorner = (cx: number, cy: number, dx: number, dy: number) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy + dy * cornerSize); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * cornerSize, cy);
        ctx.stroke();
      };
      drawCorner(M + 22, M + 22, 1, 1);
      drawCorner(W - M - 22, M + 22, -1, 1);
      drawCorner(M + 22, H - M - 22, 1, -1);
      drawCorner(W - M - 22, H - M - 22, -1, -1);

      // —— 1. 顶部 logo ——
      const headerY = M + 56;
      const logoImg = await loadImage(brandLogo);
      if (logoImg) {
        const logoH = 76;
        const logoW = logoImg.naturalWidth * (logoH / logoImg.naturalHeight);
        ctx.drawImage(logoImg, (W - logoW) / 2, headerY, logoW, logoH);
      }

      // 副标题
      ctx.fillStyle = C_INK_SOFT;
      ctx.font = '500 18px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const subY = headerY + 96;
      const sub = '中　古　邀　请　函';
      ctx.fillText(sub, W / 2, subY);
      ctx.strokeStyle = C_LINE;
      ctx.lineWidth = 0.8;
      const subW = ctx.measureText(sub).width;
      ctx.beginPath();
      ctx.moveTo(W / 2 - subW / 2 - 60, subY + 9);
      ctx.lineTo(W / 2 - subW / 2 - 14, subY + 9);
      ctx.moveTo(W / 2 + subW / 2 + 14, subY + 9);
      ctx.lineTo(W / 2 + subW / 2 + 60, subY + 9);
      ctx.stroke();

      let cursorY = subY + 50;

      // —— 2. 标题（前置）——
      ctx.fillStyle = C_INK;
      ctx.font = '700 56px "STSong", "Songti SC", "SimSun", "PingFang SC", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const cardX = M + 36;
      const cardW = W - (M + 36) * 2;
      const titleLines = wrapText(ctx, activity.name, cardW, 2);
      for (const line of titleLines) {
        ctx.fillText(line, W / 2, cursorY);
        cursorY += 68;
      }

      // 红印章（标题右上方装饰）
      const sealCx = W / 2 + ctx.measureText(titleLines[titleLines.length - 1] || '').width / 2 + 56;
      const sealCy = cursorY - 56;
      const sealR = 38;
      if (sealCx + sealR < W - M - 30) {
        ctx.save();
        ctx.fillStyle = C_ACCENT_DEEP;
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        ctx.arc(sealCx, sealCy, sealR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fdf8ec';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sealCx, sealCy, sealR - 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#fdf8ec';
        ctx.font = '700 36px "STSong", "Songti SC", "SimSun", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('邀', sealCx, sealCy + 2);
        // 印章破损纹理
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = C_PAPER_TOP;
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = sealR * (0.4 + Math.random() * 0.6);
          ctx.fillRect(sealCx + Math.cos(a) * r, sealCy + Math.sin(a) * r, 2 + Math.random() * 3, 1 + Math.random() * 2);
        }
        ctx.restore();
      }

      // 菱形装饰
      cursorY += 6;
      const diamondY = cursorY + 6;
      ctx.fillStyle = C_ACCENT;
      ctx.save();
      ctx.translate(W / 2, diamondY);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
      ctx.strokeStyle = C_LINE;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 140, diamondY); ctx.lineTo(W / 2 - 18, diamondY);
      ctx.moveTo(W / 2 + 18, diamondY); ctx.lineTo(W / 2 + 140, diamondY);
      ctx.stroke();
      cursorY += 36;

      // —— 3. 封面（如有）——
      if (activity.cover_url) {
        const img = await loadImage(activity.cover_url);
        if (img && !cancelled) {
          const coverH = 240;
          ctx.fillStyle = 'rgba(28,24,22,0.18)';
          ctx.fillRect(cardX + 4, cursorY + 6, cardW, coverH);
          ctx.save();
          ctx.beginPath();
          ctx.rect(cardX, cursorY, cardW, coverH);
          ctx.clip();
          const iw = img.naturalWidth, ih = img.naturalHeight;
          const scale = Math.max(cardW / iw, coverH / ih);
          const dw = iw * scale, dh = ih * scale;
          ctx.drawImage(img, cardX + (cardW - dw) / 2, cursorY + (coverH - dh) / 2, dw, dh);
          ctx.restore();
          ctx.strokeStyle = C_INK;
          ctx.lineWidth = 1;
          ctx.strokeRect(cardX, cursorY, cardW, coverH);
          cursorY += coverH + 32;
        }
      }

      // —— 4. 描述 ——
      if (activity.description) {
        ctx.fillStyle = C_INK_SOFT;
        ctx.font = '400 23px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left';
        const descLines = wrapText(ctx, activity.description, cardW - 40, 7);
        for (const line of descLines) {
          ctx.fillText(line, cardX + 20, cursorY);
          cursorY += 36;
        }
        cursorY += 8;
      }

      // —— 5. 元信息行 ——
      cursorY += 14;
      ctx.strokeStyle = C_LINE;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(cardX + 30, cursorY); ctx.lineTo(W - cardX - 30, cursorY);
      ctx.stroke();
      cursorY += 26;

      const fmt = (d?: string | null) => d ? format(new Date(d), 'yyyy.MM.dd') : null;
      const startTxt = fmt(activity.starts_at);
      const endTxt = fmt(activity.ends_at);
      let timeText = '长期有效';
      if (startTxt && endTxt) timeText = `${startTxt} — ${endTxt}`;
      else if (startTxt) timeText = `${startTxt} 起`;
      else if (endTxt) timeText = `截止 ${endTxt}`;

      ctx.fillStyle = C_INK_SOFT;
      ctx.font = '400 20px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`活动时间　${timeText}`, W / 2, cursorY);
      cursorY += 32;
      ctx.fillText(`参与方式　${activity.requires_review ? '需 审 核' : '免 审 核'}`, W / 2, cursorY);
      cursorY += 30;

      ctx.beginPath();
      ctx.moveTo(cardX + 30, cursorY); ctx.lineTo(W - cardX - 30, cursorY);
      ctx.stroke();
      cursorY += 28;

      // —— 6. 中间空隙的和风装饰条（青海波 + 中央 印 字）——
      const qrCardH = 240;
      const qrCardY = H - M - 56 - qrCardH;
      const gapTop = cursorY;
      const gapH = qrCardY - 28 - gapTop;
      if (gapH > 60) {
        const ornY = gapTop + gapH / 2;
        // 左右青海波弧线
        ctx.strokeStyle = C_LINE;
        ctx.lineWidth = 1;
        const drawWaves = (startX: number, endX: number, dir: number) => {
          const r = 14;
          for (let row = 0; row < 2; row++) {
            const yy = ornY - 14 + row * 14;
            let x = startX;
            while ((dir > 0 ? x < endX : x > endX)) {
              ctx.beginPath();
              ctx.arc(x, yy, r, Math.PI, Math.PI * 2);
              ctx.stroke();
              x += dir * r * 2;
            }
          }
        };
        drawWaves(cardX + 20, W / 2 - 60, 1);
        drawWaves(W - cardX - 20, W / 2 + 60, -1);

        // 中央方印
        const stampSize = 56;
        ctx.fillStyle = C_ACCENT_DEEP;
        ctx.fillRect(W / 2 - stampSize / 2, ornY - stampSize / 2, stampSize, stampSize);
        ctx.fillStyle = '#fdf8ec';
        ctx.font = '700 30px "STSong", "Songti SC", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('印', W / 2, ornY + 1);
        ctx.textBaseline = 'top';
      }

      // —— 7. 二维码卡片 ——
      const qrCardX = M + 50;
      const qrCardW = W - (M + 50) * 2;

      ctx.fillStyle = C_CARD;
      ctx.fillRect(qrCardX, qrCardY, qrCardW, qrCardH);
      ctx.strokeStyle = C_INK;
      ctx.lineWidth = 1;
      ctx.strokeRect(qrCardX, qrCardY, qrCardW, qrCardH);
      ctx.lineWidth = 0.5;
      ctx.strokeRect(qrCardX + 6, qrCardY + 6, qrCardW - 12, qrCardH - 12);

      const qrSize = 200;
      const qrDataUrl = await QRCode.toDataURL(url, {
        margin: 1,
        width: qrSize,
        errorCorrectionLevel: 'H',
        color: { dark: C_INK, light: '#00000000' },
      });
      const qrImg = await loadImage(qrDataUrl);
      const qrY = qrCardY + (qrCardH - qrSize) / 2;
      const qrX = qrCardX + 20;
      if (qrImg) ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      const textX = qrX + qrSize + 28;
      ctx.fillStyle = C_INK;
      ctx.font = '700 30px "STSong", "Songti SC", "SimSun", serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('扫 码', textX, qrY + 22);
      ctx.fillText('参 与', textX, qrY + 68);
      ctx.fillStyle = C_ACCENT;
      ctx.fillRect(textX, qrY + 118, 36, 2);
      ctx.fillStyle = C_INK_SOFT;
      ctx.font = '400 15px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('长按识别二维码', textX, qrY + 136);
      ctx.fillText('或截图保存转发', textX, qrY + 158);

      // —— 8. 底部签名 ——
      ctx.textAlign = 'center';
      ctx.fillStyle = C_INK_MUTE;
      ctx.font = '400 13px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('由　BOOMER · OFF　中　古　小　店　呈　上', W / 2, H - M - 30);

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
