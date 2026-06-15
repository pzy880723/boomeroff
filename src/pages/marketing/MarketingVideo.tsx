import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, AlertTriangle, CheckCircle2, Camera, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { UploadGrid } from './UploadGrid';
import { AspectPicker } from './AspectPicker';
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

  const onUrlsChange = (next: string[]) => {
    setUrls(next);
    setAnalysis(null);
    setScript(null);
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
      <PageHeader title="AI 视频" back="/me/marketing" subtitle="营销中心 / 做视频" />
      <div className="container mx-auto max-w-screen-md px-4 py-4 space-y-5 pb-12">
        <StepBar
          steps={['上传素材', '检查充足度', '确认脚本', '渲染']}
          current={urls.length === 0 ? 0 : !analysis ? 1 : !script ? 2 : !jobId ? 2 : 3}
        />

        <UploadGrid urls={urls} onChange={onUrlsChange} max={10} preset="thumb" title="素材" />

        {/* 设置 */}
        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-5">
          <SectionLabel num="01">视频类型</SectionLabel>
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {VIDEO_TYPES.map((t) => (
              <Chip key={t.v} active={vtype === t.v} onClick={() => { setVtype(t.v); setAnalysis(null); setScript(null); }}>{t.label}</Chip>
            ))}
          </div>

          <SectionLabel num="02">时长</SectionLabel>
          <div className="-mt-2 flex gap-1.5">
            {DURATIONS.map((d) => (
              <Chip key={d} active={duration === d} onClick={() => setDuration(d)}>{d} 秒</Chip>
            ))}
          </div>

          <SectionLabel num="03">画幅</SectionLabel>
          <div className="-mt-2">
            <AspectPicker value={aspect} onChange={(v) => setAspect(v as typeof ASPECTS[number])} />
          </div>

          <div className="pt-1">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">想突出的点</p>
            <Input
              placeholder="可选 · 80 字以内"
              value={highlight}
              onChange={(e) => setHighlight(e.target.value)}
              maxLength={80}
              className="bg-transparent border-0 border-b border-border rounded-none focus-visible:ring-0 focus-visible:border-accent px-0 text-sm h-9"
            />
          </div>
        </section>

        {/* Step 1: 素材分析 */}
        {!script && (
          <Button onClick={analyze} disabled={analyzing || !urls.length} className="w-full h-11" variant={analysis ? 'outline' : 'default'}>
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {analysis ? '重新分析素材' : '第一步：分析素材是否足够'}
          </Button>
        )}

        {analysis && !script && (
          <section
            className={[
              'bg-card rounded-[0.875rem] border-2 shadow-sm p-5 space-y-3 animate-card-enter',
              analysis.sufficiency === 'ok'
                ? 'border-success/50'
                : analysis.sufficiency === 'partial'
                ? 'border-accent/50'
                : 'border-destructive/50',
            ].join(' ')}
          >
            <div className="flex items-center gap-2">
              <span className="font-display text-[11px] text-accent tracking-[0.18em]">诊断</span>
              <span className="w-1 h-1 rounded-full bg-accent" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">素材充足度</span>
            </div>

            <div className="flex items-center gap-2">
              {analysis.sufficiency === 'ok'
                ? <CheckCircle2 className="w-5 h-5 text-success" />
                : <AlertTriangle className={`w-5 h-5 ${analysis.sufficiency === 'partial' ? 'text-accent' : 'text-destructive'}`} />}
              <p className="font-display text-base text-foreground">
                {analysis.sufficiency === 'ok' && `素材充足，可以做${analysis.video_type_label}`}
                {analysis.sufficiency === 'partial' && `做${analysis.video_type_label}还差一点`}
                {analysis.sufficiency === 'insufficient' && `素材不够做${analysis.video_type_label}`}
              </p>
            </div>

            {analysis.required?.length > 0 && (
              <div className="text-xs space-y-1 border-t border-border pt-3">
                {analysis.required.map((r: any) => (
                  <div key={r.slot} className="flex items-center gap-2">
                    <span className={r.ok ? 'text-success' : 'text-destructive'}>{r.ok ? '✓' : '✗'}</span>
                    <span className="text-foreground">必备 · {r.label}：{r.have}/{r.minCount}</span>
                    {!r.ok && <span className="text-muted-foreground">— {r.hint}</span>}
                  </div>
                ))}
              </div>
            )}
            {analysis.missing_recommended?.length > 0 && (
              <div className="text-[11px] text-muted-foreground">
                推荐补：{analysis.missing_recommended.map((r: any) => r.label).join('、')}
              </div>
            )}
            {analysis.sufficiency === 'insufficient' ? (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-foreground">请按下面清单补拍 3–5 张再回来：</p>
                <div className="text-xs bg-muted/60 p-3 rounded-lg space-y-0.5 border border-border">
                  {analysis.missing_required.map((r: any) => <div key={r.slot}>□ {r.label} — {r.hint}</div>)}
                </div>
                <Button size="sm" variant="outline" onClick={() => {
                  const text = analysis.missing_required.map((r: any) => `□ ${r.label}：${r.hint}`).join('\n');
                  navigator.clipboard.writeText(text); toast.success('清单已复制');
                }}><Copy className="w-3.5 h-3.5" />复制清单给同事</Button>
              </div>
            ) : (
              <Button onClick={genScript} disabled={generating} className="w-full h-11 mt-1">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {analysis.sufficiency === 'ok' ? '第二步：生成脚本' : '坚持生成脚本（质量可能打折）'}
              </Button>
            )}
          </section>
        )}

        {/* Step 2: 脚本逐镜确认 */}
        {script && (
          <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-4 animate-card-enter">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-display text-[11px] text-accent tracking-[0.18em]">脚本</span>
                <span className="w-1 h-1 rounded-full bg-accent" />
                <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">逐镜确认</span>
              </div>
              <Button size="sm" variant="ghost" onClick={genScript} disabled={generating}>
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}重新生成
              </Button>
            </div>

            <SceneRow title="钩子" num="00" dur={script.hook.duration_s} scene={script.hook} urls={urls} onText={(v) => updateScene('hook', 'text', v)} onImg={(v) => updateScene('hook', 'image_index', v)} />
            {script.scenes.map((sc: any, i: number) => (
              <SceneRow key={i} title="镜头" num={String(i + 1).padStart(2, '0')} dur={sc.duration_s} scene={sc} urls={urls} onText={(v) => updateMid(i, 'text', v)} onImg={(v) => updateMid(i, 'image_index', v)} />
            ))}
            <SceneRow title="收尾" num="99" dur={script.outro.duration_s} scene={script.outro} urls={urls} onText={(v) => updateScene('outro', 'text', v)} onImg={(v) => updateScene('outro', 'image_index', v)} />

            <div className="text-[11px] text-muted-foreground border-t border-border pt-3 flex items-center gap-3">
              <span>BGM · {script.bgm}</span>
              <span className="opacity-50">·</span>
              <span>总时长 {script.total_duration_s}s</span>
              <span className="opacity-50">·</span>
              <span>{script.aspect}</span>
            </div>

            {!jobId ? (
              <Button onClick={confirmRender} disabled={rendering} className="w-full h-11">
                {rendering ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                确认脚本，开始渲染
              </Button>
            ) : (
              <div className="rounded-lg border border-success/40 bg-success/5 p-3 text-xs space-y-1">
                <p className="font-medium text-foreground">渲染任务已入队 · ID {jobId.slice(0, 8)}</p>
                <p className="text-muted-foreground">视频会在后台合成，完成后出现在素材库。</p>
              </div>
            )}
          </section>
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-3 h-7 rounded-full text-[12px] transition-all border',
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-transparent text-foreground border-border hover:border-accent/50',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function SceneRow({
  title, num, dur, scene, urls, onText, onImg,
}: {
  title: string; num: string; dur: number; scene: any; urls: string[];
  onText: (v: string) => void; onImg: (v: number) => void;
}) {
  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
      <div className="flex items-center gap-2">
        <span className="font-display text-[11px] text-accent tracking-[0.18em]">{num}</span>
        <span className="text-[11px] font-semibold text-foreground">{title}</span>
        <span className="text-[10px] text-muted-foreground">{dur}s · {scene.motion}</span>
      </div>
      <div className="flex gap-3">
        <img src={urls[scene.image_index]} alt="" className="w-16 h-16 object-cover rounded border border-accent/15" />
        <div className="flex-1 space-y-2">
          <Input
            value={scene.text}
            onChange={(e) => onText(e.target.value)}
            maxLength={28}
            className="bg-transparent border-0 border-b border-border rounded-none focus-visible:ring-0 focus-visible:border-accent px-0 h-8 text-sm"
          />
          <div className="flex gap-1 flex-wrap">
            {urls.map((_, i) => (
              <button
                key={i}
                onClick={() => onImg(i)}
                className={[
                  'text-[10px] px-1.5 h-5 rounded border transition-colors',
                  scene.image_index === i
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-accent/50',
                ].join(' ')}
              >
                #{i}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
