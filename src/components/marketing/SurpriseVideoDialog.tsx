import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, RefreshCw, ArrowRight, Wand2, Camera, MessageSquare, DoorOpen, PartyPopper } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveShop } from '@/hooks/useShops';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import boomerIdle from '@/assets/boomer/boomer-idle.png';
import {
  getActiveRenderJob, setActiveRenderJob, clearActiveRenderJob,
  pollRenderJob, getInflightPick, setInflightPick,
  getSavedPick, setSavedPick, clearSavedPick,
  type ActiveRenderJob,
} from '@/lib/surpriseJob';
import { SeedanceModelPicker } from '@/components/marketing/SeedanceModelPicker';
import { ImageLightbox } from '@/components/voucher/ImageLightbox';
import { DEFAULT_SEEDANCE_2, getSeedanceModel, getSeedanceShortLabel, reconcileResolution, type SeedanceResolution } from '@/lib/seedanceModels';
import { getModelPrefs, getSurpriseModelPrefs, saveModelPrefs } from '@/lib/videoModelPrefs';
import { VideoFailureCard } from '@/components/marketing/VideoFailureCard';
import type { VideoFix } from '@/lib/videoFailure';
import type { Realism } from '@/lib/realism';

// 惊喜一下固定真人写实,不暴露切换开关
const SURPRISE_REALISM: Realism = 'photoreal';

interface PickedAsset {
  asset_id: string;
  index: number;
  url: string;
  summary: string;
  category: string | null;
  role?: 'storefront' | 'scene';
}
interface SceneClip {
  scene?: string; action?: string; dialogue?: string; subtitle?: string;
  duration_s?: number; motion?: string; image_index?: number | null;
}
interface ScriptShape {
  hook?: SceneClip | null; scenes?: SceneClip[]; outro?: SceneClip | null;
  total_duration_s?: number; bgm?: string;
}
interface SurpriseResult {
  ok: boolean;
  picked: { asset_id: string; cover_url: string; summary: string; category: string | null; tags: string[]; needs_storefront?: boolean; theme_tag?: string | null };
  assets: PickedAsset[];
  script: ScriptShape;
  vtype: string; vtype_label: string; style: string;
  character: { id: string; name: string; cover_url: string | null } | null;
  persona?: {
    label: string; gender: string; age: number;
    visual: string; vibe: string; opener: string;
    catchphrase: string[]; cta: string;
    pace?: 'slow' | 'medium' | 'fast';
    tone_label?: string;
  } | null;
  holiday?: { name: string; days_away: number } | null;
  duration: number; aspect: string;
  prompt_overrides?: { opening?: string; style_cue?: string; persona_directive?: string };
  job_id?: string;
  __warn?: string;
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
  const [renderError, setRenderError] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string>(() => getSurpriseModelPrefs().modelId);
  const [resolution, setResolution] = useState<SeedanceResolution>(() => getSurpriseModelPrefs().resolution);
  const realism: Realism = SURPRISE_REALISM;

  const handleModelChange = (id: string) => {
    setModelId(id);
    setResolution((cur) => {
      const next = reconcileResolution(id, cur);
      saveModelPrefs(id, next);
      return next;
    });
  };
  const handleResolutionChange = (r: SeedanceResolution) => {
    setResolution(r);
    saveModelPrefs(modelId, r);
  };
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
        setRenderError(null);
        clearActiveRenderJob(shop);
        stopPolling();
        toast.success('🎬 视频拍好了,去素材库看看');
      } else if (r.phase === 'failed') {
        setRenderError(r.error || '渲染失败');
        clearActiveRenderJob(shop);
        stopPolling();
      }
    };
    tick();
    pollRef.current = window.setInterval(tick, 4000);
  };

  const doPick = async (exclude: string[] = []) => {
    if (!shopId) return;
    setPicking(true); setPick(null);
    const existing = getInflightPick(shopId);
    const promise = existing || setInflightPick(shopId, supabase.functions.invoke('surprise-marketing-video', {
      body: { shop_id: shopId, preview: true, exclude_asset_ids: exclude, realism },
    }));
    try {
      const { data, error } = await promise as any;
      if (error) throw error;
      const d = data as any;
      if (d?.ok === false) throw new Error(d.error || '随机失败');
      setPick(d as SurpriseResult);
      setSavedPick(shopId, d, exclude);
    } catch (e: any) {
      toast.error(e?.message || '随机失败');
      onOpenChange(false);
    } finally { setPicking(false); }
  };

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
    const saved = getSavedPick<SurpriseResult>(shopId);
    if (saved) {
      setPick(saved.pick);
      setExcluded(saved.excluded || []);
      return () => { stopPolling(); };
    }
    if (!pick) doPick(excluded);
    return () => { stopPolling(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shopId]);

  useEffect(() => () => stopPolling(), []);

  const reroll = () => {
    if (shopId) clearSavedPick(shopId);
    const newEx = pick ? Array.from(new Set([...excluded, pick.picked.asset_id])).slice(-20) : excluded;
    setExcluded(newEx);
    doPick(newEx);
  };

  const start = async (overrides?: { modelId?: string; resolution?: SeedanceResolution; disable_references?: boolean }) => {
    if (!shopId || !pick) return;
    const useModel = overrides?.modelId || modelId;
    const useRes = overrides?.resolution || resolution;
    setSubmitting(true);
    setRenderError(null);
    try {
      const { data, error } = await supabase.functions.invoke('surprise-marketing-video', {
        body: {
          shop_id: shopId, preview: false,
          script: pick.script, picked_assets: pick.assets,
          vtype: pick.vtype, style: pick.style,
          model: useModel,
          resolution: useRes,
          realism,
          disable_references: !!overrides?.disable_references,
          prompt_overrides: pick.prompt_overrides,
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
      clearSavedPick(shopId);
      setActiveJob(job);
      setRenderPhase('queued');
      startPolling(d.job_id, shopId);
      toast.success('已入队,关掉也会继续跑');
    } catch (e: any) {
      toast.error(e?.message || '提交失败');
    } finally { setSubmitting(false); }
  };

  const handleFix = async (fix: VideoFix) => {
    if (!shopId) return;
    if (fix.kind === 'delete') {
      setActiveJob(null); setRenderError(null);
      clearActiveRenderJob(shopId);
      toast.message('已清除失败任务');
      return;
    }
    const patch = fix.patch || {};
    if (patch.modelId) {
      setModelId(patch.modelId);
      setResolution((cur) => reconcileResolution(patch.modelId!, (patch.resolution as SeedanceResolution) || cur));
    } else if (patch.resolution) {
      setResolution(patch.resolution as SeedanceResolution);
    }
    setRenderError(null);
    setActiveJob(null);
    clearActiveRenderJob(shopId);
    await start({
      modelId: patch.modelId,
      resolution: (patch.resolution as SeedanceResolution) || undefined,
      disable_references: patch.disable_references,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-md max-h-[88vh] overflow-hidden flex flex-col p-0 rounded-2xl gap-0">
        <DialogHeader className="px-4 pt-4 pb-2.5 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wand2 className="w-4 h-4 text-accent shrink-0" />
            <span className="truncate">BOOMER 帮你拍一条 · 探店</span>
          </DialogTitle>
        </DialogHeader>

        {activeJob ? (
          <RenderingBody
            job={activeJob} phase={renderPhase} progress={progress}
            error={renderError}
            onApplyFix={handleFix}
            busy={submitting}
            onClose={() => onOpenChange(false)}
          />
        ) : picking || !pick ? (
          <div className="py-16 px-4 flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <img src={boomerIdle} alt="" className="w-14 h-14 object-contain animate-pulse" />
            <Loader2 className="w-5 h-5 animate-spin text-accent" />
            <div className="text-center">
              BOOMER 正在挑素材、蹭最近节日、想博主人设…
              <div className="text-[10px] mt-1 opacity-70">15s 竖版 · 真人出镜 · 风格随博主走</div>
            </div>
          </div>
        ) : (
          <>
            <ScriptBody pick={pick} />
            <div className="border-t px-4 pt-3 pb-4 space-y-3 bg-background">
              <SeedanceModelPicker
                value={modelId}
                onChange={handleModelChange}
                resolution={resolution}
                onResolutionChange={handleResolutionChange}
                compact
              />
              <div className="rounded-md border border-success/40 bg-success/5 text-success px-2.5 py-1.5 text-[11px] flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  将使用 <b>{getSeedanceModel(modelId).label}</b> · {resolution} · 一次成片
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={reroll} disabled={submitting}>
                  <RefreshCw className="w-4 h-4 mr-1" /> 换一组
                </Button>
                <Button className="flex-1" onClick={() => start()} disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  就用 {getSeedanceShortLabel(modelId)} · {resolution} 拍
                </Button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground">
                一次成片 · 关掉弹窗也会继续拍
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RenderingBody({
  job, phase, progress, onClose, error, onApplyFix, busy,
}: {
  job: ActiveRenderJob; phase: 'queued' | 'running' | 'done' | 'failed';
  progress: { done: number; total: number } | null;
  onClose: () => void;
  error?: string | null;
  onApplyFix?: (fix: VideoFix) => void | Promise<void>;
  busy?: boolean;
}) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - (job.createdAt || Date.now())) / 1000)));
  useEffect(() => {
    if (phase === 'done' || phase === 'failed') return;
    const t = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - (job.createdAt || Date.now())) / 1000)));
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase, job.createdAt]);

  const pct = (() => {
    if (phase === 'done') return 100;
    if (phase === 'failed') return 0;
    if (progress && progress.total > 0) {
      return Math.min(99, Math.round((progress.done / progress.total) * 100));
    }
    const expected = 90;
    return Math.min(95, Math.round((elapsed / expected) * 100));
  })();

  const stage = (() => {
    if (phase === 'done') return { title: '拍好啦 🎬', hint: '已上传到素材库,点下方查看' };
    if (phase === 'failed') return { title: '这次没拍成', hint: '别急,下面给你修复方案,一键重试' };
    if (phase === 'queued') return { title: '排队中…', hint: '正在向 Seedance 提交任务,通常 5-15 秒内开始' };
    if (progress && progress.total > 0) {
      const ratio = progress.done / progress.total;
      if (ratio >= 0.95) return { title: '即将完成…', hint: '正在打包封面 + 上传到素材库' };
      return { title: `Seedance 渲染中 · ${progress.done}/${progress.total}`, hint: '每段约 30-60 秒,稳一稳' };
    }
    if (elapsed < 15) return { title: '准备渲染参数…', hint: '正在把角色板 + 实景参考图打包' };
    if (elapsed < 45) return { title: 'Seedance 在排镜头…', hint: '模型正在按脚本切分镜,大约还要 1 分钟' };
    if (elapsed < 90) return { title: 'Seedance 渲染中…', hint: '正在逐帧生成,马上就好' };
    if (elapsed < 180) return { title: '正在精修画面…', hint: '高清模型耗时略长,辛苦再等一下' };
    return { title: '正在收尾…', hint: '已经在最后阶段,关掉弹窗也会继续' };
  })();

  const mm = String(Math.floor(elapsed / 60)).padStart(1, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const expectedTotal = (job.segmentTotal && job.segmentTotal > 1) ? job.segmentTotal * 60 : 120;
  const etaSec = Math.max(0, expectedTotal - elapsed);
  const etaText = phase === 'done' || phase === 'failed'
    ? null
    : etaSec > 60
      ? `预计还要 ${Math.ceil(etaSec / 60)} 分钟`
      : etaSec > 10
        ? `预计还有 ${etaSec} 秒`
        : '即将完成';

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        {job.coverUrl ? (
          <img src={job.coverUrl} alt="" className="w-16 h-[88px] rounded-md object-cover ring-1 ring-border shrink-0" />
        ) : (
          <img src={boomerIdle} alt="" className="w-16 h-16 object-contain shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold flex items-center gap-2 break-words">
            {phase !== 'done' && phase !== 'failed' && <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" />}
            <span className="min-w-0">{stage.title}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed break-words">
            {stage.hint}
          </p>
          <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">
            关掉弹窗也会继续,完成后到素材库查看。
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={[
              'h-full rounded-full transition-all duration-500',
              phase === 'failed' ? 'bg-destructive'
                : phase === 'done' ? 'bg-success'
                : 'bg-accent',
              phase !== 'done' && phase !== 'failed' ? 'animate-pulse' : '',
            ].join(' ')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
          <span>
            {progress && progress.total > 0
              ? `分镜 ${Math.min(progress.done, progress.total)}/${progress.total}`
              : phase === 'queued' ? '排队中'
              : phase === 'done' ? '已完成'
              : phase === 'failed' ? '已停止'
              : '渲染中'}
          </span>
          <span>{pct}% · 已用 {mm}:{ss}{etaText ? ` · ${etaText}` : ''}</span>
        </div>
      </div>

      {phase === 'failed' && (
        <VideoFailureCard error={error} onApplyFix={onApplyFix} busy={busy} />
      )}

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

function ScriptBody({ pick }: { pick: SurpriseResult }) {
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

  const lightboxUrls = useMemo(() => pick.assets.map((a) => a.url), [pick.assets]);
  const [lbOpen, setLbOpen] = useState(false);
  const [lbIdx, setLbIdx] = useState(0);
  const openLb = (i: number) => { setLbIdx(i); setLbOpen(true); };

  // 惊喜流程不再使用角色板;主角=AI 现场生成的虚构「探店博主」(persona),不绑参考图
  const refTiles: { url: string; label: string; kind: 'storefront' | 'scene' }[] = [];
  pick.assets.forEach((a, idx) => {
    const sceneIdx = pick.assets.slice(0, idx + 1).filter((x) => x.role !== 'storefront').length;
    refTiles.push({
      url: a.url,
      label: a.role === 'storefront' ? '门头' : `实景${sceneIdx}`,
      kind: a.role === 'storefront' ? 'storefront' : 'scene',
    });
  });
  const refLightbox = useMemo(() => refTiles.map((t) => t.url), [refTiles.map((t) => t.url).join('|')]);

  const persona = pick.persona;
  const paceClass = persona?.pace === 'slow'
    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
    : persona?.pace === 'fast'
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
  const paceText = persona?.pace === 'slow' ? '慢节奏'
    : persona?.pace === 'fast' ? '快节奏'
    : '中速';

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold">
          9:16 · 15s
        </span>
        <Chip>路线 · 探店</Chip>
        {persona?.tone_label && (
          <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${paceClass}`}>
            🎙️ {persona.tone_label} · {paceText}
          </span>
        )}
        {pick.holiday && (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 whitespace-nowrap">
            <PartyPopper className="w-3 h-3" />
            节日 · {pick.holiday.name}
            {pick.holiday.days_away === 0 ? '(进行中)' : `(还有 ${pick.holiday.days_away} 天)`}
          </span>
        )}
        {pick.picked.theme_tag && <Chip>主题 · {pick.picked.theme_tag}</Chip>}
      </div>

      {persona && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-accent">🎬</span>
            <span className="font-semibold text-foreground">今日博主 · {persona.label}</span>
          </div>
          <div className="text-[11px] text-muted-foreground leading-snug">
            <span className="text-foreground/70">外观:</span>{persona.visual}
          </div>
          <div className="text-[11px] text-muted-foreground leading-snug">
            <span className="text-foreground/70">语气:</span>{persona.vibe}
          </div>
          {persona.catchphrase?.length > 0 && (
            <div className="text-[10px] text-muted-foreground/85">
              口头禅:{persona.catchphrase.join(' · ')}
            </div>
          )}
        </div>
      )}

      {pick.picked.needs_storefront && (
        <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded px-2.5 py-2 leading-snug flex gap-1.5">
          <DoorOpen className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            还没有 <b>门头/店招</b> 照片。本店在<b>商场 B1 · 开放式无门店面</b>,
            建议补拍一张「商场走廊视角」的店面 + 顶部 logo 招牌,标注「门头」入库,
            下次开场就能锁死走廊视角,镜头更像真实探店。
          </span>
        </div>
      )}

      <div>
        <div className="text-[11px] text-muted-foreground mb-1.5">
          参考图 · {refTiles.length} 张(门头 / 实景)· 商场 B1 · 开放式店面(无门)· 主角由 AI 现场生成
        </div>
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-2 pt-1 snap-x">
          {refTiles.map((t, i) => (
            <button
              type="button"
              key={i}
              onClick={() => openLb(i < refLightbox.length ? i : 0)}
              className={[
                'shrink-0 w-14 h-[78px] rounded-xl overflow-hidden bg-muted ring-1 shadow-md shadow-black/15 relative snap-start active:scale-95 transition-transform',
                t.kind === 'storefront' ? 'ring-amber-400' : 'ring-border',
              ].join(' ')}
            >
              <img src={t.url} alt="" className="w-full h-full object-cover" />
              <div className={[
                'absolute bottom-0 left-0 right-0 px-1 text-[9px] text-white text-center truncate',
                t.kind === 'storefront' ? 'bg-amber-500/85' : 'bg-black/55',
              ].join(' ')}>{t.label}</div>
            </button>
          ))}
        </div>
      </div>


      <div>
        <div className="text-[11px] text-muted-foreground mb-2">BOOMER 拟好的脚本 · {clips.length} 个分镜 · 由 Seedance 自己排画面</div>
        <div className="space-y-2">
          {withTime.map(({ label, clip, start, dur }, i) => (
            <div key={i} className="p-2.5 rounded-lg border bg-card min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold shrink-0">
                    {label}
                  </span>
                  <span className="text-[11px] font-semibold tracking-wide text-accent shrink-0 tabular-nums">
                    {start.toFixed(1)}s – {(start + dur).toFixed(1)}s
                  </span>
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
          ))}
        </div>
      </div>
      <ImageLightbox open={lbOpen} onClose={() => setLbOpen(false)} images={refLightbox} initialIndex={lbIdx} />
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
