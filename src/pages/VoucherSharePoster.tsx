// 定向发放：海报 + 短链 + 二维码，支持长按保存或下载图片
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Copy, Download, ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { toPng } from 'html-to-image';
import QRCode from 'qrcode';
import { VoucherPoster } from '@/components/voucher/VoucherPoster';
import {
  type VoucherTemplate, type VoucherClaim, buildClaimShareUrl,
} from '@/lib/voucher';

export default function VoucherSharePoster() {
  const { claimId = '' } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [claim, setClaim] = useState<VoucherClaim | null>(null);
  const [voucher, setVoucher] = useState<VoucherTemplate | null>(null);
  const [imgDataUrl, setImgDataUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase
        .from('voucher_claims')
        .select('*')
        .eq('id', claimId)
        .maybeSingle();
      if (!c) { setLoading(false); return; }
      const { data: v } = await supabase
        .from('vouchers')
        .select('*')
        .eq('id', (c as any).voucher_id)
        .maybeSingle();
      setClaim(c as unknown as VoucherClaim);
      setVoucher(v as unknown as VoucherTemplate);
      setLoading(false);
    })();
  }, [claimId]);

  const shareUrl = useMemo(() => {
    if (!claim) return '';
    return buildClaimShareUrl(claim.short_code || claim.share_token);
  }, [claim]);

  const renderImg = useCallback(async () => {
    if (!posterRef.current) return;
    setExporting(true);
    try {
      const url = await toPng(posterRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#1f1409',
      });
      setImgDataUrl(url);
    } catch (e) {
      toast.error('图片生成失败');
    } finally {
      setExporting(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && claim && voucher) {
      const t = setTimeout(renderImg, 250);
      return () => clearTimeout(t);
    }
  }, [loading, claim, voucher, renderImg]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('短链已复制');
    } catch {
      toast.error('复制失败，请手动选择');
    }
  };

  const download = () => {
    if (!imgDataUrl) return;
    const a = document.createElement('a');
    a.href = imgDataUrl;
    a.download = `voucher-${claim?.short_code || claim?.code || 'poster'}.png`;
    a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!claim || !voucher) {
    return (
      <>
        <PageHeader title="定向发放" back="/me/vouchers" />
        <div className="container max-w-screen-md mx-auto px-4 py-10">
          <Card className="p-6 text-center text-sm text-muted-foreground">未找到该券</Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="定向发放" back="/me/vouchers" />
      <div className="container max-w-screen-sm mx-auto px-4 py-4 space-y-4 pb-8">
        {/* 截图源 */}
        <div className="fixed -left-[9999px] top-0 w-[360px]" aria-hidden>
          <VoucherPoster
            ref={posterRef}
            voucher={voucher}
            shareUrl={shareUrl}
            shortCode={claim.short_code}
          />
        </div>

        <div className="rounded-3xl overflow-hidden bg-muted/30 shadow-lg">
          {imgDataUrl ? (
            <img
              src={imgDataUrl}
              alt="优惠券海报"
              className="w-full block select-none"
              draggable={false}
              style={{ touchAction: 'manipulation' }}
            />
          ) : (
            <div className="aspect-[3/4] flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          手机端长按图片即可保存到相册
        </p>

        <Card className="p-3 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-foreground mb-0.5">领取短链</div>
            <div className="text-sm font-mono truncate">{shareUrl}</div>
          </div>
          <Button size="sm" variant="outline" onClick={copyLink} className="shrink-0">
            <Copy className="w-3.5 h-3.5 mr-1" />复制
          </Button>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={download} disabled={!imgDataUrl || exporting} className="h-11">
            <Download className="w-4 h-4 mr-1.5" />下载海报
          </Button>
          <Button variant="outline" onClick={() => navigate('/me/vouchers')} className="h-11">
            <ArrowLeft className="w-4 h-4 mr-1.5" />返回列表
          </Button>
        </div>
      </div>
    </>
  );
}
