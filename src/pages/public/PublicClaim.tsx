// 公开领取页：短链 /u/c/:short （兼容旧 /u/claim/:shareToken）
// 简化后：一进来即生效的「待核销」券，直接展示核销二维码
import { useEffect, useMemo, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Ticket, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { QrCanvas } from '@/components/voucher/QrCanvas';
import {
  CLAIM_STATUS_LABEL, CLAIM_STATUS_VARIANT, buildClaimRedeemUrl, formatVoucherRule, formatValidityRange,
} from '@/lib/voucher';

function fmtDateTime(s: string) {
  const d = new Date(s);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PublicClaim() {
  const params = useParams();
  const location = useLocation();
  const short = (params.short || '').toUpperCase();
  const legacyToken = params.shareToken || '';
  const lookup = useMemo(
    () => (short ? { short_code: short } : { share_token: legacyToken }),
    [short, legacyToken],
  );

  // 优先使用 router state / sessionStorage 里预置的 claim，避免再等一次 RPC
  const seededClaim = useMemo(() => {
    const fromState = (location.state as any)?.claim;
    if (fromState) return fromState;
    if (short) {
      try {
        const cached = sessionStorage.getItem(`claim:${short}`);
        if (cached) return JSON.parse(cached);
      } catch { /* ignore */ }
    }
    return null;
  }, [location.state, short]);

  const [loading, setLoading] = useState(!seededClaim);
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<any | null>(seededClaim);

  useEffect(() => {
    if (!short && !legacyToken) return;
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase.functions.invoke('voucher-claim-status', {
        body: lookup,
      });
      if (cancelled) return;
      if (e || (data as any)?.error) {
        // 有预置数据时，刷新失败不阻塞展示
        if (!seededClaim) {
          setError((data as any)?.error || e?.message || '优惠券不存在');
        }
        setLoading(false);
        return;
      }
      const fresh = (data as any).claim;
      setClaim(fresh);
      if (short && fresh) {
        try { sessionStorage.setItem(`claim:${short}`, JSON.stringify(fresh)); } catch { /* ignore */ }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [short, legacyToken, lookup, seededClaim]);


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(160deg,#1a0f06 0%,#2a1808 100%)' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-amber-200" />
          <p className="text-[12px] text-amber-100/80">正在加载您的优惠券…</p>
        </div>
      </div>
    );
  }
  if (error || !claim) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(160deg,#1a0f06 0%,#2a1808 100%)' }}>
        <Card className="p-6 text-center max-w-sm w-full space-y-2">
          <AlertTriangle className="w-10 h-10 mx-auto text-destructive" />
          <p className="text-sm">{error || '优惠券不存在'}</p>
        </Card>
      </div>
    );
  }

  const v = claim.voucher;
  const expiredNow =
    !!claim.expires_at && new Date(claim.expires_at).getTime() <= Date.now();
  const tplEnded = !!v?.ends_at && new Date(v.ends_at).getTime() <= Date.now();
  const showQr = claim.status === 'claimed' && !expiredNow && !tplEnded;

  return (
    <div
      className="min-h-screen py-6 px-4"
      style={{ background: 'linear-gradient(160deg,#1a0f06 0%,#2a1808 60%,#3b2410 100%)' }}
    >
      <div className="max-w-sm mx-auto space-y-4">
        <div
          className="relative overflow-hidden rounded-3xl text-white shadow-2xl"
          style={{
            background:
              'linear-gradient(135deg, #2a1808 0%, #4a2a12 45%, #8a5424 100%)',
          }}
        >
          <div className="absolute -top-16 -right-12 w-44 h-44 rounded-full opacity-30 blur-3xl"
            style={{ background: '#f5c66e' }} />
          <div className="relative p-6">
            <div className="flex items-center justify-between">
              <Ticket className="w-5 h-5 opacity-80" />
              <span className="text-[10px] tracking-[0.25em] opacity-70">BOOMER-OFF</span>
            </div>
            <div className="mt-4 text-[13px] opacity-80">为你专属准备</div>
            <h1 className="mt-0.5 text-lg font-semibold leading-tight tracking-wide">{v?.name || '优惠券'}</h1>

            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-2xl font-bold" style={{ color: '#ffd28a' }}>¥</span>
              <span className="font-bold tabular-nums leading-none"
                style={{ fontSize: '72px', color: '#ffd28a', letterSpacing: '-1px' }}>
                {v?.discount_amount}
              </span>
            </div>
            <div className="mt-1 text-sm" style={{ color: '#ffe7bd' }}>
              {v ? formatVoucherRule(v) : ''}
            </div>
            {(() => {
              const vi = formatValidityRange(claim, v?.valid_days);
              return (
                <div className="mt-0.5 text-[12px] leading-tight">
                  <div className="opacity-80">{vi.rangeText}</div>
                  {vi.remainingText && (
                    <div className={vi.expired ? 'text-red-300 font-medium' : 'opacity-70'}>
                      {vi.remainingText}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="mt-4 pt-3 border-t border-dashed border-white/20 flex items-center justify-between">
              <Badge variant={CLAIM_STATUS_VARIANT[claim.status]} className="bg-white/10 border-white/20 text-white">
                {CLAIM_STATUS_LABEL[claim.status]}
              </Badge>
              {v?.template_terms && (
                <span className="text-[10px] opacity-60 truncate ml-3">{v.template_terms}</span>
              )}
            </div>
          </div>
        </div>

        {showQr && claim.code && (
          <Card key={claim.code} className="p-4 space-y-3 text-center rounded-2xl">
            <p className="text-sm font-medium flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              到店出示此二维码核销
            </p>
            <div className="flex justify-center bg-white rounded-lg p-3">
              <QrCanvas value={buildClaimRedeemUrl(claim.code)} size={200} />
            </div>
            <p className="font-mono text-base tracking-widest font-semibold">{claim.code}</p>
            <p className="text-xs text-muted-foreground">请截图保存，到店出示给店员扫码核销；如无法扫码可口报上方券码</p>
          </Card>
        )}

        {claim.status === 'redeemed' && (
          <Card className="p-4 text-center text-sm bg-muted/30 rounded-2xl text-muted-foreground">
            该券已核销，感谢光临
          </Card>
        )}
        {(claim.status === 'expired' || (claim.status === 'claimed' && expiredNow)) && (
          <Card className="p-4 text-center text-sm text-destructive bg-destructive/5 rounded-2xl">
            该券已过期，无法核销
          </Card>
        )}
        {claim.status === 'claimed' && !expiredNow && tplEnded && v?.ends_at && (
          <Card className="p-4 text-center text-sm text-destructive bg-destructive/5 rounded-2xl space-y-1">
            <p className="font-medium">该券已结束</p>
            <p className="text-xs text-muted-foreground">结束时间：{fmtDateTime(v.ends_at)}</p>
          </Card>
        )}
        {claim.status === 'void' && (
          <Card className="p-4 text-center text-sm text-destructive bg-destructive/5 rounded-2xl">该券已作废</Card>
        )}
      </div>
    </div>
  );
}
