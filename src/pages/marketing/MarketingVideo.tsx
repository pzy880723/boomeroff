import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, X, AlertTriangle, CheckCircle2, Camera, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { uploadMarketingImages } from './uploadMarketingImages';
import { StepBar } from './StepBar';
import { toast } from 'sonner';

const VIDEO_TYPES = [
  { v: 'store_tour', label: '探店' },
  { v: 'product_showcase', label: '产品展示' },
  { v: 'store_ambience', label: '店铺氛围' },
  { v: 'new_arrival', label: '新品上架' },
] as const;
type VType = typeof VIDEO_TYPES[number]['v'];
const DURATIONS = [15, 20, 30] as const;
const ASPECTS = ['9:16', '1:1', '16:9'] as const;

export default function MarketingVideo() {
  const { user } = useAuth();
  const loc = useLocation();
  const [urls, setUrls] = useState<string[]>((loc.state as any)?.image_urls || []);
  const [vtype, setVtype] = useState<VType>('store_tour');
  const [duration, setDuration] = useState<15 | 20 | 30>(15);
  const [aspect, setAspect] = useState<typeof ASPECTS[number]>('9:16');
  const [highlight, setHighlight] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [script, setScript] = useState<any>(null);
  const [rendering, setRendering] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const onPick = async (files: FileList | null) => {
    if (!files || !user) return;
    const arr = Array.from(files).slice(0, 10 - urls.length);
    try {
      const newUrls = await uploadMarketingImages(user.id, arr);
      setUrls([...urls, ...newUrls]);
      setAnalysis(null); setScript(null);
    } catch (e: any) { toast.error(e?.message || '上传失败'); }
  };

  const analyze = async () => {
    if (!urls.length) return toast.error('请先上传素材');
    setAnalyzing(true); setAnalysis(null); setScript(null);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-marketing-assets', {
        body: { image_urls: urls, video_type: vtype },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setAnalysis(data);
    } catch (e: any) { toast.error(e?.message || '分析失败'); }
    finally { setAnalyzing(false); }
  };

  const genScript = async () => {
    if (!urls.length) return;
    setGenerating(true); setScript(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-marketing-video-script', {
        body: { image_urls: urls, video_type: vtype, duration, aspect, highlight, labels: analysis?.labels || [] },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setScript((data as any).script);
    } catch (e: any) { toast.error(e?.message || '脚本生成失败'); }
    finally { setGenerating(false); }
  };

  const confirmRender = async () => {
    if (!script) return;
    setRendering(true);
    try {
      const { data, error } = await supabase.functions.invoke('render-marketing-video', { body: { script: { ...script, video_type: vtype } } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setJobId((data as any).job_id);
      toast.success('已确认脚本，渲染任务已入队');
    } catch (e: any) { toast.error(e?.message || '提交失败'); }
    finally { setRendering(false); }
  };

  const updateScene = (key: 'hook' | 'outro', field: string, val: any) => {
    setScript({ ...script, [key]: { ...script[key], [field]: val } });
  };
  const updateMid = (i: number, field: string, val: any) => {
    const scenes = [...script.scenes];
    scenes[i] = { ...scenes[i], [field]: val };
    setScript({ ...script, scenes });
  };

  return (
    <>
      <PageHeader title="AI 视频" back="/me/marketing" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-4">
        {/* 素材 */}
        <Card className="p-3 space-y-2">
          <p className="text-sm font-medium">素材（最多 10 张）</p>
          <div className="grid grid-cols-4 gap-2">
            {urls.map((u, i) => (
              <div key={i} className="relative aspect-square">
                <img src={u} alt="" className="w-full h-full object-cover rounded-md border" />
                <span className="absolute top-0.5 left-0.5 bg-background/80 text-[10px] px-1 rounded">#{i}</span>
                <button onClick={() => { setUrls(urls.filter((_, j) => j !== i)); setAnalysis(null); setScript(null); }} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-background border flex items-center justify-center">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {urls.length < 10 && (
              <label className="aspect-square border-2 border-dashed rounded-md flex items-center justify-center cursor-pointer hover:bg-accent/10">
                <Upload className="w-4 h-4 text-muted-foreground" />
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
              </label>
            )}
          </div>
        </Card>

        {/* 设置 */}
        <Card className="p-4 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">视频类型</p>
            <div className="flex flex-wrap gap-1.5">
              {VIDEO_TYPES.map((t) => (
                <Badge key={t.v} variant={vtype === t.v ? 'default' : 'outline'} className="cursor-pointer" onClick={() => { setVtype(t.v); setAnalysis(null); setScript(null); }}>{t.label}</Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">时长</p>
              <div className="flex gap-1.5">
                {DURATIONS.map((d) => (
                  <Badge key={d} variant={duration === d ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setDuration(d)}>{d}s</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">画幅</p>
              <div className="flex gap-1.5">
                {ASPECTS.map((a) => (
                  <Badge key={a} variant={aspect === a ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setAspect(a)}>{a}</Badge>
                ))}
              </div>
            </div>
          </div>
          <Input placeholder="想突出什么（可选）" value={highlight} onChange={(e) => setHighlight(e.target.value)} maxLength={80} />
        </Card>

        {/* Step 1: 素材分析 */}
        {!script && (
          <Button onClick={analyze} disabled={analyzing || !urls.length} className="w-full" variant={analysis ? 'outline' : 'default'}>
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {analysis ? '重新分析素材' : '第一步：分析素材是否足够'}
          </Button>
        )}

        {analysis && !script && (
          <Card className={`p-4 space-y-3 border-2 ${analysis.sufficiency === 'ok' ? 'border-green-500/40' : analysis.sufficiency === 'partial' ? 'border-yellow-500/40' : 'border-destructive/40'}`}>
            <div className="flex items-center gap-2">
              {analysis.sufficiency === 'ok' ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertTriangle className="w-5 h-5 text-yellow-600" />}
              <p className="font-medium text-sm">
                {analysis.sufficiency === 'ok' && `素材充足，可以做${analysis.video_type_label}`}
                {analysis.sufficiency === 'partial' && `做${analysis.video_type_label}还差一点`}
                {analysis.sufficiency === 'insufficient' && `素材不够做${analysis.video_type_label}`}
              </p>
            </div>
            {analysis.required?.length > 0 && (
              <div className="text-xs space-y-1">
                {analysis.required.map((r: any) => (
                  <div key={r.slot} className="flex items-center gap-2">
                    <span className={r.ok ? 'text-green-600' : 'text-destructive'}>{r.ok ? '✓' : '✗'}</span>
                    <span>必备 · {r.label}：{r.have}/{r.minCount}</span>
                    {!r.ok && <span className="text-muted-foreground">— {r.hint}</span>}
                  </div>
                ))}
              </div>
            )}
            {analysis.missing_recommended?.length > 0 && (
              <div className="text-xs text-muted-foreground">
                推荐补：{analysis.missing_recommended.map((r: any) => r.label).join('、')}
              </div>
            )}
            {analysis.sufficiency === 'insufficient' ? (
              <div className="space-y-2">
                <p className="text-xs">请按下面清单补拍 3–5 张再回来：</p>
                <div className="text-xs bg-muted p-2 rounded space-y-0.5">
                  {analysis.missing_required.map((r: any) => <div key={r.slot}>□ {r.label} — {r.hint}</div>)}
                </div>
                <Button size="sm" variant="outline" onClick={() => {
                  const text = analysis.missing_required.map((r: any) => `□ ${r.label}：${r.hint}`).join('\n');
                  navigator.clipboard.writeText(text); toast.success('清单已复制');
                }}><Copy className="w-3.5 h-3.5" />复制清单给同事</Button>
              </div>
            ) : (
              <Button onClick={genScript} disabled={generating} className="w-full">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {analysis.sufficiency === 'ok' ? '第二步：生成脚本' : '坚持生成脚本（质量可能打折）'}
              </Button>
            )}
          </Card>
        )}

        {/* Step 2: 脚本逐镜确认 */}
        {script && (
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">脚本（请逐镜确认）</p>
              <Button size="sm" variant="ghost" onClick={genScript} disabled={generating}>
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}重新生成
              </Button>
            </div>

            <SceneRow title={`钩子 · ${script.hook.duration_s}s`} scene={script.hook} urls={urls} onText={(v) => updateScene('hook', 'text', v)} onImg={(v) => updateScene('hook', 'image_index', v)} />
            {script.scenes.map((sc: any, i: number) => (
              <SceneRow key={i} title={`镜头 ${i + 1} · ${sc.duration_s}s`} scene={sc} urls={urls} onText={(v) => updateMid(i, 'text', v)} onImg={(v) => updateMid(i, 'image_index', v)} />
            ))}
            <SceneRow title={`收尾 · ${script.outro.duration_s}s`} scene={script.outro} urls={urls} onText={(v) => updateScene('outro', 'text', v)} onImg={(v) => updateScene('outro', 'image_index', v)} />

            <div className="text-xs text-muted-foreground">BGM：{script.bgm} · 总时长 {script.total_duration_s}s · {script.aspect}</div>

            {!jobId ? (
              <Button onClick={confirmRender} disabled={rendering} className="w-full">
                {rendering ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                ✅ 确认脚本，开始渲染
              </Button>
            ) : (
              <Card className="p-3 bg-muted text-xs space-y-1">
                <p className="font-medium">渲染任务已入队 · ID {jobId.slice(0, 8)}</p>
                <p className="text-muted-foreground">视频会在后台合成；完成后会出现在素材库。</p>
              </Card>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

function SceneRow({ title, scene, urls, onText, onImg }: { title: string; scene: any; urls: string[]; onText: (v: string) => void; onImg: (v: number) => void; }) {
  return (
    <div className="border rounded-lg p-2 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title} · {scene.motion}</p>
      <div className="flex gap-2">
        <img src={urls[scene.image_index]} alt="" className="w-16 h-16 object-cover rounded border" />
        <div className="flex-1 space-y-1">
          <Input value={scene.text} onChange={(e) => onText(e.target.value)} maxLength={28} className="h-8 text-sm" />
          <div className="flex gap-1 flex-wrap">
            {urls.map((_, i) => (
              <button key={i} onClick={() => onImg(i)} className={`text-[10px] px-1.5 py-0.5 rounded border ${scene.image_index === i ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>#{i}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
