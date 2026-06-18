import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { UploadGrid } from './UploadGrid';
import { AspectPicker } from './AspectPicker';
import { StepBar } from './StepBar';
import { toast } from 'sonner';
import { VideoBriefChat, type BriefMsg } from '@/components/marketing/VideoBriefChat';

const VIDEO_TYPES = [
  { v: 'store_tour', label: '探店' },
  { v: 'product_showcase', label: '产品展示' },
  { v: 'store_ambience', label: '店铺氛围' },
  { v: 'new_arrival', label: '新品上架' },
] as const;
type VType = typeof VIDEO_TYPES[number]['v'];

const STYLES = [
  { v: 'steady', label: '稳重' },
  { v: 'lively', label: '活泼' },
  { v: 'energetic', label: '激动' },
  { v: 'elegant', label: '优雅' },
  { v: 'nostalgic', label: '怀旧' },
  { v: 'playful', label: '俏皮' },
] as const;
type SType = typeof STYLES[number]['v'];

const DURATIONS = [15, 20, 30] as const;
const ASPECTS = ['9:16', '1:1', '16:9'] as const;

export default function MarketingVideo() {
  const loc = useLocation();
  const [urls, setUrls] = useState<string[]>((loc.state as any)?.image_urls || []);
  const [vtype, setVtype] = useState<VType>('store_tour');
  const [style, setStyle] = useState<SType>('steady');
  const [duration, setDuration] = useState<15 | 20 | 30>(15);
  const [aspect, setAspect] = useState<typeof ASPECTS[number]>('9:16');
  const [highlight, setHighlight] = useState('');
  const [brief, setBrief] = useState<BriefMsg[]>([]);

  const [generating, setGenerating] = useState(false);
  const [script, setScript] = useState<any>(null);
  const [rendering, setRendering] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const userTurns = brief.filter((m) => m.role === 'user').length;

  const briefTranscript = brief
    .map((m) => `${m.role === 'user' ? '店员' : '助理'}：${m.content}`)
    .join('\n');

  const topic = brief.find((m) => m.role === 'user')?.content.slice(0, 200) || '';

  const genScript = async () => {
    if (userTurns < 1) return toast.error('先和 AI 聊一句你想拍什么');
    setGenerating(true); setScript(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-marketing-video-script', {
        body: {
          image_urls: urls,
          video_type: vtype,
          duration,
          aspect,
          topic,
          highlight,
          style,
          brief_transcript: briefTranscript,
        },
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
      const { data, error } = await supabase.functions.invoke('render-marketing-video', {
        body: { script: { ...script, video_type: vtype }, style },
      });
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
      <PageHeader title="AI 视频" back="/me/marketing" subtitle="营销中心 / 文生视频" />
      <div className="container mx-auto max-w-screen-md px-4 py-4 space-y-5 pb-12">
        <StepBar
          steps={['立意沟通', '参考图', '确认分镜', '渲染']}
          current={userTurns < 1 ? 0 : !script ? 1 : !jobId ? 2 : 3}
        />

        {/* 视频参数 */}
        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-5">
          <SectionLabel num="01">视频类型</SectionLabel>
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {VIDEO_TYPES.map((t) => (
              <Chip key={t.v} active={vtype === t.v} onClick={() => { setVtype(t.v); setScript(null); }}>{t.label}</Chip>
            ))}
          </div>

          <SectionLabel num="02">视频风格</SectionLabel>
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {STYLES.map((s) => (
              <Chip key={s.v} active={style === s.v} onClick={() => { setStyle(s.v); setScript(null); }}>{s.label}</Chip>
            ))}
          </div>

          <SectionLabel num="03">时长</SectionLabel>
          <div className="-mt-2 flex gap-1.5">
            {DURATIONS.map((d) => (
              <Chip key={d} active={duration === d} onClick={() => setDuration(d)}>{d} 秒</Chip>
            ))}
          </div>

          <SectionLabel num="04">画幅</SectionLabel>
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

        {/* 立意沟通 */}
        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel num="05">立意沟通</SectionLabel>
            <Button size="sm" onClick={genScript} disabled={generating || userTurns < 1} className="h-7 text-[11px]">
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              生成分镜
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            先和 AI 助理简单聊几句,把要拍的东西、想要的感觉说清楚。聊够了再点右上「生成分镜」。
          </p>
          <VideoBriefChat
            context={{ video_type: vtype, duration, aspect, style }}
            messages={brief}
            onChange={(m) => { setBrief(m); setScript(null); }}
          />
        </section>

        {/* 参考图(可选) */}
        <div className="space-y-1">
          <UploadGrid urls={urls} onChange={(next) => { setUrls(next); setScript(null); }} max={6} preset="thumb" title="参考图(可选)" />
          <p className="text-[10px] text-muted-foreground px-1">不上传也能生成。上传后 AI 会尽量贴合你的商品/店面风格。</p>
        </div>

        {/* 分镜确认 */}
        {script && (
          <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-4 animate-card-enter">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-display text-[11px] text-accent tracking-[0.18em]">脚本</span>
                <span className="w-1 h-1 rounded-full bg-accent" />
                <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">文生视频 · 逐镜确认</span>
              </div>
              <Button size="sm" variant="ghost" onClick={genScript} disabled={generating}>
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}重新生成
              </Button>
            </div>

            <SceneRow title="钩子" num="00" scene={script.hook} urls={urls}
              onText={(v) => updateScene('hook', 'text', v)}
              onPrompt={(v) => updateScene('hook', 'video_prompt', v)}
              onImg={(v) => updateScene('hook', 'image_index', v)} />
            {script.scenes.map((sc: any, i: number) => (
              <SceneRow key={i} title="镜头" num={String(i + 1).padStart(2, '0')} scene={sc} urls={urls}
                onText={(v) => updateMid(i, 'text', v)}
                onPrompt={(v) => updateMid(i, 'video_prompt', v)}
                onImg={(v) => updateMid(i, 'image_index', v)} />
            ))}
            <SceneRow title="收尾" num="99" scene={script.outro} urls={urls}
              onText={(v) => updateScene('outro', 'text', v)}
              onPrompt={(v) => updateScene('outro', 'video_prompt', v)}
              onImg={(v) => updateScene('outro', 'image_index', v)} />

            <div className="text-[11px] text-muted-foreground border-t border-border pt-3 flex items-center gap-3 flex-wrap">
              <span>BGM · {script.bgm}</span>
              <span className="opacity-50">·</span>
              <span>总时长 {script.total_duration_s}s</span>
              <span className="opacity-50">·</span>
              <span>{script.aspect}</span>
              <span className="opacity-50">·</span>
              <span className="text-accent">{script.style_label || '稳重'} · 文生视频</span>
            </div>

            {!jobId ? (
              <Button onClick={confirmRender} disabled={rendering} className="w-full h-11">
                {rendering ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                确认脚本，开始渲染
              </Button>
            ) : (
              <div className="rounded-lg border border-success/40 bg-success/5 p-3 text-xs space-y-2">
                <p className="font-medium text-foreground">渲染任务已入队 · ID {jobId.slice(0, 8)}</p>
                <p className="text-muted-foreground">视频会在后台合成，完成后出现在素材库。</p>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link to="/me/marketing/library">
                    去素材库查看进度 <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
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
  title, num, scene, urls, onText, onPrompt, onImg,
}: {
  title: string; num: string; scene: any; urls: string[];
  onText: (v: string) => void;
  onPrompt: (v: string) => void;
  onImg: (v: number | null) => void;
}) {
  const refImg = scene.image_index !== null && scene.image_index !== undefined && urls[scene.image_index];
  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
      <div className="flex items-center gap-2">
        <span className="font-display text-[11px] text-accent tracking-[0.18em]">{num}</span>
        <span className="text-[11px] font-semibold text-foreground">{title}</span>
        <span className="text-[10px] text-muted-foreground">{scene.duration_s}s · {scene.motion}</span>
      </div>
      <div className="flex gap-3">
        {refImg ? (
          <img src={refImg} alt="" className="w-16 h-16 object-cover rounded border border-accent/15" />
        ) : (
          <div className="w-16 h-16 rounded border border-dashed border-border bg-card flex items-center justify-center text-[9px] text-muted-foreground text-center px-1 leading-tight">无参考图</div>
        )}
        <div className="flex-1 space-y-2 min-w-0">
          <Input
            value={scene.text || ''}
            onChange={(e) => onText(e.target.value)}
            placeholder="字幕"
            maxLength={28}
            className="bg-transparent border-0 border-b border-border rounded-none focus-visible:ring-0 focus-visible:border-accent px-0 h-8 text-sm"
          />
          <Textarea
            value={scene.video_prompt || ''}
            onChange={(e) => onPrompt(e.target.value)}
            placeholder="video prompt (EN)"
            rows={2}
            className="text-[11px] leading-snug resize-none bg-card"
          />
          {urls.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => onImg(null)}
                className={[
                  'text-[10px] px-1.5 h-5 rounded border transition-colors',
                  scene.image_index === null || scene.image_index === undefined
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-accent/50',
                ].join(' ')}
              >无</button>
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
          )}
        </div>
      </div>
    </div>
  );
}
