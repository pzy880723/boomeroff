// 选平台 -> SSE 拉二维码 -> 状态实时刷新 -> 成功后通知父刷新
// 增强: 二维码 90s 过期自动提示刷新, 失败有重试按钮, 主动取消会关闭 SSE
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, ScanLine, RotateCcw } from 'lucide-react';
import { PlatformBadge, platformLabel } from '@/components/marketing/dispatch/PlatformBadge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const PLATFORMS = ['douyin', 'xhs', 'wechat_video', 'kuaishou', 'bilibili'];
const QR_TTL_MS = 90_000;

type Step = 'pick' | 'connecting' | 'qr' | 'scanned' | 'syncing' | 'success' | 'fail' | 'expired';

export default function AddAccountDialog({ open, onOpenChange, shopId, onAdded }: {
  open: boolean; onOpenChange: (o: boolean) => void; shopId: string | null; onAdded: () => void;
}) {
  const { toast } = useToast();
  const [platform, setPlatform] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [qr, setQr] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<{ id: number; name: string; avatar: string } | null>(null);
  const [countdown, setCountdown] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const expireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupTimers = () => {
    if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    expireTimerRef.current = null;
    tickTimerRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      cleanupTimers();
      setPlatform(null); setStep('pick'); setQr(null); setErrMsg(null); setStatusMsg(null); setAccountInfo(null);
    }
    return () => { cleanupTimers(); abortRef.current?.abort(); };
  }, [open]);

  const armExpiry = useCallback(() => {
    cleanupTimers();
    setCountdown(Math.floor(QR_TTL_MS / 1000));
    tickTimerRef.current = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    expireTimerRef.current = setTimeout(() => {
      abortRef.current?.abort();
      setStep('expired');
      cleanupTimers();
    }, QR_TTL_MS);
  }, []);

  const startLogin = useCallback(async (p: string) => {
    if (!shopId) { toast({ title: '请先选择门店', variant: 'destructive' }); return; }
    setPlatform(p);
    setStep('connecting'); setQr(null); setErrMsg(null); setStatusMsg('正在连接发布服务器');
    const projectId = (supabase as any).supabaseUrl?.match(/https:\/\/(.+?)\.supabase\.co/)?.[1]
      || import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const fnUrl = `https://${projectId}.supabase.co/functions/v1/dispatch-account-login?platform=${p}&shop_id=${encodeURIComponent(shopId)}`;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const resp = await fetch(fnUrl, {
        signal: ctrl.signal,
        headers: token ? { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' } : { Accept: 'text/event-stream' },
      });
      if (!resp.ok || !resp.body) {
        let detail = '';
        try { detail = (await resp.json())?.error || ''; } catch { /* ignore */ }
        throw new Error(detail || `发布服务器连接失败(${resp.status})`);
      }
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
        cleanupTimers();
        setStep('fail'); setErrMsg(e.message || '连接发布服务器失败'); setStatusMsg(null);
      }
    }
  }, [shopId, toast]);

  const handleEvent = async (ev: any, p: string) => {
    if (ev.msg) setStatusMsg(ev.msg);
    if (ev.step === 'connecting') {
      setStep('connecting');
    } else if (ev.step === 'qr' && ev.qr) {
      setQr(ev.qr); setStep('qr');
      armExpiry();
    } else if (ev.step === 'scanned') {
      setStep('scanned');
      cleanupTimers();
    } else if (ev.step === 'syncing') {
      setStep('syncing');
      cleanupTimers();
    } else if (ev.step === 'success' && ev.account_id) {
      cleanupTimers();
      setAccountInfo({ id: Number(ev.account_id), name: ev.name || '', avatar: ev.avatar || '' });
      setStep('success');
      setStatusMsg('绑定成功');
      onAdded();
    } else if (ev.step === 'fail') {
      cleanupTimers();
      setStep('fail'); setErrMsg(ev.msg || '扫码失败'); setStatusMsg(null);
    }
  };

  const refreshQr = () => { if (platform) void startLogin(platform); };

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
        {step === 'connecting' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="text-sm">{statusMsg || '正在连接发布服务器'}</div>
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
              <ScanLine className="w-3.5 h-3.5" /> 用{platformLabel(platform!)}扫码登录
            </div>
            {statusMsg && <div className="text-[11px] text-muted-foreground text-center">{statusMsg}</div>}
            {qr && countdown > 0 && (
              <div className="text-[11px] text-muted-foreground">二维码 {countdown}s 后过期</div>
            )}
            {qr && (
              <Button variant="ghost" size="sm" onClick={refreshQr}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> 刷新二维码
              </Button>
            )}
          </div>
        )}
        {step === 'scanned' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <div className="text-sm">已扫码，请在手机上确认</div>
            {statusMsg && <div className="text-[11px] text-muted-foreground text-center">{statusMsg}</div>}
          </div>
        )}
        {step === 'syncing' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="text-sm">正在同步账号</div>
            <div className="text-[11px] text-muted-foreground text-center px-4">{statusMsg || '手机端已确认，正在写入账号'}</div>
          </div>
        )}
        {step === 'expired' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <XCircle className="w-12 h-12 text-amber-500" />
            <div className="text-sm">二维码已过期</div>
            <Button size="sm" onClick={refreshQr}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> 重新生成
            </Button>
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
            <div className="text-sm text-rose-600 text-center px-4 break-all">{errMsg || '失败'}</div>
            <div className="flex gap-2">
              {platform && (
                <Button size="sm" onClick={refreshQr}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> 重试
                </Button>
              )}
            <Button variant="outline" size="sm" onClick={() => { setStep('pick'); setErrMsg(null); setStatusMsg(null); setPlatform(null); }}>
                换平台
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
