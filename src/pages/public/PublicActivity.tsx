// 公开：活动报名页（免登录）—— 与海报同款暖棕主题
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Upload, X, ZoomIn } from 'lucide-react';
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

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
        onClick={onClose}
        aria-label="关闭"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={src}
        alt=""
        className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
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
  const [lightbox, setLightbox] = useState<string | null>(null);

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
      toast.error((data as any)?.error || e?.message || '报名失败');
      return;
    }
    const d = data as any;
    if (d?.short_code) {
      if (d.already) toast.info('您已领取过该活动的优惠券');
      navigate(`/u/c/${d.short_code}`, { replace: true });
      return;
    }
    toast.error('报名成功但未生成优惠券，请联系客服');
  };

  // 主题色（与海报/券同款暖棕系）
  const bgStyle = {
    background:
      'linear-gradient(135deg, #1f1409 0%, #3b2410 38%, #6b3a18 70%, #b48142 100%)',
  } as const;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={bgStyle}>
        <Loader2 className="w-6 h-6 animate-spin text-amber-200" />
      </div>
    );
  }
  if (error || !activity) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
        <div className="bg-[#fdf6e8] rounded-3xl p-6 text-center max-w-sm w-full space-y-2 shadow-2xl">
          <AlertTriangle className="w-10 h-10 mx-auto text-[#8e1f10]" />
          <p className="text-sm text-[#3b2410]">{error || '活动不存在'}</p>
        </div>
      </div>
    );
  }

  const v = activity.voucher;
  const fields: ActivityField[] = activity.form_fields || [];
  const now = new Date();
  const notStarted = activity.starts_at && new Date(activity.starts_at) > now;
  const ended = activity.ends_at && new Date(activity.ends_at) < now;
  const fmt = (s: string) => {
    const d = new Date(s);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="min-h-screen relative" style={bgStyle}>
      {/* 柔光斑 */}
      <div className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 rounded-full opacity-40 blur-3xl" style={{ background: '#f5c66e' }} />
      <div className="pointer-events-none absolute -bottom-24 -left-10 w-80 h-80 rounded-full opacity-25 blur-3xl" style={{ background: '#ffd28a' }} />

      <div className="relative max-w-sm mx-auto px-4 py-7 space-y-4">
        {/* 顶部品牌 */}
        <header className="flex items-center justify-between text-[#fff5e1]">
          <div className="text-[11px] tracking-[0.3em] opacity-90">BOOMER-OFF</div>
          <div className="text-[11px] opacity-70">中古限定礼遇</div>
        </header>

        {/* 标题区 */}
        <div className="text-[#fff5e1] space-y-2 mt-2">
          <div className="text-[13px] opacity-80">为你专属准备</div>
          <h1 className="text-2xl font-semibold leading-tight">{activity.name}</h1>
          {activity.description && (
            <p className="text-[13px] leading-relaxed text-[#ffe7bd] whitespace-pre-wrap line-clamp-3">
              {activity.description}
            </p>
          )}
          {(activity.starts_at || activity.ends_at) && (
            <p className="text-[11px] text-[#ffd28a]/90">
              活动时间　{activity.starts_at ? fmt(activity.starts_at) : '不限'} ~ {activity.ends_at ? fmt(activity.ends_at) : '不限'}
            </p>
          )}
        </div>

        {/* 福利卡 */}
        {v && (
          <div
            className="rounded-2xl p-4 text-center text-[#3b2410]"
            style={{ background: 'linear-gradient(135deg, #fde9b8 0%, #ffd28a 100%)', boxShadow: '0 20px 40px -20px rgba(0,0,0,0.4)' }}
          >
            <p className="text-[11px] tracking-widest opacity-70">报名即可领取</p>
            <p className="mt-1 font-bold tabular-nums leading-none" style={{ fontSize: 64, color: '#8e1f10' }}>
              <span className="text-3xl align-top mr-1">¥</span>{v.discount_amount}
            </p>
            <p className="mt-2 text-sm font-medium">{formatVoucherRule(v)}</p>
            <p className="mt-0.5 text-[11px] opacity-70">有效期 {v.valid_days} 天 · 仅到店核销</p>
          </div>
        )}

        {notStarted ? (
          <div className="bg-[#fdf6e8] rounded-2xl p-6 text-center text-sm text-[#3b2410] space-y-1">
            <p className="font-medium">活动尚未开始</p>
            <p className="text-xs text-muted-foreground">开始时间：{fmt(activity.starts_at)}</p>
          </div>
        ) : ended ? (
          <div className="bg-[#fdf6e8] rounded-2xl p-6 text-center text-sm space-y-1">
            <p className="font-medium text-[#8e1f10]">活动已结束</p>
            <p className="text-xs text-[#6b3a18]/70">结束时间：{fmt(activity.ends_at)}</p>
          </div>
        ) : (
          <div className="bg-[#fdf6e8] rounded-2xl p-4 space-y-3 text-[#2d1b0e] shadow-xl">
            <p className="text-sm font-semibold">填写下方信息即可确认报名</p>

            <div className="space-y-1.5">
              <Label className="text-xs text-[#6b3a18]">姓名 *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                className="bg-white border-[#e8d5b3] rounded-xl h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#6b3a18]">手机号 *</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="numeric"
                maxLength={11}
                className="bg-white border-[#e8d5b3] rounded-xl h-11"
              />
            </div>

            {fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-xs text-[#6b3a18]">
                  {f.label}{f.required ? ' *' : ''}
                </Label>
                {f.type === 'image' ? (
                  formData[f.key] ? (
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => setLightbox(formData[f.key])}
                        className="relative w-24 h-24 rounded-xl overflow-hidden border border-[#e8d5b3] shadow-sm group"
                      >
                        <img
                          src={formData[f.key]}
                          alt={f.label}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                          <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" />
                        </div>
                      </button>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs text-[#8e1f10] underline cursor-pointer">
                          重新上传
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
                        <button
                          type="button"
                          className="text-xs text-[#6b3a18]/70 inline-flex items-center gap-1"
                          onClick={() => setFormData((d) => ({ ...d, [f.key]: null }))}
                        >
                          <X className="w-3 h-3" /> 移除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 border border-dashed border-[#c8a878] rounded-xl h-24 cursor-pointer bg-white/60 hover:bg-white">
                      <Upload className="w-4 h-4 text-[#6b3a18]/70" />
                      <span className="text-xs text-[#6b3a18]/80">点击上传图片</span>
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
                  )
                ) : f.type === 'textarea' ? (
                  <Textarea
                    value={formData[f.key] || ''}
                    onChange={(e) => setFormData((d) => ({ ...d, [f.key]: e.target.value }))}
                    maxLength={500} rows={3} placeholder={f.placeholder}
                    className="bg-white border-[#e8d5b3] rounded-xl"
                  />
                ) : (
                  <Input
                    type={f.type === 'phone' ? 'tel' : f.type === 'url' ? 'url' : 'text'}
                    value={formData[f.key] || ''}
                    onChange={(e) => setFormData((d) => ({ ...d, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="bg-white border-[#e8d5b3] rounded-xl h-11"
                  />
                )}
              </div>
            ))}

            <button
              onClick={submit}
              disabled={submitting}
              className="w-full h-12 rounded-xl text-white font-medium text-base shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #b3331d 0%, #8e1f10 100%)' }}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              确认报名
            </button>
            <p className="text-[11px] text-center text-[#6b3a18]/60">
              提交即视为同意将信息用于本次活动核验
            </p>
          </div>
        )}

        <p className="text-center text-[11px] text-[#fff5e1]/55 pt-2">
          由 BOOMER · OFF 中古小店呈上
        </p>
      </div>

      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
