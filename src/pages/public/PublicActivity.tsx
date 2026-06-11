// 公开：活动申请页（免登录）
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Megaphone, AlertTriangle, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ActivityField } from '@/lib/voucher';
import { formatVoucherRule } from '@/lib/voucher';

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function PublicActivity() {
  const { shareToken = '' } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!shareToken) return;
    (async () => {
      const { data, error: e } = await supabase.functions.invoke('activity-public', {
        body: { share_token: shareToken },
      });
      if (e || (data as any)?.error) {
        setError((data as any)?.error || e?.message || '活动不存在');
      } else {
        setActivity((data as any).activity);
      }
      setLoading(false);
    })();
  }, [shareToken]);

  const submit = async () => {
    if (!name.trim()) { toast.error('请输入姓名'); return; }
    if (!/^1[3-9]\d{9}$/.test(phone)) { toast.error('请输入正确的手机号'); return; }
    setSubmitting(true);
    const { data, error: e } = await supabase.functions.invoke('activity-apply', {
      body: {
        share_token: shareToken,
        applicant_name: name.trim(),
        applicant_phone: phone,
        form_data: formData,
      },
    });
    setSubmitting(false);
    if (e || (data as any)?.error) {
      toast.error((data as any)?.error || e?.message || '提交失败');
      return;
    }
    if ((data as any)?.requires_review === false && (data as any)?.short_code) {
      if ((data as any).already) toast.info('您已领取过该活动的抵用券');
      navigate(`/u/c/${(data as any).short_code}`, { replace: true });
      return;
    }
    setDone(true);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (error || !activity) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-6 text-center max-w-sm w-full space-y-2">
          <AlertTriangle className="w-10 h-10 mx-auto text-destructive" />
          <p className="text-sm">{error || '活动不存在'}</p>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-6 text-center max-w-sm w-full space-y-2">
          <CheckCircle2 className="w-10 h-10 mx-auto text-green-600" />
          <p className="text-base font-medium">申请已提交</p>
          <p className="text-xs text-muted-foreground">待审核通过后将通过短信通知您领取抵用券</p>

        </Card>
      </div>
    );
  }

  const v = activity.voucher;
  const fields: ActivityField[] = activity.form_fields || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-background py-6 px-4">
      <div className="max-w-sm mx-auto space-y-4">
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            <h1 className="text-base font-bold">{activity.name}</h1>
          </div>
          {activity.description && <p className="text-xs text-muted-foreground">{activity.description}</p>}
          {v && (
            <div className="bg-primary/10 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">通过审核可获</p>
              <p className="text-2xl font-bold text-primary tabular-nums">¥{v.discount_amount}</p>
              <p className="text-xs text-muted-foreground">{formatVoucherRule(v)} · 有效期 {v.valid_days} 天</p>
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <p className="text-sm font-medium">填写申请</p>
          <div className="space-y-1.5">
            <Label className="text-xs">姓名 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">手机号 *</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" maxLength={11} />
          </div>

          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs">{f.label}{f.required ? ' *' : ''}</Label>
              {f.type === 'image' ? (
                <label className="flex items-center justify-center gap-2 border border-dashed rounded-lg h-20 cursor-pointer hover:bg-accent/10">
                  {formData[f.key] ? (
                    <span className="text-xs text-green-700">已选择图片</span>
                  ) : (
                    <><Upload className="w-4 h-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">点击上传</span></>
                  )}
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      if (file.size > 5 * 1024 * 1024) { toast.error('图片不能超过 5MB'); return; }
                      const dataUrl = await fileToDataUrl(file);
                      setFormData((d) => ({ ...d, [f.key]: dataUrl }));
                    }}
                  />
                </label>
              ) : f.type === 'textarea' ? (
                <Textarea
                  value={formData[f.key] || ''}
                  onChange={(e) => setFormData((d) => ({ ...d, [f.key]: e.target.value }))}
                  maxLength={500} rows={3} placeholder={f.placeholder}
                />
              ) : (
                <Input
                  type={f.type === 'phone' ? 'tel' : f.type === 'url' ? 'url' : 'text'}
                  value={formData[f.key] || ''}
                  onChange={(e) => setFormData((d) => ({ ...d, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}

          <Button onClick={submit} disabled={submitting} className="w-full h-11">
            {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}提交申请
          </Button>
        </Card>
      </div>
    </div>
  );
}
