import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, AlertTriangle, QrCode } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PLATFORMS = [
  { key: 'douyin', label: '抖音' },
  { key: 'xhs', label: '小红书' },
  { key: 'wechat_video', label: '视频号' },
  { key: 'kuaishou', label: '快手' },
] as const;

type Status = 'idle' | 'connecting' | 'qrcode' | 'success' | 'error';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shopId: string;
  onSuccess?: () => void;
}

export function AddSocialAccountDialog({ open, onOpenChange, shopId, onSuccess }: Props) {
  const [platform, setPlatform] = useState<string>('douyin');
  const [alias, setAlias] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [qr, setQr] = useState<string>('');
  const [msg, setMsg] = useState('');
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!open) {
      esRef.current?.close();
      esRef.current = null;
      setStatus('idle'); setQr(''); setMsg(''); setAlias('');
    }
  }, [open]);

  async function start() {
    if (!alias.trim()) { toast.error('请填写一个账号别名'); return; }
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) { toast.error('未登录'); return; }
    setStatus('connecting'); setMsg('正在连接发布服务…'); setQr('');

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/social-login-stream`
      + `?shop_id=${encodeURIComponent(shopId)}`
      + `&platform=${encodeURIComponent(platform)}`
      + `&alias=${encodeURIComponent(alias.trim())}`
      + `&access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const p = JSON.parse(ev.data);
        if (p.status === 'qrcode') {
          setStatus('qrcode');
          setQr(p.image || '');
          setMsg('请用手机 APP 扫码登录');
        } else if (p.status === 'success') {
          setStatus('success'); setMsg('登录成功'); es.close();
          toast.success(`已绑定 ${PLATFORMS.find(x=>x.key===platform)?.label} · ${p.account?.name || alias}`);
          onSuccess?.();
          setTimeout(() => onOpenChange(false), 1200);
        } else if (p.status === 'error') {
          setStatus('error'); setMsg(p.message || '登录失败'); es.close();
        } else {
          setMsg(p.message || JSON.stringify(p));
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      if (status !== 'success') { setStatus('error'); setMsg('连接中断，请重试'); }
      es.close();
    };
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>添加自媒体账号</DialogTitle>
        </DialogHeader>

        {status === 'idle' && (
          <div className="space-y-4">
            <div>
              <Label>平台</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {PLATFORMS.map(p => (
                  <button key={p.key} type="button" onClick={() => setPlatform(p.key)}
                    className={`h-10 rounded-md border text-sm ${platform===p.key?'border-accent bg-accent/10 text-accent font-semibold':'border-border'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="alias">账号别名（仅自己看，例如 主号、小号）</Label>
              <Input id="alias" value={alias} onChange={e => setAlias(e.target.value)} placeholder="主号" maxLength={20} />
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              点开始后会生成二维码，请用对应平台 APP 扫码并在手机上确认登录。Cookie 会保存到我们的发布服务里，下次发布时直接使用。
            </p>
          </div>
        )}

        {status !== 'idle' && (
          <div className="space-y-3 text-center py-2">
            {status === 'connecting' && (
              <><Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" /><p className="text-sm">{msg}</p></>
            )}
            {status === 'qrcode' && (
              <>
                {qr
                  ? <img src={qr} alt="扫码登录" className="w-56 h-56 mx-auto rounded border" />
                  : <div className="w-56 h-56 mx-auto rounded border flex items-center justify-center"><QrCode className="w-10 h-10 text-muted-foreground" /></div>}
                <p className="text-sm">{msg}</p>
                <p className="text-[11px] text-muted-foreground">扫码后请等待，本窗口会自动关闭</p>
              </>
            )}
            {status === 'success' && (
              <><CheckCircle2 className="w-10 h-10 mx-auto text-green-600" /><p className="text-sm font-semibold">{msg}</p></>
            )}
            {status === 'error' && (
              <><AlertTriangle className="w-10 h-10 mx-auto text-destructive" /><p className="text-sm">{msg}</p></>
            )}
          </div>
        )}

        <DialogFooter>
          {status === 'idle' && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
              <Button onClick={start}>开始扫码</Button>
            </>
          )}
          {status === 'error' && (
            <Button onClick={() => setStatus('idle')}>重试</Button>
          )}
          {(status === 'qrcode' || status === 'connecting') && (
            <Button variant="ghost" onClick={() => { esRef.current?.close(); setStatus('idle'); }}>取消</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
