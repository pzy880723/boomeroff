// 优惠券详情：洋气券面 + 定向发放 + 编辑 + 领取记录
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Copy, Send, Pencil, Trash2, Search } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { invokeFn } from '@/lib/invokeFn';
import { toast } from 'sonner';
import { humanizeRpcError, type FriendlyRpcError } from '@/lib/rpcError';
import { PermissionErrorState } from '@/components/common/PermissionErrorState';
import {
  type VoucherTemplate, type VoucherClaim, formatVoucherRule, formatValidityRange,
  buildClaimShareUrl, CLAIM_STATUS_LABEL, CLAIM_STATUS_VARIANT, getVoucherTemplateTimeInfo,
} from '@/lib/voucher';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  voucher: VoucherTemplate | null;
  onEdit?: () => void;
  onDeleted?: () => void;
}

export function VoucherDetailDialog({ open, onOpenChange, voucher, onEdit, onDeleted }: Props) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [claims, setClaims] = useState<VoucherClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [claimSearch, setClaimSearch] = useState('');

  const [claimsError, setClaimsError] = useState<FriendlyRpcError | null>(null);

  const loadClaims = async () => {
    if (!voucher) return;
    setLoading(true);
    setClaimsError(null);
    const { data, error } = await supabase.rpc('list_voucher_claims_with_pii', {
      _voucher_id: voucher.id,
      _limit: 50,
    });
    if (error) {
      setClaimsError(humanizeRpcError(error));
      setClaims([]);
    } else {
      setClaims((data || []) as unknown as VoucherClaim[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!open || !voucher) return;
    loadClaims();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, voucher]);

  const directRelease = async () => {
    if (!voucher) return;
    setCreating(true);
    const { data, error } = await invokeFn<any>('voucher-claim-create', {
      body: { voucher_id: voucher.id },
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const claim = (data as any).claim;
    onOpenChange(false);
    navigate(`/me/vouchers/share/${claim.id}`);
  };

  const tryDelete = async () => {
    if (!voucher) return;
    setConfirmDelete(true);
  };

  const doDelete = async () => {
    if (!voucher) return;
    setDeleting(true);
    const { data, error } = await supabase.rpc('delete_voucher_safe', { _id: voucher.id });
    setDeleting(false);
    setConfirmDelete(false);
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error || '删除失败');
      return;
    }
    toast.success('已删除');
    onOpenChange(false);
    onDeleted?.();
  };

  if (!voucher) return null;

  return (
    <>
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
              {(() => {
                const ti = getVoucherTemplateTimeInfo(voucher);
                return (
                  <div className="mt-2 flex items-center gap-2 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-white/15">{ti.label}</span>
                    <span className="opacity-80">{ti.rangeText}</span>
                    {ti.countdown && <span className="opacity-70">· {ti.countdown}</span>}
                  </div>
                );
              })()}
              {voucher.template_terms && (
                <p className="mt-3 pt-2 border-t border-white/10 text-[11px] opacity-75 line-clamp-2">
                  {voucher.template_terms}
                </p>
              )}
            </div>
          </div>

          {(() => {
            const ti = getVoucherTemplateTimeInfo(voucher);
            const cannotRelease = !voucher.active || ti.status === 'ended' || ti.status === 'pending';
            const releaseHint =
              !voucher.active ? '已停用，无法发放'
              : ti.status === 'pending' ? '尚未到生效时间'
              : ti.status === 'ended' ? '已结束，无法发放'
              : null;
            return (
              <>
                <div className={isAdmin ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
                  <Button onClick={directRelease} disabled={creating || cannotRelease} className="h-11">
                    {creating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                    发放
                  </Button>
                  <Button variant="outline" onClick={onEdit} className="h-11">
                    <Pencil className="w-4 h-4 mr-1.5" />编辑
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      onClick={tryDelete}
                      disabled={deleting}
                      className="h-11 text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/5"
                    >
                      {deleting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
                      删除
                    </Button>
                  )}
                </div>
                {releaseHint && (
                  <p className="text-[11px] text-amber-600">{releaseHint}</p>
                )}
              </>
            );
          })()}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            提示：修改金额/门槛/有效期天数仅影响之后新发放的券，已发放的券保持原规则与到期时间。
          </p>


          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1.5">领取与核销记录</div>
            {!loading && claims.length > 0 && (
              <div className="relative mb-1.5">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={claimSearch}
                  onChange={(e) => setClaimSearch(e.target.value)}
                  placeholder="搜索姓名 / 手机号 / 券码"
                  className="pl-8 h-8 text-xs"
                />
              </div>
            )}
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : claimsError ? (
              <PermissionErrorState compact error={claimsError} onRetry={loadClaims} />
            ) : claims.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">暂无</p>
            ) : (() => {
              const kw = claimSearch.trim().toLowerCase();
              const filtered = !kw ? claims : claims.filter((c) =>
                (c.recipient_name || '').toLowerCase().includes(kw)
                || (c.recipient_phone || '').toLowerCase().includes(kw)
                || (c.short_code || '').toLowerCase().includes(kw)
                || (c.code || '').toLowerCase().includes(kw)
              );
              if (filtered.length === 0) {
                return <p className="text-xs text-muted-foreground text-center py-3">没有匹配的记录</p>;
              }
              return (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {filtered.map((c) => {
                  const v = formatValidityRange(c, voucher.valid_days);
                  return (
                    <div key={c.id} className="border border-border/60 rounded-lg px-2.5 py-1.5 space-y-0.5">
                      <div className="text-xs flex items-center gap-2">
                        <span className="font-mono text-[11px]">{c.short_code || c.code}</span>
                        <span className="text-muted-foreground flex-1 truncate">
                          {c.recipient_name || (c.source === 'direct' ? '直接发放' : '活动')}
                          {c.recipient_phone ? ` · ${c.recipient_phone}` : ''}
                        </span>
                        <Badge variant={CLAIM_STATUS_VARIANT[c.status]} className="shrink-0 text-[10px] px-1.5 py-0">
                          {CLAIM_STATUS_LABEL[c.status]}
                        </Badge>
                        {c.status === 'claimed' && !c.redeemed_at && (
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
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <span>{v.rangeText}</span>
                        {v.remainingText && (
                          <span className={v.expired ? 'text-destructive' : 'text-foreground/70'}>
                            · {v.remainingText}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              );
            })()}
          </div>
        </div>

        <div className="px-4 py-3 mt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">关闭</Button>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除该优惠券？</AlertDialogTitle>
          <AlertDialogDescription>
            删除后无法恢复，已核销/已过期的领取记录将一并清除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); doDelete(); }}
            disabled={deleting}
            className="bg-destructive hover:bg-destructive/90"
          >
            {deleting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
