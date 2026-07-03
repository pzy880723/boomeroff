import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { invokeFn } from '@/lib/invokeFn';

export function PhoneLoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); }, []);

  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = window.setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) { if (timerRef.current) window.clearInterval(timerRef.current); return 0; }
        return n - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error('请输入正确的 11 位手机号');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await invokeFn('phone-login-send-otp', { body: { phone } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('验证码已发送');
      startCountdown();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { toast.error('请输入 6 位验证码'); return; }
    setVerifying(true);
    try {
      const { data, error } = await invokeFn('phone-login-verify-otp', { body: { phone, code } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const { error: eV } = await supabase.auth.verifyOtp({
        type: 'magiclink',
        email: data.email,
        token_hash: data.token_hash,
      });
      if (eV) throw eV;
      import('@/lib/audit').then(({ logAudit }) => {
        logAudit({ action: 'login.phone', detail: { phone: String(phone).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') } });
      }).catch(() => {});
      onSuccess?.();
      navigate('/', { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '登录失败');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <form onSubmit={verify} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="p-phone">手机号</Label>
        <Input
          id="p-phone"
          type="tel"
          inputMode="numeric"
          maxLength={11}
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
          placeholder="请输入 11 位手机号"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="p-code">验证码</Label>
        <div className="flex gap-2">
          <Input
            id="p-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6 位数字"
            required
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0 whitespace-nowrap"
            disabled={sending || countdown > 0 || !/^1[3-9]\d{9}$/.test(phone)}
            onClick={sendCode}
          >
            {sending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {countdown > 0 ? `${countdown}s 后重试` : '获取验证码'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">仅系统内登记的手机号可用验证码登录</p>
      </div>
      <Button type="submit" className="w-full" disabled={verifying}>
        {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        登录
      </Button>
    </form>
  );
}
