import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertTriangle, Ticket, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { QrCanvas } from '@/components/voucher/QrCanvas';
import {
  VOUCHER_STATUS_LABEL, VOUCHER_STATUS_VARIANT, buildVoucherRedeemUrl,
} from '@/lib/voucher';
import { supabase } from '@/integrations/supabase/client';

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const APIKEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '') as string;

interface VoucherView {
  id: string;
  code: string;
  share_token: string;
  status: string;
  applicant_name: string | null;
  applicant_phone: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  reject_reason: string | null;
  type: { name: string; face_value: number; valid_days: number; terms: string | null; description: string | null } | null;
}

export default function PublicVoucher() {
  const { shareToken = '' } = useParams();
  const [v, setV] = useState<VoucherView | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${FN_BASE}/voucher-status?share_token=${encodeURIComponent(shareToken)}`, {
        headers: { apikey: APIKEY },
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || '加载失败'); setV(null); }
      else setV(j);
    } catch {
      setError('网络错误');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [shareToken]);

  // realtime refresh
  useEffect(() => {
    if (!shareToken) return;
    const ch = supabase
      .channel(`pub-voucher-${shareToken}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'vouchers',
        filter: `share_token=eq.${shareToken}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [shareToken]);

  const onPick = (file: File | null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('图片过大,请选小于 8MB 的图片'); return; }
    const reader = new FileReader();
    reader.onload = () => setShot(reader.result as string);
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!/^1\d{10}$/.test(phone)) { toast.error('请输入有效的手机号'); return; }
    if (!name.trim()) { toast.error('请填写姓名'); return; }
    if (!shot) { toast.error('请上传主页截图'); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${FN_BASE}/voucher-apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: APIKEY },
        body: JSON.stringify({
          share_token: shareToken,
          applicant_name: name.trim(),
          applicant_phone: phone.trim(),
          screenshot_base64: shot,
        }),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(typeof j.error === 'string' ? j.error : '提交失败'); }
      else { toast.success('提交成功,请等待审核'); load(); }
    } catch { toast.error('网络错误'); }
    setSubmitting(false);
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (error || !v) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-6 text-center max-w-sm space-y-2">
          <AlertTriangle className="w-10 h-10 mx-auto text-destructive" />
          <p className="text-sm">{error || '券不存在'}</p>
        </Card>
      </div>
    );
  }

  const redeemUrl = buildVoucherRedeemUrl(v.code, v.share_token);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <div className="container max-w-screen-sm mx-auto px-3 py-6 space-y-3">
        <Card className="p-4 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <Ticket className="w-5 h-5 text-primary" />
            <span className="font-semibold">{v.type?.name || '抵用券'}</span>
            <Badge variant={VOUCHER_STATUS_VARIANT[v.status]} className="ml-auto">
              {VOUCHER_STATUS_LABEL[v.status] || v.status}
            </Badge>
          </div>
          {v.type && (
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold tabular-nums">¥{Number(v.type.face_value).toFixed(0)}</span>
              <span className="text-xs text-muted-foreground ml-1">有效 {v.type.valid_days} 天</span>
            </div>
          )}
          {v.type?.description && <p className="text-xs text-muted-foreground mt-1">{v.type.description}</p>}
          {v.type?.terms && <p className="text-[11px] text-muted-foreground mt-1.5">使用条款：{v.type.terms}</p>}
        </Card>

        {v.status === 'pending_apply' && (
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-medium">填写探店申请</h2>
            <div className="space-y-1.5">
              <Label className="text-xs">姓名</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="您的姓名" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">手机号</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={11} inputMode="numeric" placeholder="11 位手机号" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">小红书/抖音 主页截图</Label>
              <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-muted/30">
                <input type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files?.[0] || null)} />
                {shot ? (
                  <img src={shot} alt="截图" className="max-h-40 rounded" />
                ) : (
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Upload className="w-4 h-4" /> 点击上传
                  </span>
                )}
              </label>
            </div>
            <Button onClick={submit} disabled={submitting} className="w-full h-11">
              {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              提交申请
            </Button>
          </Card>
        )}

        {v.status === 'pending_review' && (
          <Card className="p-6 text-center space-y-2 bg-yellow-500/5 border-yellow-500/30">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-yellow-600" />
            <p className="text-sm font-medium">申请已提交,正在审核</p>
            <p className="text-xs text-muted-foreground">通过后会自动显示二维码,本页可保留查看</p>
          </Card>
        )}

        {v.status === 'approved' && (
          <Card className="p-5 flex flex-col items-center space-y-2 bg-background">
            <p className="text-xs text-muted-foreground">到店出示二维码核销</p>
            <QrCanvas value={redeemUrl} size={240} />
            <p className="font-mono text-lg tracking-widest">{v.code}</p>
            {v.expires_at && (
              <p className="text-xs text-muted-foreground">有效期至 {format(new Date(v.expires_at), 'yyyy-MM-dd')}</p>
            )}
          </Card>
        )}

        {v.status === 'redeemed' && (
          <Card className="p-6 text-center space-y-2 bg-muted/30">
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-600" />
            <p className="text-sm">已核销</p>
            {v.redeemed_at && (
              <p className="text-xs text-muted-foreground">{format(new Date(v.redeemed_at), 'yyyy-MM-dd HH:mm')}</p>
            )}
          </Card>
        )}

        {v.status === 'rejected' && (
          <Card className="p-6 text-center space-y-2 bg-destructive/5">
            <AlertTriangle className="w-10 h-10 mx-auto text-destructive" />
            <p className="text-sm">很遗憾,申请未通过</p>
            {v.reject_reason && <p className="text-xs text-muted-foreground">{v.reject_reason}</p>}
          </Card>
        )}

        {(v.status === 'expired' || v.status === 'revoked') && (
          <Card className="p-6 text-center text-sm text-muted-foreground bg-muted/30">
            该券已 {VOUCHER_STATUS_LABEL[v.status]}
          </Card>
        )}
      </div>
    </div>
  );
}
