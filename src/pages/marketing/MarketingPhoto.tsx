import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, Download, RotateCw, FileText, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { uploadMarketingImages } from './uploadMarketingImages';
import { StepBar } from './StepBar';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface Toggles { exposure: boolean; geometry: boolean; denoise: boolean; declutter: boolean; bg_clean: boolean; }

export default function MarketingPhoto() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [origUrl, setOrigUrl] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');
  const [toggles, setToggles] = useState<Toggles>({ exposure: true, geometry: true, denoise: true, declutter: true, bg_clean: false });

  const onPick = async (f: File | undefined) => {
    if (!f || !user) return;
    setOutputUrl(null);
    try {
      const [url] = await uploadMarketingImages(user.id, [f]);
      setOrigUrl(url);
    } catch (e: any) { toast.error(e?.message || '上传失败'); }
  };

  const run = async () => {
    if (!origUrl) return;
    setBusy(true); setOutputUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('beautify-image', { body: { image_url: origUrl, toggles, custom } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setOutputUrl((data as any).output_url);
      toast.success('已修复');
    } catch (e: any) { toast.error(e?.message || '生成失败'); }
    finally { setBusy(false); }
  };

  const t = (k: keyof Toggles, label: string, hint: string) => (
    <label className="flex items-start gap-2 cursor-pointer">
      <Checkbox checked={toggles[k]} onCheckedChange={(v) => setToggles({ ...toggles, [k]: !!v })} className="mt-0.5" />
      <div className="flex-1">
        <p className="text-sm">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </label>
  );

  return (
    <>
      <PageHeader title="图片优化" back="/me/marketing" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground mb-3">只做修复，不加滤镜：让随手拍的照片回到"正常质感"。</p>
          {!origUrl ? (
            <label className="block">
              <div className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:bg-accent/10">
                <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm">点击上传一张图片</p>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">原图</p>
                <img src={origUrl} alt="原图" className="w-full aspect-square object-cover rounded-lg border" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">修复后</p>
                {outputUrl ? (
                  <img src={outputUrl} alt="修复后" className="w-full aspect-square object-cover rounded-lg border" />
                ) : (
                  <div className="w-full aspect-square rounded-lg border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : '点下方"开始修复"'}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <p className="text-sm font-medium">修复开关</p>
          {t('exposure', '自动曝光与白平衡', '欠曝/过曝/偏色归正')}
          {t('geometry', '去畸变 / 扶正', '修轻微镜头畸变和倾斜')}
          {t('denoise', '降噪 + 微锐化', '保留材质纹理，不磨皮')}
          {t('declutter', '去杂物', '去手、抹布、空袋、临时价签等')}
          {t('bg_clean', '背景净化（默认关）', '轻度模糊杂乱背景，不替换')}
          <Input placeholder="可选微调，如：光再暖一点 / 压一下右下角反光" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={80} />
        </Card>

        <div className="flex gap-2">
          <Button onClick={run} disabled={!origUrl || busy} className="flex-1">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
            {outputUrl ? '再修一版' : '开始修复'}
          </Button>
          {outputUrl && (
            <Button variant="outline" asChild>
              <a href={outputUrl} target="_blank" rel="noreferrer" download>
                <Download className="w-4 h-4" />下载
              </a>
            </Button>
          )}
        </div>

        {outputUrl && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => nav('/me/marketing/copy', { state: { image_urls: [outputUrl] } })}>
              <FileText className="w-4 h-4" />带去写文案
            </Button>
            <Button variant="secondary" onClick={() => nav('/me/marketing/video', { state: { image_urls: [outputUrl] } })}>
              <Video className="w-4 h-4" />带去做视频
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
