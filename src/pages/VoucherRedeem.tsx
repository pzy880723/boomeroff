import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { AuthPage } from '@/components/auth/AuthPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, CheckCircle2, AlertTriangle, ShieldX, Ticket,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  VOUCHER_STATUS_LABEL, VOUCHER_STATUS_VARIANT,
} from '@/lib/voucher';

interface VoucherView {
  id: string;
  code: string;
  share_token: string;
  status: string;
  applicant_name: string | null;
  applicant_phone: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  type: { name: string; face_value: number; terms: string | null } | null;
}

export default function VoucherRedeem() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const t = params.get('t') || '';
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { can, loading: permLoading } = usePermissions();
  const [voucher, setVoucher] = useState<VoucherView | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemedNow, setRedeemedNow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!t) { setError('二维码缺少参数'); setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data, error: e } = await supabase.functions.invoke('voucher-status', {
        body: undefined,
        method: 'GET' as any,
      } as any).catch(() => ({ data: null, error: { message: 'network' } } as any));
      // fallback to direct fetch since invoke doesn't support GET easily
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voucher-status?share_token=${encodeURIComponent(t)}`;
      const resp = await fetch(url, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '' },
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || json.error) {
        setError(json?.error || '查询失败');
        setLoading(false);
        return;
      }
      if (json.code !== code) {
        setError('券码与二维码不一致');
        setLoading(false);
        return;
      }
      setVoucher(json);
      setLoading(false);
    })();
  }, [code, t]);

  const doRedeem = async () => {
    setRedeeming(true);
    const { data, error: e } = await supabase.functions.invoke('voucher-redeem', {
      body: { code, share_token: t },
    });
    setRedeeming(false);
    if (e || (data as any)?.error) {
      toast.error((data as any)?.error || e?.message || '核销失败');
      return;
    }
    toast.success('核销成功');
    setRedeemedNow((data as any).redeemed_at);
    if (voucher) setVoucher({ ...voucher, status: 'redeemed', redeemed_at: (data as any).redeemed_at });
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
            <p className="text-xs text-muted-foreground">请联系管理员分配「抵用券核销」权限</p>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="核销抵用券" back="/me/vouchers" />
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
        ) : voucher ? (
          <>
            <Card className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-primary" />
                <span className="font-medium">{voucher.type?.name || '抵用券'}</span>
                <Badge variant={VOUCHER_STATUS_VARIANT[voucher.status]} className="ml-auto">
                  {VOUCHER_STATUS_LABEL[voucher.status] || voucher.status}
                </Badge>
              </div>
              {voucher.type && (
                <div className="text-2xl font-bold tabular-nums">¥{Number(voucher.type.face_value).toFixed(0)}</div>
              )}
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>券编号：<span className="font-mono">{voucher.code}</span></p>
                {voucher.applicant_name && <p>客户：{voucher.applicant_name} · {voucher.applicant_phone}</p>}
                {voucher.expires_at && (
                  <p>有效期至：{format(new Date(voucher.expires_at), 'yyyy-MM-dd')}</p>
                )}
                {voucher.redeemed_at && (
                  <p>核销时间：{format(new Date(voucher.redeemed_at), 'yyyy-MM-dd HH:mm')}</p>
                )}
                {voucher.type?.terms && <p>条款：{voucher.type.terms}</p>}
              </div>
            </Card>

            {voucher.status === 'approved' && !redeemedNow && (
              <Button onClick={doRedeem} disabled={redeeming} className="w-full h-12 text-base">
                {redeeming ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-5 h-5 mr-1.5" />}
                确认核销
              </Button>
            )}
            {voucher.status === 'redeemed' && (
              <Card className="p-4 text-center bg-muted/30 text-sm text-muted-foreground">
                该券已核销，无需重复操作
              </Card>
            )}
            {(voucher.status === 'pending_review' || voucher.status === 'pending_apply') && (
              <Card className="p-4 text-center bg-yellow-500/10 text-sm">
                该券还未审核通过，暂不能核销
              </Card>
            )}
            {(voucher.status === 'rejected' || voucher.status === 'expired' || voucher.status === 'revoked') && (
              <Card className="p-4 text-center text-sm text-destructive bg-destructive/5">
                该券已 {VOUCHER_STATUS_LABEL[voucher.status]}，无法核销
              </Card>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}
