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
  const [agreed, setAgreed] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);

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
    if (!agreed) { toast.error('请先勾选并同意《活动参与确认协议》'); return; }
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

  const agreementText = useMemo(() => {
    const desc: string = activity.description || '';
    const isExplore = /小红书|探店|笔记|种草|发布|文案|xhs/i.test(desc);
    const timeRange = `${activity.starts_at ? fmt(activity.starts_at) : '不限'} 至 ${activity.ends_at ? fmt(activity.ends_at) : '不限'}`;
    const voucherLine = v ? `${formatVoucherRule(v)}，有效期 ${v.valid_days} 天，仅限到店核销，不可转让、兑现或找零。` : '本活动关联优惠券，具体规则以活动页展示为准。';
    const exploreBlock = isExplore ? `

四、内容发布义务（探店/笔记类专项）
1. 您应在领取优惠券后 7 个自然日内，在小红书发布一条不少于 100 字、含 3 张及以上到店实拍图的真实探店笔记；笔记应 @ 门店账号或带门店定位、指定话题（活动描述另有约定的，以活动描述为准）。
2. 笔记内容必须基于您本人真实到店体验，不得抄袭、搬运他人内容，不得使用 AI 一键生成、虚假摆拍或夸大宣传，不得包含违法、违规、低俗或侵权信息。
3. 笔记发布后 30 个自然日内，不得删除、设为私密、隐藏或对内容作大幅修改。如因平台限流、审核未通过等原因导致笔记不可见，您应在 3 个自然日内重新发布并通知门店。
4. 门店有权要求您提供笔记链接以核验。未按本条约定发布、删除/隐藏笔记或内容明显与到店事实不符的，门店有权停用您尚未使用的优惠券；已核销的，您应按所享优惠的等额金额向门店补足相应价款。` : '';

    return `《活动参与确认协议》

本协议由 BOOMER-OFF 中古门店（以下简称"门店"）与本次活动报名人（以下简称"您"）就「${activity.name}」活动（以下简称"本活动"）的参与事宜共同确认。您勾选"我已阅读并同意"并提交报名信息，即视为您已充分阅读、理解并同意本协议全部条款，本协议自此对双方生效。

一、活动信息
1. 活动名称：${activity.name}
2. 活动时间：${timeRange}
3. 活动权益：${voucherLine}
4. 活动具体内容、参与方式与权益细则，以本活动页面所展示的"活动描述"为准；本协议与活动描述不一致的，以更有利于规范活动秩序的一方为准。

二、报名信息真实性
您承诺所填写的姓名、手机号及上传的截图、链接等全部信息均真实、准确、合法、有效，且为您本人信息。如因信息虚假、伪造、盗用他人信息导致无法核销或产生纠纷的，门店有权拒绝提供活动权益，并保留进一步追究的权利。

三、优惠券使用规则
1. 同一自然人、同一手机号在本活动中仅可领取一次。
2. 优惠券仅限在门店到店消费时核销，不可转让、不可兑现、不可找零、不与其他优惠叠加（活动另有说明的除外）。
3. 优惠券超过有效期或活动结束时间的，自动失效。${exploreBlock}

${isExplore ? '五' : '四'}、个人信息处理
门店仅在本活动核验、优惠券发放与必要联系范围内处理您的个人信息，不会将其用于其他商业用途。相关信息的保存期限不超过本活动结束后 90 日，到期后将被删除或匿名化处理。依据《中华人民共和国个人信息保护法》，您有权要求门店查询、更正、删除您的个人信息。

${isExplore ? '六' : '五'}、违约与争议处理
您违反本协议任一条款的，门店有权立即取消您的报名资格、停用相关优惠券，并不退还已享受的活动权益。因本活动产生争议的，双方应本着诚信原则友好协商解决；协商不成的，依法向门店所在地有管辖权的人民法院提起诉讼。

${isExplore ? '七' : '六'}、最终解释权
在不违反法律强制性规定的前提下，本活动及本协议的最终解释权归 BOOMER-OFF 中古门店所有。`;
  }, [activity, v]);


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

            <div className="flex items-start gap-2 pt-1">
              <Checkbox
                id="agree-protocol"
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
                className="mt-0.5 border-[#8e1f10] data-[state=checked]:bg-[#8e1f10] data-[state=checked]:text-white"
              />
              <label htmlFor="agree-protocol" className="text-[12px] leading-relaxed text-[#3b2410] cursor-pointer select-none">
                我已阅读并同意
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setAgreementOpen(true); }}
                  className="text-[#8e1f10] underline underline-offset-2 mx-0.5"
                >
                  《活动参与确认协议》
                </button>
              </label>
            </div>

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
              勾选并提交即视为同意上述协议，您的信息仅用于本次活动核验
            </p>
          </div>
        )}

        <Dialog open={agreementOpen} onOpenChange={setAgreementOpen}>
          <DialogContent className="max-w-md max-h-[85vh] bg-[#fdf6e8] border-[#e8d5b3]">
            <DialogHeader>
              <DialogTitle className="text-[#3b2410]">活动参与确认协议</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#3b2410] font-sans">{agreementText}</pre>
            </div>
            <DialogFooter>
              <Button
                onClick={() => { setAgreed(true); setAgreementOpen(false); }}
                className="bg-[#8e1f10] hover:bg-[#8e1f10]/90 text-white"
              >
                我已阅读并同意
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* placeholder-end */}
        <div className="hidden">
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
