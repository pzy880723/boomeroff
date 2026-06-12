// 公开领取页：短链 /u/c/:short （兼容旧 /u/claim/:shareToken）
// 流程：查看券 → 填姓名+手机 → 获取短信验证码 → 输验证码 → 领取成功 → 显示核销二维码
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Ticket, CheckCircle2, AlertTriangle, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { QrCanvas } from '@/components/voucher/QrCanvas';
import {
  CLAIM_STATUS_LABEL, CLAIM_STATUS_VARIANT, buildClaimRedeemUrl, formatVoucherRule, formatValidityRange,
} from '@/lib/voucher';

export default function PublicClaim() {
  const params = useParams();
  const short = (params.short || '').toUpperCase();
  const legacyToken = params.shareToken || '';
  const lookup = useMemo(
    () => (short ? { short_code: short } : { share_token: legacyToken }),
    [short, legacyToken],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchStatus = async () => {
    const { data, error: e } = await supabase.functions.invoke('voucher-claim-status', {
      body: lookup,
    });
    if (e || (data as any)?.error) {
      setError((data as any)?.error || e?.message || '优惠券不存在');
      setLoading(false);
      return;
    }
    setClaim((data as any).claim);
    setLoading(false);
  };

  useEffect(() => { if (short || legacyToken) fetchStatus(); /* eslint-disable-line */ }, [short, legacyToken]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendOtp = async () => {
    if (!name.trim()) { toast.error('请输入姓名'); return; }
    if (!/^1[3-9]\d{9}$/.test(phone)) { toast.error('请输入正确的手机号'); return; }
    setSending(true);
    const { data, error: e } = await supabase.functions.invoke('voucher-claim-send-otp', {
      body: { ...lookup, name: name.trim(), phone },
    });
    setSending(false);
    if (e || (data as any)?.error) {
      toast.error((data as any)?.error || e?.message || '发送失败');
      return;
    }
    setOtpSent(true);
    setCooldown(60);
    toast.success('验证码已发送，请查收短信');
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(otp)) { toast.error('请输入 6 位验证码'); return; }
    setSubmitting(true);
    const { data, error: e } = await supabase.functions.invoke('voucher-claim-accept', {
      body: { ...lookup, name: name.trim(), phone, otp },
    });
    setSubmitting(false);
    if (e || (data as any)?.error) {
      toast.error((data as any)?.error || e?.message || '领取失败');
      return;
    }
    toast.success('领取成功');
    await fetchStatus();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(160deg,#1a0f06 0%,#2a1808 100%)' }}>
        <Loader2 className="w-6 h-6 animate-spin text-amber-200" />
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
  const isClaimed = ['claimed', 'redeemed'].includes(claim.status);
  const expiredNow =
    !!claim.expires_at && new Date(claim.expires_at).getTime() <= Date.now();

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

        {!isClaimed && claim.status === 'unclaimed' && (
          <Card className="p-4 space-y-3 rounded-2xl">
            <p className="text-sm font-medium">填写信息领取</p>

            <div className="space-y-1.5">
              <Label className="text-xs">姓名</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="请输入姓名" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">手机号</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                inputMode="numeric"
                maxLength={11}
                placeholder="11 位手机号"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">短信验证码</Label>
              <div className="flex gap-2">
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 位验证码"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={sendOtp}
                  disabled={sending || cooldown > 0}
                  className="shrink-0 whitespace-nowrap"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" />
                    : cooldown > 0 ? `${cooldown}s` : (<><Send className="w-3.5 h-3.5 mr-1" />获取验证码</>)}
                </Button>
              </div>
              {otpSent && (
                <p className="text-[11px] text-muted-foreground">已发送至 {phone}，5 分钟内有效</p>
              )}
            </div>

            <Button onClick={confirm} disabled={submitting || !otpSent} className="w-full h-11">
              {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}确认领取
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              领取需短信验证码确认，请确保手机号本人使用
            </p>
          </Card>
        )}

        {isClaimed && claim.code && !expiredNow && claim.status !== 'redeemed' && (
          <Card className="p-4 space-y-3 text-center rounded-2xl">
            <p className="text-sm font-medium flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              到店出示此二维码核销
            </p>
            <div className="flex justify-center bg-white rounded-lg p-3">
              <QrCanvas value={buildClaimRedeemUrl(claim.code)} size={200} />
            </div>
            <p className="font-mono text-sm tracking-widest">{claim.code}</p>
            <p className="text-xs text-muted-foreground">请截图保存，到店出示给店员扫码核销</p>
          </Card>
        )}

        {claim.status === 'redeemed' && (
          <Card className="p-4 text-center text-sm bg-muted/30 rounded-2xl text-muted-foreground">
            该券已核销，感谢光临
          </Card>
        )}
        {(claim.status === 'expired' || (isClaimed && expiredNow)) && (
          <Card className="p-4 text-center text-sm text-destructive bg-destructive/5 rounded-2xl">
            该券已过期，无法核销
          </Card>
        )}
        {claim.status === 'void' && (
          <Card className="p-4 text-center text-sm text-destructive bg-destructive/5 rounded-2xl">该券已作废</Card>
        )}
      </div>
    </div>
  );
}
