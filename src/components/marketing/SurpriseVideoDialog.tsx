import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, RefreshCw, ArrowRight, Wand2, Camera, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveShop } from '@/hooks/useShops';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import boomerIdle from '@/assets/boomer/boomer-idle.png';
import {
  getActiveRenderJob, setActiveRenderJob, clearActiveRenderJob,
  pollRenderJob, getInflightPick, setInflightPick,
  type ActiveRenderJob,
} from '@/lib/surpriseJob';
import { SeedanceModelPicker } from '@/components/marketing/SeedanceModelPicker';
import { DEFAULT_SEEDANCE_2, getSeedanceModel, getSeedanceShortLabel } from '@/lib/seedanceModels';

interface PickedAsset {
  asset_id: string; index: number; url: string; summary: string; category: string | null;
}
interface SceneClip {
  scene?: string; action?: string; dialogue?: string; subtitle?: string;
  duration_s?: number; motion?: string; image_index?: number | null;
  storyboard_url?: string | null;
}
interface ScriptShape {
  hook?: SceneClip | null; scenes?: SceneClip[]; outro?: SceneClip | null;
  total_duration_s?: number; bgm?: string;
}
interface SurpriseResult {
  ok: boolean;
  picked: { asset_id: string; cover_url: string; summary: string; category: string | null; tags: string[] };
  assets: PickedAsset[];
  script: ScriptShape;
  vtype: string; vtype_label: string; style: string;
  character: { id: string; name: string; cover_url: string | null } | null;
  duration: number; aspect: string;
  job_id?: string;
  storyboard?: { scene_index: number; url: string | null; key: string }[];
  __warn?: string;
  __sb_warn?: string;
}

const STYLE_LABEL: Record<string, string> = {
  steady: '稳重', lively: '活泼', energetic: '激动',
  elegant: '优雅', nostalgic: '怀旧', playful: '俏皮',
};

export function SurpriseVideoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { shopId } = useEffectiveShop();
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pick, setPick] = useState<SurpriseResult | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [activeJob, setActiveJob] = useState<ActiveRenderJob | null>(null);
  const [renderPhase, setRenderPhase] = useState<'queued' | 'running' | 'done' | 'failed'>('running');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [modelId, setModelId] = useState<string>(DEFAULT_SEEDANCE_2);
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
  };

  const startPolling = (jobId: string, shop: string) => {
    stopPolling();
    const tick = async () => {
      const r = await pollRenderJob(jobId);
      setRenderPhase(r.phase);
      if (r.progress) setProgress(r.progress);
      if (r.phase === 'done') {
        setProgress((p) => p ? { done: p.total, total: p.total } : { done: 1, total: 1 });
        clearActiveRenderJob(shop);
        stopPolling();
        toast.success('🎬 视频拍好了,去素材库看看');
      } else if (r.phase === 'failed') {
        clearActiveRenderJob(shop);
        stopPolling();
        toast.error(r.error || '渲染失败');
      }
    };
    tick();
    pollRef.current = window.setInterval(tick, 4000);
  };

  const doPick = async (exclude: string[] = []) => {
    if (!shopId) return;
    setPicking(true); setPick(null);
    // 复用 inflight，避免 close→open 时重派
    const existing = getInflightPick(shopId);
    const promise = existing || setInflightPick(shopId, supabase.functions.invoke('surprise-marketing-video', {
      body: { shop_id: shopId, preview: true, exclude_asset_ids: exclude },
    }));
    try {
      const { data, error } = await promise as any;
      if (error) throw error;
      const d = data as any;
      if (d?.ok === false) throw new Error(d.error || '随机失败');
      setPick(d as SurpriseResult);
    } catch (e: any) {
      toast.error(e?.message || '随机失败');
      onOpenChange(false);
    } finally { setPicking(false); }
  };

  // 打开时:优先恢复已有渲染任务,否则跑 A 段
  useEffect(() => {
    if (!open || !shopId) return;
    const job = getActiveRenderJob(shopId);
    if (job) {
      setActiveJob(job);
      setRenderPhase('running');
      startPolling(job.jobId, shopId);
      return;
    }
    setActiveJob(null);
    if (!pick) doPick(excluded);
    return () => { stopPolling(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shopId]);

  // 关弹窗不取消 inflight、不清 jobId，仅停止本组件 polling
  useEffect(() => () => stopPolling(), []);

  const reroll = () => {
    const newEx = pick ? Array.from(new Set([...excluded, pick.picked.asset_id])).slice(-20) : excluded;
    setExcluded(newEx);
    doPick(newEx);
  };

  const start = async () => {
    if (!shopId || !pick) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('surprise-marketing-video', {
        body: {
          shop_id: shopId, preview: false,
          script: pick.script, picked_assets: pick.assets,
          vtype: pick.vtype, style: pick.style,
          model: modelId,
        },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.ok === false || !d?.job_id) throw new Error(d?.error || '提交失败');
      const job: ActiveRenderJob = {
        jobId: d.job_id, coverUrl: pick.picked.cover_url,
        createdAt: Date.now(), segmentTotal: d.segment_total,
      };
      setActiveRenderJob(shopId, job);
      setActiveJob(job);
      setRenderPhase('queued');
      startPolling(d.job_id, shopId);
      toast.success('已入队,关掉也会继续跑');
    } catch (e: any) {
      toast.error(e?.message || '提交失败');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-md max-h-[88vh] overflow-hidden flex flex-col p-0 rounded-2xl gap-0">
        <DialogHeader className="px-4 pt-4 pb-2.5 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wand2 className="w-4 h-4 text-accent shrink-0" />
            <span className="truncate">BOOMER 帮你拍一条</span>
          </DialogTitle>
        </DialogHeader>

        {activeJob ? (
          <RenderingBody
            job={activeJob} phase={renderPhase} progress={progress}
            onClose={() => onOpenChange(false)}
          />
        ) : picking || !pick ? (
          <div className="py-16 px-4 flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <img src={boomerIdle} alt="" className="w-14 h-14 object-contain animate-pulse" />
            <Loader2 className="w-5 h-5 animate-spin text-accent" />
            <div className="text-center">
              BOOMER 正在挑素材、写脚本、画分镜…
              <div className="text-[10px] mt-1 opacity-70">通常 10–15 秒,分镜静帧让最终视频更稳</div>
            </div>
          </div>
        ) : (
          <>
            <ScriptBody pick={pick} />
            <div className="border-t px-4 pt-3 pb-4 space-y-3 bg-background">
              <SeedanceModelPicker value={modelId} onChange={setModelId} compact />
              <div className="rounded-md border border-success/40 bg-success/5 text-success px-2.5 py-1.5 text-[11px] flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  将使用 <b>{getSeedanceModel(modelId).label}</b> · 最长 {getSeedanceModel(modelId).max_duration}s · 单段直出
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={reroll} disabled={submitting}>
                  <RefreshCw className="w-4 h-4 mr-1" /> 换一组
                </Button>
                <Button className="flex-1" onClick={start} disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  就用 {getSeedanceShortLabel(modelId)} 拍
                </Button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground">
                单段直出 · 无拼接 · 关掉弹窗也会继续拍
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RenderingBody({
  job, phase, progress, onClose,
}: {
  job: ActiveRenderJob; phase: 'queued' | 'running' | 'done' | 'failed';
  progress: { done: number; total: number } | null;
  onClose: () => void;
}) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - (job.createdAt || Date.now())) / 1000)));
  useEffect(() => {
    if (phase === 'done' || phase === 'failed') return;
    const t = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - (job.createdAt || Date.now())) / 1000)));
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase, job.createdAt]);

  // 进度估算:有 segment 进度时用真实值;否则按 90 秒预期 + 防超过 95%
  const pct = (() => {
    if (phase === 'done') return 100;
    if (phase === 'failed') return 0;
    if (progress && progress.total > 0) {
      return Math.min(99, Math.round((progress.done / progress.total) * 100));
    }
    const expected = 90;
    return Math.min(95, Math.round((elapsed / expected) * 100));
  })();

  const label = phase === 'queued' ? '排队中…'
    : phase === 'done' ? '拍好啦 🎬'
    : phase === 'failed' ? '失败,可重试' : '渲染中…';
  const mm = String(Math.floor(elapsed / 60)).padStart(1, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        {job.coverUrl ? (
          <img src={job.coverUrl} alt="" className="w-16 h-[88px] rounded-md object-cover ring-1 ring-border shrink-0" />
        ) : (
          <img src={boomerIdle} alt="" className="w-16 h-16 object-contain shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold flex items-center gap-2">
            {phase !== 'done' && phase !== 'failed' && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
            {label}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed break-words">
            关掉弹窗也会继续,完成后到素材库查看。
          </p>
        </div>
      </div>

      {/* 进度条 */}
      <div className="space-y-1.5">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={[
              'h-full rounded-full transition-all duration-500',
              phase === 'failed' ? 'bg-destructive' : 'bg-accent',
            ].join(' ')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
          <span>
            {progress && progress.total > 0
              ? `分镜 ${Math.min(progress.done, progress.total)}/${progress.total}`
              : phase === 'queued' ? '排队中' : '渲染中'}
          </span>
          <span>{pct}% · {mm}:{ss}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          关闭(后台继续)
        </Button>
        <Link to="/me/marketing/library" className="flex-1">
          <Button className="w-full" onClick={onClose}>
            去素材库 <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function ScriptBody({ pick }: { pick: SurpriseResult; modelLabel?: string }) {
  const clips: { label: string; clip: SceneClip }[] = [];
  if (pick.script.hook) clips.push({ label: '钩子', clip: pick.script.hook });
  (pick.script.scenes || []).forEach((s, i) => clips.push({ label: `镜头${i + 1}`, clip: s }));
  if (pick.script.outro) clips.push({ label: '收尾', clip: pick.script.outro });

  let acc = 0;
  const withTime = clips.map(({ label, clip }) => {
    const start = acc;
    const dur = Number(clip.duration_s) || 2;
    acc += dur;
    return { label, clip, start, dur };
  });

  const assetByIdx = new Map(pick.assets.map((a) => [a.index, a]));

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold">
          9:16 · 15s
        </span>
        <Chip>路线 · {pick.vtype_label}</Chip>
        <Chip>风格 · {STYLE_LABEL[pick.style] || pick.style}</Chip>
        {pick.character && <Chip>主角 · {pick.character.name}</Chip>}
        {modelLabel && <Chip>模型 · {modelLabel}</Chip>}
      </div>

      {pick.__warn === 'assets_reused' && (
        <div className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1.5 leading-snug">
          素材偏少,已尽量打散；建议补拍几张实景图让分镜更丰富。
        </div>
      )}
      {pick.__sb_warn && (
        <div className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1.5 leading-snug">
          分镜静帧生成跳过(将直接用实景照渲染):{pick.__sb_warn}
        </div>
      )}

      <div>
        <div className="text-[11px] text-muted-foreground mb-1.5">
          {withTime.some((w) => w.clip.storyboard_url)
            ? `分镜静帧 · ${withTime.filter((w) => w.clip.storyboard_url).length}/${withTime.length} 张已合成`
            : `入选素材 · ${pick.assets.length} 张实景`}
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 snap-x">
          {(withTime.some((w) => w.clip.storyboard_url) ? withTime : pick.assets.map((a, i) => ({ label: `#${i}`, clip: { storyboard_url: null }, asset: a }))).map((it: any, i) => {
            const url = it.clip?.storyboard_url || it.asset?.url || it.url;
            const label = it.label;
            return (
              <div key={i} className="shrink-0 w-12 h-[68px] rounded-md overflow-hidden bg-muted ring-1 ring-border relative snap-start">
                {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : null}
                <div className="absolute bottom-0 right-0 px-1 text-[9px] bg-black/55 text-white rounded-tl">{label || `#${i}`}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[11px] text-muted-foreground mb-2">BOOMER 拟好的脚本 · {clips.length} 个分镜</div>
        <div className="space-y-2">
          {withTime.map(({ label, clip, start, dur }, i) => {
            const idx = clip.image_index;
            const asset = typeof idx === 'number' ? assetByIdx.get(idx) : undefined;
            const frameUrl = clip.storyboard_url || asset?.url || null;
            return (
              <div key={i} className="flex gap-2 p-2 rounded-lg border bg-card min-w-0">
                <div className="shrink-0 w-12 h-[68px] rounded-md overflow-hidden bg-muted relative">
                  {frameUrl ? (
                    <img src={frameUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[9px] text-muted-foreground text-center px-1">
                      自由<br />镜头
                    </div>
                  )}
                  <div className="absolute top-0 left-0 px-1 text-[9px] bg-black/55 text-white rounded-br">{label}</div>
                  {clip.storyboard_url && (
                    <div className="absolute bottom-0 right-0 px-1 text-[8px] bg-accent/85 text-white rounded-tl">分镜</div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="text-[11px] font-semibold tracking-wide text-accent shrink-0">
                      {start.toFixed(1)}s – {(start + dur).toFixed(1)}s
                    </div>
                    {clip.motion && (
                      <span className="text-[10px] text-muted-foreground truncate">{clip.motion}</span>
                    )}
                  </div>
                  {clip.scene && (
                    <div className="text-[12px] leading-snug break-words">
                      <span className="text-muted-foreground">场景 · </span>{clip.scene}
                    </div>
                  )}
                  {clip.action && (
                    <div className="text-[12px] leading-snug flex gap-1 break-words">
                      <Camera className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">{clip.action}</span>
                    </div>
                  )}
                  {clip.dialogue && (
                    <div className="text-[12px] leading-snug flex gap-1 text-foreground/85 break-words">
                      <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">"{clip.dialogue}"</span>
                    </div>
                  )}
                  {clip.subtitle && (
                    <div className="text-[11px] leading-snug text-muted-foreground break-words">
                      字幕:{clip.subtitle}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border border-accent/30 bg-accent/5 text-foreground/80 tracking-wide whitespace-nowrap">
      {children}
    </span>
  );
}
