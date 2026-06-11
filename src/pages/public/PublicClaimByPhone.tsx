// 公开免登录领取页（短信落地页）：输入手机号 → 跳转到 /u/c/:short
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Ticket, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import logo from '@/assets/boomer-off-vintage-logo.png';

const FIREWORK_COLORS = ['#fcd34d', '#fbbf24', '#f59e0b', '#fde68a', '#fff7d6'];

function fireFirework() {
  // 中心爆裂
  confetti({
    particleCount: 80,
    spread: 70,
    startVelocity: 45,
    origin: { x: 0.5, y: 0.55 },
    colors: FIREWORK_COLORS,
    scalar: 0.9,
  });
  // 左右两侧斜射
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0.1, y: 0.7 },
      colors: FIREWORK_COLORS,
    });
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 0.9, y: 0.7 },
      colors: FIREWORK_COLORS,
    });
  }, 200);
  // 收尾一波金色雨
  setTimeout(() => {
    confetti({
      particleCount: 60,
      spread: 100,
      startVelocity: 35,
      origin: { x: 0.5, y: 0.4 },
      colors: FIREWORK_COLORS,
      scalar: 1.1,
    });
  }, 450);
}

export default function PublicClaimByPhone() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error('请输入正确的 11 位手机号');
      return;
    }
    setSubmitting(true);
    // 立即放烟花
    fireFirework();
    const { data, error } = await supabase.functions.invoke('voucher-claim-by-phone', {
      body: { phone },
    });
    setSubmitting(false);
    const errMsg = (data as any)?.error || error?.message;
    if (errMsg) {
      setErrorMsg('不好意思，没有搜索到对应的优惠券，请检查您的手机号是否输入正确');
      return;
    }
    const shortCode = (data as any)?.short_code;
    if (shortCode) {
      navigate(`/u/c/${shortCode}`, { replace: true });
    } else {
      setErrorMsg('不好意思，没有搜索到对应的优惠券，请检查您的手机号是否输入正确');
    }
  };

  return (
    <div
      className="min-h-screen py-8 px-4 flex items-center justify-center"
      style={{ background: 'linear-gradient(160deg,#1a0f06 0%,#2a1808 60%,#3b2410 100%)' }}
    >
      <div className="max-w-sm w-full space-y-5">
        <div className="flex justify-center animate-fade-in">
          <img src={logo} alt="BOOMER-OFF" className="h-14 w-auto" />
        </div>

        <div className="text-center text-amber-100/90 space-y-1">
          <Ticket className="w-10 h-10 mx-auto opacity-90" />
          <h1 className="text-lg font-semibold tracking-wide">领取您的专属优惠券</h1>
          <p className="text-[12px] opacity-70">输入活动报名时填写的手机号即可领取</p>
        </div>

        <Card className="p-5 space-y-4 rounded-2xl">
          <div className="space-y-1.5">
            <Label className="text-xs">手机号</Label>
            <Input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value.replace(/\D/g, '').slice(0, 11));
                setErrorMsg(null);
              }}
              inputMode="numeric"
              maxLength={11}
              placeholder="请输入 11 位手机号"
              autoFocus
            />
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 text-[12px] text-destructive bg-destructive/5 rounded-md p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={submitting || phone.length !== 11}
            className="w-full h-11"
          >
            {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            立即领取
          </Button>

          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
            仅限通过审核的活动申请人领取，
            <br />
            如有疑问请联系门店工作人员
          </p>
        </Card>
      </div>
    </div>
  );
}
