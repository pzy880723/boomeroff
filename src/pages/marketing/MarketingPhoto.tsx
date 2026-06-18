import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, Download, RotateCw, FileText, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { uploadMarketingImages } from './uploadMarketingImages';
import { StepBar } from './StepBar';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ShopPicker } from '@/components/marketing/ShopPicker';
import { recallShop } from '@/hooks/useShops';

interface Toggles { exposure: boolean; geometry: boolean; denoise: boolean; declutter: boolean; bg_clean: boolean; }

export default function MarketingPhoto() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [shopId, setShopId] = useState<string | null>(recallShop());
  const [origUrl, setOrigUrl] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');
  const [toggles, setToggles] = useState<Toggles>({ exposure: true, geometry: true, denoise: true, declutter: true, bg_clean: false });

  const onPick = async (f: File | undefined) => {
    if (!shopId) { toast.error('请先选择店铺'); return; }
    if (!f || !user) return;
    setOutputUrl(null);
    try {
      const [url] = await uploadMarketingImages(user.id, [f]);
      setOrigUrl(url);
    } catch (e: any) { toast.error(e?.message || '上传失败'); }
  };

  const run = async () => {
    if (!origUrl) return;
    if (!shopId) { toast.error('请先选择店铺'); return; }
    setBusy(true); setOutputUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('beautify-image', { body: { image_url: origUrl, toggles, custom, shop_id: shopId } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setOutputUrl((data as any).output_url);
      toast.success('已修复');
    } catch (e: any) { toast.error(e?.message || '生成失败'); }
    finally { setBusy(false); }
  };

  const t = (k: keyof Toggles, label: string, hint: string) => (
    <label className="flex items-start gap-3 cursor-pointer py-2 border-b border-border/60 last:border-0">
      <Checkbox checked={toggles[k]} onCheckedChange={(v) => setToggles({ ...toggles, [k]: !!v })} className="mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
      </div>
    </label>
  );

  return (
    <>
      <PageHeader title="图片优化" back="/me/marketing" subtitle="营销中心 / 修图工坊" />
      <div className="container mx-auto max-w-screen-md px-4 py-4 space-y-5 pb-12">
        <StepBar steps={['上传图', '选修复项', '出图']} current={!origUrl ? 0 : !outputUrl ? 1 : 2} />

        {/* 工坊卡 */}
        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-4">
          <SectionLabel num="01">原片 / 修复后</SectionLabel>
          <p className="text-[11px] text-muted-foreground -mt-2">只做修复，不加滤镜：让随手拍回到正常质感。</p>

          {!origUrl ? (
            <label className="block">
              <div className="border-2 border-dashed border-accent/35 rounded-xl p-8 text-center cursor-pointer hover:bg-accent/[0.04] transition-colors">
                <Upload className="w-6 h-6 mx-auto mb-2 text-accent" strokeWidth={1.5} />
                <p className="font-display text-base text-foreground">上传一张图片</p>
                <p className="text-[11px] text-muted-foreground mt-1">JPG / PNG / HEIC · 单张</p>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Frame label="原图">
                <img src={origUrl} alt="原图" className="w-full aspect-square object-cover" />
              </Frame>
              <Frame label="修复后">
                {outputUrl ? (
                  <img src={outputUrl} alt="修复后" className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square bg-muted/40 flex items-center justify-center text-[11px] text-muted-foreground">
                    {busy ? <Loader2 className="w-5 h-5 animate-spin text-accent" /> : '点下方"开始修复"'}
                  </div>
                )}
              </Frame>
            </div>
          )}
        </section>

        {/* 开关 */}
        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5">
          <SectionLabel num="02">修复开关</SectionLabel>
          <div className="mt-3">
            {t('exposure', '自动曝光与白平衡', '欠曝 / 过曝 / 偏色归正')}
            {t('geometry', '去畸变 · 扶正', '修轻微镜头畸变和倾斜')}
            {t('denoise', '降噪 + 微锐化', '保留材质纹理，不磨皮')}
            {t('declutter', '去杂物', '去手、抹布、空袋、临时价签等')}
            {t('bg_clean', '背景净化（默认关）', '轻度模糊杂乱背景，不替换')}
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold mb-1.5">微调指令（可选）</p>
            <Input
              placeholder="如：光再暖一点 / 压一下右下角反光"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              maxLength={80}
              className="bg-transparent border-0 border-b border-border rounded-none focus-visible:ring-0 focus-visible:border-accent px-0 text-sm"
            />
          </div>
        </section>

        {/* 主 CTA */}
        <div className="flex gap-2">
          <Button onClick={run} disabled={!origUrl || busy} className="flex-1 h-11 font-medium">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
            {outputUrl ? '再修一版' : '开始修复'}
          </Button>
          {outputUrl && (
            <Button variant="outline" asChild className="h-11">
              <a href={outputUrl} target="_blank" rel="noreferrer" download>
                <Download className="w-4 h-4" />下载
              </a>
            </Button>
          )}
        </div>

        {outputUrl && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => nav('/me/marketing/copy', { state: { image_urls: [outputUrl] } })} className="h-10">
              <FileText className="w-4 h-4" />带去写文案
            </Button>
            <Button variant="secondary" onClick={() => nav('/me/marketing/video', { state: { image_urls: [outputUrl] } })} className="h-10">
              <Video className="w-4 h-4" />带去做视频
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function SectionLabel({ children, num }: { children: React.ReactNode; num?: string }) {
  return (
    <div className="flex items-center gap-2">
      {num && <span className="font-display text-[11px] text-accent tracking-[0.18em]">{num}</span>}
      <span className="w-1 h-1 rounded-full bg-accent" />
      <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">{children}</span>
    </div>
  );
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">{label}</p>
      <div className="rounded-lg overflow-hidden border border-accent/15 bg-card">
        {children}
      </div>
    </div>
  );
}
