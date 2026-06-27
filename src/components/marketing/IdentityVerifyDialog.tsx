// 真人认证弹窗:
// 1) 创建会话 → 拿 H5Link;PC 端用二维码展示,移动端直接打开
// 2) 用户在手机完成 H5 活体后,回来点「我已完成,开始入库」
// 3) 调 volc-identity-finish → 拿 asset_id,自动 toast + 刷新角色卡
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, ExternalLink, RefreshCw } from 'lucide-react';
import { QrCanvas } from '@/components/voucher/QrCanvas';
import { invokeFn } from '@/lib/invokeFn';
import { toast } from 'sonner';

export function IdentityVerifyDialog({
  open, onOpenChange, character, onVerified,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  character: any | null;
  onVerified: (updated: { asset_id: string; asset_uri: string }) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [h5Url, setH5Url] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setH5Url(null); setErr(null); setCreating(false); setFinishing(false); }
  }, [open]);

  if (!character) return null;

  const createSession = async () => {
    setCreating(true); setErr(null);
    const callbackUrl = `${window.location.origin}/verify-callback`;
    const { data, error } = await invokeFn<{ ok: boolean; h5_url?: string; error?: string }>(
      'volc-identity-create-session',
      { body: { character_id: character.id, callback_url: callbackUrl } },
    );
    setCreating(false);
    if (error || !data?.ok || !data.h5_url) {
      const m = error?.message || data?.error || '创建认证会话失败';
      setErr(m); toast.error(m); return;
    }
    setH5Url(data.h5_url);
  };

  const finish = async () => {
    setFinishing(true); setErr(null);
    const { data, error } = await invokeFn<{ ok: boolean; asset_id?: string; asset_uri?: string; error?: string }>(
      'volc-identity-finish',
      { body: { character_id: character.id } },
    );
    setFinishing(false);
    if (error || !data?.ok || !data.asset_uri) {
      const m = error?.message || data?.error || '入库失败,请重试';
      setErr(m); toast.error(m); return;
    }
    toast.success('真人认证 & 素材入库成功');
    onVerified({ asset_id: data.asset_id!, asset_uri: data.asset_uri });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />真人认证 · {character.name}
          </DialogTitle>
        </DialogHeader>

        <div className="text-[11.5px] leading-relaxed text-muted-foreground space-y-1.5 bg-muted/30 p-2.5 rounded-md">
          <p>火山方舟要求真人形象先通过官方 H5 活体认证后才能用于视频生成,认证后该角色将自动跳过「真人审核拦截」。</p>
          <p>① 用<strong>认证人本人的手机</strong>扫描下方二维码 / 打开链接</p>
          <p>② 在手机上完成人脸检测</p>
          <p>③ 回来这里点「我已完成,开始入库」</p>
        </div>

        {!h5Url && (
          <div className="flex justify-center py-4">
            <Button onClick={createSession} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              发起真人认证
            </Button>
          </div>
        )}

        {h5Url && (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2 p-3 bg-card border border-border rounded-md">
              <QrCanvas value={h5Url} size={180} />
              <a
                href={h5Url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-accent underline underline-offset-2"
              >
                <ExternalLink className="w-3 h-3" />在本机打开链接
              </a>
              <p className="text-[10px] text-muted-foreground text-center">认证页 30 分钟内有效</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={createSession} disabled={creating}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-3.5 h-3.5 mr-1" />换二维码</>}
              </Button>
              <Button className="flex-1" onClick={finish} disabled={finishing}>
                {finishing && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                我已完成,开始入库
              </Button>
            </div>
          </div>
        )}

        {err && <p className="text-[11px] text-destructive bg-destructive/10 p-2 rounded">{err}</p>}
      </DialogContent>
    </Dialog>
  );
}
