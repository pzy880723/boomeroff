// 优惠券详情：洋气券面 + 定向发放 + 编辑 + 领取记录
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, Send, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  type VoucherTemplate, type VoucherClaim, formatVoucherRule, formatValidityRange,
  buildClaimShareUrl, CLAIM_STATUS_LABEL, CLAIM_STATUS_VARIANT,
} from '@/lib/voucher';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  voucher: VoucherTemplate | null;
  onEdit?: () => void;
}

export function VoucherDetailDialog({ open, onOpenChange, voucher, onEdit }: Props) {
  const navigate = useNavigate();
  const [claims, setClaims] = useState<VoucherClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open || !voucher) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('voucher_claims')
        .select('*')
        .eq('voucher_id', voucher.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setClaims((data || []) as unknown as VoucherClaim[]);
      setLoading(false);
    })();
  }, [open, voucher]);

  const directRelease = async () => {
    if (!voucher) return;
    setCreating(true);
    const { data, error } = await supabase.functions.invoke('voucher-claim-create', {
      body: { voucher_id: voucher.id },
    });
    setCreating(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || '生成失败');
      return;
    }
    const claim = (data as any).claim;
    onOpenChange(false);
    navigate(`/me/vouchers/share/${claim.id}`);
  };

  if (!voucher) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            {voucher.name}
            {!voucher.active && <Badge variant="outline">已停用</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 space-y-3">
          <div
            className="relative overflow-hidden rounded-2xl p-5 text-white"
            style={{
              background:
                'linear-gradient(135deg, #2a1808 0%, #4a2a12 45%, #8a5424 100%)',
            }}
          >
            <div
              className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-30 blur-2xl"
              style={{ background: '#f5c66e' }}
            />
            <div className="relative">
              <div className="text-[11px] tracking-[0.25em] opacity-70">BOOMER-OFF · 专属券</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-xl font-bold" style={{ color: '#ffd28a' }}>¥</span>
                <span
                  className="font-bold tabular-nums leading-none"
                  style={{ fontSize: '56px', color: '#ffd28a' }}
                >
                  {voucher.discount_amount}
                </span>
              </div>
              <div className="mt-1 text-sm" style={{ color: '#ffe7bd' }}>
                {formatVoucherRule(voucher)}
              </div>
              <div className="mt-0.5 text-[11px] opacity-70">
                有效期 {voucher.valid_days} 天 · 仅到店消费
              </div>
              {voucher.template_terms && (
                <p className="mt-3 pt-2 border-t border-white/10 text-[11px] opacity-75 line-clamp-2">
                  {voucher.template_terms}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={directRelease} disabled={creating || !voucher.active} className="h-11">
              {creating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
              定向发放
            </Button>
            <Button variant="outline" onClick={onEdit} className="h-11">
              <Pencil className="w-4 h-4 mr-1.5" />编辑
            </Button>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1.5">领取与核销记录</div>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : claims.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">暂无</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {claims.map((c) => (
                  <div key={c.id} className="text-xs flex items-center gap-2 border border-border/60 rounded-lg px-2.5 py-1.5">
                    <span className="font-mono text-[11px]">{c.short_code || c.code}</span>
                    <span className="text-muted-foreground flex-1 truncate">
                      {c.recipient_name || (c.source === 'direct' ? '直接发放' : '活动')}
                      {c.recipient_phone ? ` · ${c.recipient_phone}` : ''}
                    </span>
                    <Badge variant={CLAIM_STATUS_VARIANT[c.status]} className="shrink-0 text-[10px] px-1.5 py-0">
                      {CLAIM_STATUS_LABEL[c.status]}
                    </Badge>
                    {c.status === 'unclaimed' && (
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(buildClaimShareUrl(c.short_code || c.share_token));
                            toast.success('短链已复制');
                          } catch { /* ignore */ }
                        }}
                        className="text-muted-foreground hover:text-foreground"
                        title="复制短链"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 mt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">关闭</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
