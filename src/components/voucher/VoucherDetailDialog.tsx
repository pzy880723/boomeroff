// 抵用券详情：展示规则、生成"直接转发"链接、查看核销记录
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, Share2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  type VoucherTemplate, type VoucherClaim, formatVoucherRule,
  buildClaimShareUrl, CLAIM_STATUS_LABEL, CLAIM_STATUS_VARIANT,
} from '@/lib/voucher';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  voucher: VoucherTemplate | null;
  onEdit?: () => void;
}

export function VoucherDetailDialog({ open, onOpenChange, voucher, onEdit }: Props) {
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

  const createAndCopy = async () => {
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
    const url = buildClaimShareUrl((data as any).claim.share_token);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('领取链接已复制');
    } catch {
      toast.success('已生成：' + url);
    }
    // refresh list
    const { data: rows } = await supabase
      .from('voucher_claims')
      .select('*').eq('voucher_id', voucher.id)
      .order('created_at', { ascending: false }).limit(50);
    setClaims((rows || []) as unknown as VoucherClaim[]);
  };

  if (!voucher) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {voucher.name}
            {!voucher.active && <Badge variant="outline">已停用</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 p-4 text-center">
            <p className="text-3xl font-bold tabular-nums text-primary">¥{voucher.discount_amount}</p>
            <p className="text-xs text-muted-foreground mt-1">{formatVoucherRule(voucher)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">有效期 {voucher.valid_days} 天</p>
            {voucher.template_terms && (
              <p className="text-[11px] text-muted-foreground mt-2">{voucher.template_terms}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={createAndCopy} disabled={creating || !voucher.active} className="h-10">
              {creating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Share2 className="w-4 h-4 mr-1.5" />}
              生成转发链接
            </Button>
            <Button variant="outline" onClick={onEdit} className="h-10">编辑</Button>
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
                    <span className="font-mono text-[11px]">{c.code}</span>
                    <span className="text-muted-foreground flex-1 truncate">
                      {c.recipient_name || (c.source === 'direct' ? '直接转发' : '活动')}
                      {c.recipient_phone ? ` · ${c.recipient_phone}` : ''}
                    </span>
                    <Badge variant={CLAIM_STATUS_VARIANT[c.status]} className="shrink-0 text-[10px] px-1.5 py-0">
                      {CLAIM_STATUS_LABEL[c.status]}
                    </Badge>
                    {c.status === 'unclaimed' && (
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(buildClaimShareUrl(c.share_token));
                            toast.success('链接已复制');
                          } catch { /* ignore */ }
                        }}
                        className="text-muted-foreground hover:text-foreground"
                        title="复制链接"
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
