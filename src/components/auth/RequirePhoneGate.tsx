import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { invokeFn } from '@/lib/invokeFn';
import { logAudit } from '@/lib/audit';
import { Loader2, Phone } from 'lucide-react';

/**
 * 强制补录手机号 —— 已登录用户若 profiles.phone 为空则弹窗，不允许关闭。
 */
export function RequirePhoneGate() {
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [needBind, setNeedBind] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setChecking(false); setNeedBind(false); return; }
    let cancelled = false;
    (async () => {
      setChecking(true);
      const { data } = await supabase.from('profiles')
        .select('phone').eq('user_id', user.id).maybeSingle();
      if (cancelled) return;
      setNeedBind(!data?.phone);
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) { toast.error('请输入正确的手机号'); return; }
    setSending(true);
    try {
      const { data, error } = await invokeFn('bind-phone-send-otp', { body: { phone } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('验证码已发送');
      setCooldown(60);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发送失败');
    } finally { setSending(false); }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { toast.error('请输入 6 位验证码'); return; }
    setVerifying(true);
    try {
      const { data, error } = await invokeFn('bind-phone-verify', { body: { phone, code } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await logAudit({ action: 'phone.bind', detail: { phone: phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') } });
      toast.success('手机号绑定成功');
      setNeedBind(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '绑定失败');
    } finally { setVerifying(false); }
  };

  if (authLoading || checking || !needBind) return null;

  return (
    <Dialog open modal>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-4 h-4" /> 请绑定手机号
          </DialogTitle>
          <DialogDescription>
            为了保障账号安全和门店通知送达，需要绑定手机号后才能继续使用。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={verify} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="bind-phone">手机号</Label>
            <Input
              id="bind-phone"
              type="tel"
              inputMode="numeric"
              maxLength={11}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="11 位手机号"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bind-code">验证码</Label>
            <div className="flex gap-2">
              <Input
                id="bind-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 位数字"
                required
              />
              <Button type="button" variant="outline" onClick={send} disabled={sending || cooldown > 0} className="shrink-0">
                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : cooldown > 0 ? `${cooldown}s` : '获取验证码'}
              </Button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={verifying}>
            {verifying && <Loader2 className="w-3 h-3 animate-spin mr-1" />} 绑定手机号
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
