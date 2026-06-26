// 选平台 -> SSE 拉二维码 -> 状态实时刷新 -> 成功后通知父刷新
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, ScanLine } from 'lucide-react';
import { PlatformBadge, platformLabel } from '@/components/marketing/dispatch/PlatformBadge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const PLATFORMS = ['douyin', 'xhs', 'wechat_video', 'kuaishou', 'bilibili'];

type Step = 'pick' | 'qr' | 'scanned' | 'success' | 'fail';

export default function AddAccountDialog({ open, onOpenChange, shopId, onAdded }: {
  open: boolean; onOpenChange: (o: boolean) => void; shopId: string | null; onAdded: () => void;
}) {
  const { toast } = useToast();
  const [platform, setPlatform] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [qr, setQr] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<{ id: number; name: string; avatar: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setPlatform(null); setStep('pick'); setQr(null); setErrMsg(null); setAccountInfo(null);
    }
  }, [open]);

  const startLogin = async (p: string) => {
    if (!shopId) { toast({ title: '请先选择门店', variant: 'destructive' }); return; }
    setPlatform(p);
    setStep('qr'); setQr(null); setErrMsg(null);
    const projectId = (supabase as any).supabaseUrl?.match(/https:\/\/(.+?)\.supabase\.co/)?.[1]
      || import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const fnUrl = `https://${projectId}.supabase.co/functions/v1/dispatch-account-login?platform=${p}`;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const resp = await fetch(fnUrl, { signal: ctrl.signal });
      if (!resp.ok || !resp.body) throw new Error(`worker ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() || '';
        for (const block of lines) {
          const line = block.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          try {
            const json = JSON.parse(line.slice(5).trim());
            handleEvent(json, p);
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setStep('fail'); setErrMsg(e.message || '连接发布服务器失败');
      }
    }
  };

  const handleEvent = async (ev: any, p: string) => {
    if (ev.step === 'qr' && ev.qr) {
      setQr(ev.qr); setStep('qr');
    } else if (ev.step === 'scanned') {
      setStep('scanned');
    } else if (ev.step === 'success' && ev.account_id) {
      setAccountInfo({ id: Number(ev.account_id), name: ev.name || '', avatar: ev.avatar || '' });
      // 写入 DB
      try {
        const { error } = await supabase.from('social_accounts').upsert({
          shop_id: shopId!,
          platform: p,
          worker_account_id: Number(ev.account_id),
          worker_account_key: `${p}:${ev.account_id}`,
          account_name: ev.name || null,
          avatar_url: ev.avatar || null,
          cookie_status: 'active',
        }, { onConflict: 'shop_id,platform,worker_account_key' });
        if (error) throw error;
        setStep('success');
        onAdded();
      } catch (e: any) {
        setStep('fail'); setErrMsg(e.message);
      }
    } else if (ev.step === 'fail') {
      setStep('fail'); setErrMsg(ev.msg || '扫码失败');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>添加自媒体账号</DialogTitle>
        </DialogHeader>
        {step === 'pick' && (
          <div className="grid grid-cols-2 gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => startLogin(p)}
                className="flex items-center gap-2 p-3 rounded-lg border hover:border-primary transition-colors text-left"
              >
                <PlatformBadge platform={p} size="md" />
                <span className="text-sm font-medium">{platformLabel(p)}</span>
              </button>
            ))}
          </div>
        )}
        {step === 'qr' && (
          <div className="flex flex-col items-center gap-3 py-4">
            {qr ? (
              <img src={qr} alt="扫码登录" className="w-48 h-48 rounded-lg border" />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center bg-muted rounded-lg">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <ScanLine className="w-3.5 h-3.5" /> 用{platformLabel(platform!)} App 扫码登录
            </div>
          </div>
        )}
        {step === 'scanned' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <div className="text-sm">已扫码,请在手机上确认…</div>
          </div>
        )}
        {step === 'success' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <div className="text-sm font-medium">{accountInfo?.name} 绑定成功</div>
            <Button size="sm" onClick={() => onOpenChange(false)}>完成</Button>
          </div>
        )}
        {step === 'fail' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <XCircle className="w-12 h-12 text-rose-500" />
            <div className="text-sm text-rose-600">{errMsg || '失败'}</div>
            <Button variant="outline" size="sm" onClick={() => { setStep('pick'); setErrMsg(null); }}>重新选择</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
