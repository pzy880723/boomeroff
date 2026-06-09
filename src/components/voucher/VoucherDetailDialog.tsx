import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  buildVoucherRedeemUrl, buildVoucherShareUrl,
  VOUCHER_STATUS_LABEL, VOUCHER_STATUS_VARIANT, type Voucher,
} from '@/lib/voucher';
import { QrCanvas } from './QrCanvas';
import { Copy, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  voucher: Voucher | null;
  onOpenChange: (open: boolean) => void;
}

export function VoucherDetailDialog({ open, voucher, onOpenChange }: Props) {
  const [copied, setCopied] = useState(false);
  if (!voucher) return null;

  const shareUrl = buildVoucherShareUrl(voucher.share_token);
  const redeemUrl = buildVoucherRedeemUrl(voucher.code, voucher.share_token);
  const type = voucher.voucher_types;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('已复制');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('复制失败');
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: type ? `${type.name} 抵用券` : '抵用券',
          text: '送你一张探店抵用券,点击查看',
          url: shareUrl,
        });
      } catch { /* user cancel */ }
    } else {
      copy(shareUrl);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type?.name || '抵用券'}
            <Badge variant={VOUCHER_STATUS_VARIANT[voucher.status]}>
              {VOUCHER_STATUS_LABEL[voucher.status] || voucher.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {type && (
            <Card className="p-3 bg-gradient-to-br from-primary/5 to-accent/10 border-primary/20">
              <div className="flex items-baseline gap-1">
                <span className="text-xs text-muted-foreground">面额</span>
                <span className="text-2xl font-bold tabular-nums">¥{Number(type.face_value).toFixed(0)}</span>
                <span className="text-xs text-muted-foreground ml-auto">有效 {type.valid_days} 天</span>
              </div>
              {type.terms && <p className="text-[11px] text-muted-foreground mt-1.5">{type.terms}</p>}
            </Card>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p>券编号：<span className="font-mono text-foreground">{voucher.code}</span></p>
            {voucher.note && <p>备注：{voucher.note}</p>}
            <p>创建：{format(new Date(voucher.created_at), 'yyyy-MM-dd HH:mm')}</p>
            {voucher.applicant_name && (
              <p>申请人：{voucher.applicant_name} · {voucher.applicant_phone}</p>
            )}
            {voucher.expires_at && (
              <p>有效期至：{format(new Date(voucher.expires_at), 'yyyy-MM-dd')}</p>
            )}
            {voucher.redeemed_at && (
              <p className="text-foreground">核销时间：{format(new Date(voucher.redeemed_at), 'yyyy-MM-dd HH:mm')}</p>
            )}
            {voucher.reject_reason && (
              <p className="text-destructive">拒绝原因：{voucher.reject_reason}</p>
            )}
          </div>

          {voucher.status === 'approved' && (
            <Card className="p-4 flex flex-col items-center bg-background">
              <p className="text-xs text-muted-foreground mb-2">核销二维码（店员扫码核销）</p>
              <QrCanvas value={redeemUrl} size={200} />
              <p className="mt-2 font-mono text-base tracking-widest">{voucher.code}</p>
            </Card>
          )}

          {/* 分享链接（所有状态都可分享，只要还没核销） */}
          {!['redeemed', 'revoked'].includes(voucher.status) && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">客户领取链接</p>
              <div className="flex items-center gap-2">
                <Card className="flex-1 px-3 py-2 text-[11px] truncate font-mono bg-muted/30">
                  {shareUrl}
                </Card>
                <Button size="icon" variant="outline" onClick={() => copy(shareUrl)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <Button onClick={share} className="w-full" variant="default">
                <Share2 className="w-4 h-4 mr-1.5" />
                分享给客户
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
