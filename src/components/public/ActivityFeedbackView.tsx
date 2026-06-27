// 活动反馈视图（已领券者再次扫码后展示）
// - 顶部：再次打开自己的优惠券（再截图一次）
// - 中部：上传发布截图 + 发布链接 + 备注 → 自助提交反馈
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { invokeFn } from '@/lib/invokeFn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, QrCode, Upload, X as XIcon, CheckCircle2, ChevronLeft } from 'lucide-react';
import { formatVoucherRule } from '@/lib/voucher';

type ImgItem = { path: string; signed_url: string };

const CLAIM_LABEL: Record<string, string> = {
  claimed: '待核销',
  redeemed: '已核销',
  expired: '已过期',
  void: '已失效',
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function ActivityFeedbackView({
  shareToken,
  shortCode,
  voucher,
  onSwitchToForm,
}: {
  shareToken: string;
  shortCode: string;
  voucher: { name?: string; discount_amount?: number; min_spend?: number; threshold_type?: string; valid_days?: number } | null;
  onSwitchToForm: () => void;
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [imgs, setImgs] = useState<ImgItem[]>([]);
  const [publishUrl, setPublishUrl] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const { data: resp, error } = await invokeFn<any>('activity-feedback', {
      body: { action: 'get', share_token: shareToken, short_code: shortCode },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      // 数据不对，清掉本地缓存并返回报名页
      localStorage.removeItem(`activity_claim:${shareToken}`);
      onSwitchToForm();
      return;
    }
    const d = resp as any;
    setData(d);
    setImgs((d.application?.publish_screenshots_signed || []) as ImgItem[]);
    setPublishUrl(d.application?.publish_url || '');
    setNote(d.application?.publish_confirm_note || '');
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareToken, shortCode]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newOnes: ImgItem[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) { toast.error(`${file.name} 不是图片`); continue; }
        if (file.size > 8 * 1024 * 1024) { toast.error(`${file.name} 超过 8MB`); continue; }
        const dataUrl = await fileToDataUrl(file);
        const { data: resp, error } = await supabase.functions.invoke('activity-feedback', {
          body: { action: 'upload', share_token: shareToken, short_code: shortCode, data_url: dataUrl },
        });
        if (error || (resp as any)?.error) {
          toast.error((resp as any)?.error || error?.message || '上传失败');
          continue;
        }
        const r = resp as any;
        if (r?.path && r?.signed_url) newOnes.push({ path: r.path, signed_url: r.signed_url });
      }
      if (newOnes.length) setImgs((arr) => [...arr, ...newOnes]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeImg = (path: string) => setImgs((arr) => arr.filter((x) => x.path !== path));

  const submit = async () => {
    if (publishUrl && !/^https?:\/\//i.test(publishUrl.trim())) {
      toast.error('链接需以 http(s):// 开头');
      return;
    }
    setSubmitting(true);
    const { data: resp, error } = await supabase.functions.invoke('activity-feedback', {
      body: {
        action: 'submit',
        share_token: shareToken,
        short_code: shortCode,
        publish_screenshots: imgs.map((x) => x.path),
        publish_url: publishUrl.trim() || null,
        note: note.trim() || null,
      },
    });
    setSubmitting(false);
    if (error || (resp as any)?.error) {
      toast.error((resp as any)?.error || error?.message || '提交失败');
      return;
    }
    toast.success('反馈已提交，门店会尽快确认');
  };

  if (loading) {
    return (
      <div className="bg-[#fdf6e8] rounded-2xl p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#8e1f10]" />
      </div>
    );
  }

  const claim = data?.claim;
  const v = voucher || data?.voucher;
  const confirmed = !!data?.application?.publish_confirmed;

  return (
    <>
      <div className="space-y-3">
        {/* 你的优惠券 */}
        <div className="bg-[#fdf6e8] rounded-2xl p-4 space-y-3 shadow-xl text-[#2d1b0e]">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">你的优惠券</div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${
              claim?.status === 'redeemed' ? 'bg-emerald-100 text-emerald-700'
              : claim?.status === 'expired' || claim?.status === 'void' ? 'bg-zinc-200 text-zinc-600'
              : 'bg-amber-100 text-amber-800'
            }`}>
              {CLAIM_LABEL[claim?.status] || claim?.status || '—'}
            </span>
          </div>
          {v && (
            <div className="rounded-xl px-3 py-3 text-center" style={{ background: 'linear-gradient(135deg, #fde9b8 0%, #ffd28a 100%)' }}>
              <p className="text-3xl font-bold tabular-nums leading-none text-[#8e1f10]">
                <span className="text-lg align-top mr-0.5">¥</span>{v.discount_amount}
              </p>
              <p className="mt-1.5 text-xs font-medium">{formatVoucherRule(v as any)}</p>
              {claim?.expires_at && (
                <p className="mt-1 text-[11px] text-[#6b3a18]/70">
                  有效至 {new Date(claim.expires_at).toLocaleDateString('zh-CN')}
                </p>
              )}
            </div>
          )}
          <Button
            onClick={() => navigate(`/u/c/${shortCode}`)}
            className="w-full h-11 bg-[#8e1f10] hover:bg-[#8e1f10]/90 text-white"
          >
            <QrCode className="w-4 h-4 mr-1.5" /> 打开优惠券二维码
          </Button>
          <p className="text-[11px] text-center text-[#6b3a18]/60">
            到店出示给店员核销 · 忘截图可随时重新打开
          </p>
        </div>

        {/* 发布反馈 */}
        <div className="bg-[#fdf6e8] rounded-2xl p-4 space-y-3 shadow-xl text-[#2d1b0e]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">提交发布反馈</p>
            {confirmed && (
              <span className="inline-flex items-center text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 mr-0.5" /> 门店已确认
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#6b3a18]">发布截图（可多张）</Label>
            <div className="grid grid-cols-3 gap-2">
              {imgs.map((img) => (
                <div key={img.path} className="relative group rounded-lg overflow-hidden border border-[#e8d5b3] bg-white">
                  <button
                    type="button"
                    onClick={() => setLightbox(img.signed_url)}
                    className="block w-full"
                  >
                    <img src={img.signed_url} alt="" className="w-full h-20 object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImg(img.path)}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white"
                    aria-label="移除"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="h-20 rounded-lg border border-dashed border-[#c8a878] bg-white/60 hover:bg-white flex flex-col items-center justify-center text-[#6b3a18]/80 disabled:opacity-60"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="text-[10px] mt-0.5">{uploading ? '上传中' : '添加'}</span>
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#6b3a18]">发布链接（小红书 / 抖音 / 大众点评 等）</Label>
            <Input
              value={publishUrl}
              onChange={(e) => setPublishUrl(e.target.value)}
              placeholder="https://..."
              inputMode="url"
              className="bg-white border-[#e8d5b3] rounded-xl h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#6b3a18]">备注（可选）</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="想跟门店说点什么？"
              className="bg-white border-[#e8d5b3] rounded-xl"
            />
          </div>

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full h-12 rounded-xl text-white font-medium text-base shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #b3331d 0%, #8e1f10 100%)' }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            提交反馈
          </button>
          <p className="text-[11px] text-center text-[#6b3a18]/60">
            可多次修改提交 · 门店复核后将不再公开展示
          </p>
        </div>

        {/* 返回报名 */}
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem(`activity_claim:${shareToken}`);
            onSwitchToForm();
          }}
          className="w-full text-center text-[12px] text-[#ffd28a]/80 underline underline-offset-2 inline-flex items-center justify-center gap-1"
        >
          <ChevronLeft className="w-3 h-3" /> 不是本人？返回报名页
        </button>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
            onClick={() => setLightbox(null)}
            aria-label="关闭"
          >
            <XIcon className="w-5 h-5" />
          </button>
          <img
            src={lightbox}
            alt=""
            className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
