// 店员扫码核销：基于 voucher_claims.code
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { AuthPage } from '@/components/auth/AuthPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertTriangle, ShieldX, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_VARIANT, formatVoucherRule, formatValidityRange } from '@/lib/voucher';

interface ClaimView {
  id: string;
  code: string;
  status: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  voucher: {
    name: string;
    threshold_type: 'none' | 'min_spend';
    discount_amount: number;
    min_spend: number | null;
    template_terms: string | null;
  } | null;
}

export default function VoucherRedeem() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { can, loading: permLoading } = usePermissions();
  const [claim, setClaim] = useState<ClaimView | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    (async () => {
      setLoading(true);
      const { data, error: e } = await supabase
        .from('voucher_claims')
        .select('id, code, status, recipient_name, recipient_phone, expires_at, redeemed_at, voucher:vouchers(name, threshold_type, discount_amount, min_spend, template_terms)')
        .eq('code', code.toUpperCase())
        .maybeSingle();
      if (e || !data) { setError('券码不存在'); setLoading(false); return; }
      setClaim(data as unknown as ClaimView);
      setLoading(false);
    })();
  }, [code]);

  const doRedeem = async () => {
    setRedeeming(true);
    const { data, error: e } = await supabase.functions.invoke('voucher-redeem', { body: { code } });
    setRedeeming(false);
    if (e || (data as any)?.error) {
      toast.error((data as any)?.error || e?.message || '核销失败');
      return;
    }
    toast.success('核销成功');
    if (claim) setClaim({ ...claim, status: 'redeemed', redeemed_at: new Date().toISOString() });
  };

  if (authLoading || permLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!user) return <AuthPage />;
  if (!can('voucher.redeem')) {
    return (
      <>
        <PageHeader title="核销" back="/me/vouchers" />
        <div className="container max-w-screen-md mx-auto px-3 py-6">
          <Card className="p-6 text-center space-y-2">
            <ShieldX className="w-10 h-10 mx-auto text-destructive" />
            <p className="text-sm">当前账号没有核销权限</p>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="核销优惠券" back="/me/vouchers" />
      <div className="container max-w-screen-md mx-auto px-3 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card className="p-6 text-center space-y-2">
            <AlertTriangle className="w-10 h-10 mx-auto text-destructive" />
            <p className="text-sm">{error}</p>
            <Button variant="outline" onClick={() => navigate('/me/vouchers')}>返回</Button>
          </Card>
        ) : claim ? (
          <>
            <Card className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-primary" />
                <span className="font-medium">{claim.voucher?.name || '优惠券'}</span>
                <Badge variant={CLAIM_STATUS_VARIANT[claim.status]} className="ml-auto">
                  {CLAIM_STATUS_LABEL[claim.status] || claim.status}
                </Badge>
              </div>
              {claim.voucher && (
                <>
                  <div className="text-2xl font-bold tabular-nums">¥{Number(claim.voucher.discount_amount).toFixed(0)}</div>
                  <p className="text-xs text-muted-foreground">{formatVoucherRule(claim.voucher)}</p>
                </>
              )}
              <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
                <p>券编号：<span className="font-mono">{claim.code}</span></p>
                {claim.recipient_name && <p>客户：{claim.recipient_name} · {claim.recipient_phone}</p>}
                {claim.expires_at && <p>有效期至：{format(new Date(claim.expires_at), 'yyyy-MM-dd')}</p>}
                {claim.redeemed_at && <p>核销时间：{format(new Date(claim.redeemed_at), 'yyyy-MM-dd HH:mm')}</p>}
                {claim.voucher?.template_terms && <p>条款：{claim.voucher.template_terms}</p>}
              </div>
            </Card>

            {claim.status === 'claimed' && (
              <Button onClick={doRedeem} disabled={redeeming} className="w-full h-12 text-base">
                {redeeming ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-5 h-5 mr-1.5" />}
                确认核销
              </Button>
            )}
            {claim.status === 'redeemed' && (
              <Card className="p-4 text-center bg-muted/30 text-sm text-muted-foreground">该券已核销，无需重复操作</Card>
            )}
            {claim.status === 'unclaimed' && (
              <Card className="p-4 text-center bg-yellow-500/10 text-sm">客户尚未领取，请先转发领取链接</Card>
            )}
            {(claim.status === 'expired' || claim.status === 'void') && (
              <Card className="p-4 text-center text-sm text-destructive bg-destructive/5">
                该券已 {CLAIM_STATUS_LABEL[claim.status]}，无法核销
              </Card>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}
