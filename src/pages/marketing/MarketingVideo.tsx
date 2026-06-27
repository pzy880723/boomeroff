import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowRight, FolderOpen, ImagePlus, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { UploadGrid } from './UploadGrid';
import { AspectPicker } from './AspectPicker';

import { toast } from 'sonner';
import { VideoBriefChat, type BriefMsg } from '@/components/marketing/VideoBriefChat';
import { ShopPicker } from '@/components/marketing/ShopPicker';
import { LibraryImagePickerDialog } from '@/components/marketing/LibraryImagePickerDialog';
import { CharacterPicker, type Character } from '@/components/marketing/CharacterPicker';
import { useEffectiveShop } from '@/hooks/useShops';
import { useAuth } from '@/hooks/useAuth';
import { uploadMarketingImages } from './uploadMarketingImages';
import { planSegments, effectiveImageRef, MAX_SEG_DUR, targetSegmentCount, type ImageRole, type SegmentPlan } from '@/lib/marketingSegments';
import { SeedanceModelPicker } from '@/components/marketing/SeedanceModelPicker';
import { ImageLightbox } from '@/components/voucher/ImageLightbox';
import { thumbUrl } from '@/lib/imageUrl';
import { DEFAULT_SEEDANCE_2, getSeedanceModel, getSeedanceShortLabel, reconcileResolution, type SeedanceResolution } from '@/lib/seedanceModels';
import { pollRenderJob, type RenderPhase } from '@/lib/surpriseJob';
import { VideoFailureCard } from '@/components/marketing/VideoFailureCard';
import { getModelPrefs, saveModelPrefs } from '@/lib/videoModelPrefs';
import { RealismToggle } from '@/components/marketing/RealismToggle';
import { getRealismPref, setRealismPref } from '@/lib/realismPref';
import type { Realism } from '@/lib/realism';

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
  const { shopId, setShopId, isAdmin } = useEffectiveShop();
  const [urls, setUrls] = useState<string[]>((loc.state as any)?.image_urls || []);
  const [vtype, setVtype] = useState<VType>('store_tour');
  const [style, setStyle] = useState<SType>('steady');
  const [duration, setDuration] = useState<15 | 20 | 30>(15);
  const [aspect, setAspect] = useState<typeof ASPECTS[number]>('9:16');
  const [highlight, setHighlight] = useState('');
  const [brief, setBrief] = useState<BriefMsg[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  const [imageDescriptions, setImageDescriptions] = useState<{ index: number; summary: string; best_for?: string; tags?: string[] }[]>([]);
  const [descLoading, setDescLoading] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [script, setScript] = useState<any>(null);
  const [rendering, setRendering] = useState(false);
  const [modelId, setModelId] = useState<string>(() => getModelPrefs().modelId);
  const [resolution, setResolution] = useState<SeedanceResolution>(() => getModelPrefs().resolution);
  const [realism, setRealism] = useState<Realism>(() => getRealismPref());
  const handleRealismChange = (r: Realism) => {
    setRealism(r);
    setRealismPref(r);
    if (script) toast.message('画风已切换,建议点「重做分镜静帧」重新合成');
  };
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
  const [jobId, setJobId] = useState<string | null>(null);
  const [renderModelId, setRenderModelId] = useState<string | null>(null);
  const [renderResolution, setRenderResolution] = useState<SeedanceResolution | null>(null);
  const [renderStartedAt, setRenderStartedAt] = useState<number | null>(null);
  const [renderSegmentTotal, setRenderSegmentTotal] = useState<number>(1);
  const [renderPhase, setRenderPhase] = useState<RenderPhase>('queued');
  const [renderProgress, setRenderProgress] = useState<{ done: number; total: number } | null>(null);
  const [renderVideoUrl, setRenderVideoUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [sbBusy, setSbBusy] = useState(false);
  const [sbWarn, setSbWarn] = useState<string | null>(null);
  const [lastSbSig, setLastSbSig] = useState<string>('');

  // 草稿本地保存 key
  const draftKey = shopId ? `mv:draft:${shopId}` : '';

  // 切换店铺时:先尝试恢复该 shop 的草稿,没有就清空
  useEffect(() => {
    setScript(null); setJobId(null); setCharacter(null); setRestoredAt(null);
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (Array.isArray(d.urls)) setUrls(d.urls);
      if (d.vtype) setVtype(d.vtype);
      if (d.style) setStyle(d.style);
      if (d.duration) setDuration(d.duration);
      if (d.aspect) setAspect(d.aspect);
      if (typeof d.highlight === 'string') setHighlight(d.highlight);
      if (d.character) setCharacter(d.character);
      if (Array.isArray(d.brief) && d.brief.length) setBrief(d.brief);
      if (d.script) setScript(d.script);
      if (d.updatedAt) setRestoredAt(d.updatedAt);
    } catch (e) { console.warn('[mv-draft] restore failed', e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  // 任一草稿字段变化 → debounce 写入 localStorage
  useEffect(() => {
    if (!draftKey) return;
    const t = setTimeout(() => {
      const payload = { urls, vtype, style, duration, aspect, highlight, character, brief, script, updatedAt: Date.now() };
      try {
        localStorage.setItem(draftKey, JSON.stringify(payload));
      } catch (e) {
        // 容量爆了:退一步,不存图与角色
        try { localStorage.setItem(draftKey, JSON.stringify({ ...payload, urls: [], character: null, script: null })); }
        catch { /* 放弃 */ }
      }
    }, 500);
    return () => clearTimeout(t);
  }, [draftKey, urls, vtype, style, duration, aspect, highlight, character, brief, script]);

  // 提交渲染成功后清掉草稿
  useEffect(() => {
    if (jobId && draftKey) {
      try { localStorage.removeItem(draftKey); } catch {}
      setRestoredAt(null);
    }
  }, [jobId, draftKey]);

  const clearDraft = () => {
    if (draftKey) { try { localStorage.removeItem(draftKey); } catch {} }
    setUrls([]); setVtype('store_tour'); setStyle('steady'); setDuration(15); setAspect('9:16');
    setHighlight(''); setCharacter(null); setBrief([]); setScript(null); setJobId(null); setRestoredAt(null);
  };

  // 上传/移除参考图后,后台让 AI 看一遍,产出每张图的简短描述,给 BriefChat 和分镜共用
  useEffect(() => {
    if (!urls.length) { setImageDescriptions([]); return; }
    const handle = setTimeout(async () => {
      setDescLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('describe-marketing-images', {
          body: { image_urls: urls },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        setImageDescriptions(((data as any)?.descriptions || []) as any);
      } catch (e: any) {
        console.warn('[describe-images] failed', e);
      } finally { setDescLoading(false); }
    }, 800);
    return () => clearTimeout(handle);
  }, [urls.join('|')]);

  const userTurns = brief.filter((m) => m.role === 'user').length;
  // 取对话里最近一条 draft_script 作为已确认脚本
  const approvedScript = [...brief].reverse().find((m) => m.role === 'assistant' && (m as any).kind === 'draft_script')?.content || '';

  const briefTranscript = brief
    .map((m) => `${m.role === 'user' ? '店员' : '助理'}：${m.content}`)
    .join('\n');

  const topic = brief.find((m) => m.role === 'user')?.content.slice(0, 200) || '';

  const genScript = async () => {
    if (!shopId) return toast.error('请先选择店铺');
    if (userTurns < 1) return toast.error('先和 AI 聊一句你想拍什么');
    setGenerating(true); setScript(null);
    try {
      const charPayload = character ? {
        id: character.id, name: character.name, role_label: character.role_label,
        visual_signature: character.visual_signature, core_emotion: character.core_emotion,
        cover_url: character.cover_url,
        extra_reference_urls: character.extra_reference_urls || [],
        verified_asset_uri: (character as any).verified_asset_uri || null,
      } : null;
      const { data, error } = await supabase.functions.invoke('generate-marketing-video-script', {
        body: {
          shop_id: shopId,
          image_urls: urls,
          video_type: vtype,
          duration,
          aspect,
          topic,
          highlight,
          style,
          brief_transcript: briefTranscript,
          approved_script: approvedScript,
          image_descriptions: imageDescriptions,
          character: charPayload,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const newScript = (data as any).script;
      setScript(newScript);
      // 自动调用分镜静帧:把角色 + 选中的素材图 合成每一镜的定格画面,
      // 这样渲染时模型只需要让这张确定的图动起来,不再凭空想象。
      if (urls.length > 0 || character) {
        await generateStoryboard(newScript);
      }
    } catch (e: any) { toast.error(e?.message || '脚本生成失败'); }
    finally { setGenerating(false); }
  };

  const generateStoryboard = async (scriptArg?: any, onlyIndices?: number[]) => {
    const target = scriptArg || script;
    if (!target) return;
    setSbBusy(true); setSbWarn(null);
    try {
      const assets = urls.map((u, i) => {
        const d = imageDescriptions.find((x) => x.index === i);
        return { asset_id: `idx-${i}`, index: i, url: u, summary: d?.summary || '', category: null };
      });
      const charPayload = character ? {
        id: character.id, name: character.name, role_label: character.role_label,
        visual_signature: character.visual_signature, core_emotion: character.core_emotion,
        cover_url: character.cover_url,
        extra_reference_urls: character.extra_reference_urls || [],
        verified_asset_uri: (character as any).verified_asset_uri || null,
      } : null;
      const { data, error } = await supabase.functions.invoke('storyboard-marketing-video', {
        body: {
          script: target, assets, character: charPayload, shop_id: shopId, style, realism,
          ...(onlyIndices && onlyIndices.length ? { only_indices: onlyIndices } : {}),
        },
      });
      if (error) throw error;
      const d = data as any;
      if (!d?.ok) throw new Error(d?.error || '分镜静帧生成失败');
      if (d.script) {
        setScript(d.script);
        setLastSbSig(computeStoryboardSig(d.script, realism));
      }
      const failed = (d.frames || []).filter((f: any) => !f.url).length;
      if (failed) setSbWarn(`${failed} 张静帧生成失败,渲染时将回退到原素材图`);
      toast.success(`分镜静帧已合成 ${d.succeeded}/${d.total}`);
    } catch (e: any) {
      setSbWarn(e?.message || '分镜静帧生成失败');
      toast.message('分镜静帧失败,渲染将直接用原素材', { duration: 3000 });
    } finally {
      setSbBusy(false);
    }
  };

  const confirmRender = async (overrides?: { modelId?: string; resolution?: SeedanceResolution; disable_storyboard?: boolean; disable_references?: boolean }) => {
    if (!script) return;
    if (!shopId) return toast.error('请先选择店铺');
    setRendering(true);
    try {
      let finalScript = script;
      // 多段视频且未选角色 → 尝试生成兜底角色身份板;失败不阻塞渲染
      if (duration > 12 && !character && !script.character) {
        toast.message('为保证角色不变脸,正在生成兜底主角…', { duration: 4000 });
        try {
          const anc = await supabase.functions.invoke('ensure-auto-anchor-character', {
            body: { shop_id: shopId, video_type: vtype, style, brief_summary: briefTranscript.slice(0, 600) },
          });
          if (anc.error) throw anc.error;
          if ((anc.data as any)?.error) throw new Error((anc.data as any).error);
          const anchorChar = (anc.data as any)?.character;
          if (anchorChar) {
            finalScript = { ...script, character: {
              id: anchorChar.id, name: anchorChar.name, role_label: anchorChar.role_label,
              visual_signature: anchorChar.visual_signature, core_emotion: anchorChar.core_emotion,
              cover_url: anchorChar.cover_url,
            } };
          }
        } catch (ancErr: any) {
          console.warn('[auto-anchor] failed, continue without', ancErr);
          toast.message('兜底主角生成失败,跳过,继续提交渲染', { duration: 3000 });
        }
      }
      const reqModel = (overrides?.modelId) ?? modelId;
      const reqRes = (overrides?.resolution) ?? resolution;
      const { data, error } = await supabase.functions.invoke('render-marketing-video', {
        body: {
          script: { ...finalScript, video_type: vtype }, style, shop_id: shopId,
          model: reqModel, resolution: reqRes,
          realism,
          disable_storyboard: !!overrides?.disable_storyboard,
          disable_references: !!overrides?.disable_references,
        },
      });
      if (error) throw error;
      const resp = data as any;
      if (resp?.ok === false) throw new Error(resp.error || '渲染提交失败');
      if (resp?.error) throw new Error(resp.error);
      setJobId(resp.job_id);
      setRenderModelId(reqModel);
      setRenderResolution(reqRes);
      setRenderStartedAt(Date.now());
      setRenderSegmentTotal(Number(resp.segment_total) || 1);
      setRenderPhase('queued');
      setRenderProgress(null);
      setRenderVideoUrl(null);
      setRenderError(null);
      toast.success(`已用 ${getSeedanceShortLabel(reqModel)} · ${reqRes} 入队渲染`);
    } catch (e: any) {
      const msg = e?.message || e?.error?.message || '提交失败,请稍后重试';
      toast.error(msg);
    }
    finally { setRendering(false); }
  };

  // 轮询渲染进度
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: number | null = null;
    const tick = async () => {
      const r = await pollRenderJob(jobId);
      if (cancelled) return;
      setRenderPhase(r.phase);
      if (r.progress) setRenderProgress(r.progress);
      if (r.video_url) setRenderVideoUrl(r.video_url);
      if (r.error && r.phase === 'failed') setRenderError(r.error);
      if (r.phase === 'done' || r.phase === 'failed') return;
      timer = window.setTimeout(tick, 3000);
    };
    tick();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [jobId]);

  const updateScene = (key: 'hook' | 'outro', field: string, val: any) => {
    setScript({ ...script, [key]: { ...script[key], [field]: val } });
  };
  const updateMid = (i: number, field: string, val: any) => {
    const scenes = [...script.scenes];
    scenes[i] = { ...scenes[i], [field]: val };
    setScript({ ...script, scenes });
  };
  // 设置/清空一个镜头的图绑定:同时写 image_index(向下兼容)和 image_ref。
  const setSceneImage = (key: 'hook' | 'outro' | number, index: number | null) => {
    const apply = (sc: any) => {
      if (index === null) {
        const { image_ref: _r, ...rest } = sc || {};
        return { ...rest, image_index: null };
      }
      const role: ImageRole = (sc?.image_ref?.role as ImageRole) || 'first';
      return { ...sc, image_index: index, image_ref: { index, role } };
    };
    if (key === 'hook') setScript({ ...script, hook: apply(script.hook) });
    else if (key === 'outro') setScript({ ...script, outro: apply(script.outro) });
    else {
      const scenes = [...script.scenes];
      scenes[key] = apply(scenes[key]);
      setScript({ ...script, scenes });
    }
  };
  const setSceneImageRole = (key: 'hook' | 'outro' | number, role: ImageRole) => {
    const apply = (sc: any) => {
      const ref = effectiveImageRef(sc);
      if (!ref) return sc;
      return { ...sc, image_index: ref.index, image_ref: { index: ref.index, role } };
    };
    if (key === 'hook') setScript({ ...script, hook: apply(script.hook) });
    else if (key === 'outro') setScript({ ...script, outro: apply(script.outro) });
    else {
      const scenes = [...script.scenes];
      scenes[key] = apply(scenes[key]);
      setScript({ ...script, scenes });
    }
  };

  // —— 分镜行手动替换图:目标 + 入口 ——
  type SceneTarget = 'hook' | 'outro' | number;
  const { user } = useAuth();
  const [sceneTarget, setSceneTarget] = useState<SceneTarget | null>(null);
  const [sceneLibraryOpen, setSceneLibraryOpen] = useState(false);
  const sceneFileRef = useRef<HTMLInputElement>(null);
  const [sceneUploading, setSceneUploading] = useState(false);

  const assignImageToTarget = (target: SceneTarget, newUrls: string[]) => {
    if (!newUrls.length) return;
    setScript((prev: any) => {
      if (!prev) return prev;
      let merged = [...urls];
      const indices: number[] = [];
      for (const u of newUrls) {
        let idx = merged.indexOf(u);
        if (idx < 0) { merged.push(u); idx = merged.length - 1; }
        indices.push(idx);
      }
      merged = merged.slice(0, 20);
      setUrls(merged);
      const firstIdx = indices[0];
      const patch = (sc: any) => ({
        ...sc,
        image_index: firstIdx,
        image_ref: { index: firstIdx, role: (sc?.image_ref?.role as ImageRole) || 'first' },
        image_binding: { source: 'manual', expected: firstIdx, confidence: 1 },
      });
      if (target === 'hook') return { ...prev, hook: patch(prev.hook) };
      if (target === 'outro') return { ...prev, outro: patch(prev.outro) };
      const scenes = [...prev.scenes];
      scenes[target] = patch(scenes[target]);
      return { ...prev, scenes };
    });
  };

  const openSceneLibrary = (target: SceneTarget) => { setSceneTarget(target); setSceneLibraryOpen(true); };
  const openSceneUpload = (target: SceneTarget) => { setSceneTarget(target); sceneFileRef.current?.click(); };

  const onSceneFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || sceneTarget == null || !user) return;
    setSceneUploading(true);
    const tid = toast.loading(`上传中 (0/${files.length})`);
    let done = 0;
    try {
      const results = await uploadMarketingImages(user.id, files, {
        preset: 'hd',
        onProgress: (ev) => {
          if (ev.stage === 'done') { done++; toast.loading(`上传中 (${done}/${files.length})`, { id: tid }); }
        },
      });
      const ok = results.filter((u): u is string => !!u);
      toast.dismiss(tid);
      if (!ok.length) { toast.error('上传失败'); return; }
      assignImageToTarget(sceneTarget, ok);
      toast.success(`已加入 ${ok.length} 张并替换`);
    } catch (err: any) {
      toast.dismiss(tid);
      toast.error(err?.message || '上传失败');
    } finally { setSceneUploading(false); }
  };

  // 分镜静帧"是否过期":每次绑定/画风变了,提示重做
  const currentSbSig = useMemo(() => computeStoryboardSig(script, realism), [script, realism]);
  const sbStale = !!script && !!lastSbSig && lastSbSig !== currentSbSig;
  const missingSbIndices = useMemo(() => collectMissingStoryboardIndices(script), [script]);
  const hasAnyStoryboard = useMemo(() => collectStoryboardSummary(script).hasAny, [script]);

  return (
    <>
      <PageHeader title="AI 视频" back="/me/marketing" subtitle="营销中心 / 文生视频" />
      <div className="container mx-auto max-w-screen-md px-4 py-4 space-y-5 pb-12">

        <ShopPicker value={shopId} onChange={setShopId} locked={!isAdmin} />

        {shopId && restoredAt && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-[11px]">
            <span className="text-muted-foreground">
              已恢复 {Math.max(1, Math.round((Date.now() - restoredAt) / 60000))} 分钟前的草稿
            </span>
            <button onClick={clearDraft} className="text-accent hover:underline font-medium">清空重来</button>
          </div>
        )}

        {!shopId ? (
          <p className="text-center text-[12px] text-muted-foreground py-8">请先选择店铺，再开始创作。</p>
        ) : (<>
        {/* 画风(必须在生成脚本/分镜之前选好) */}
        <section className="bg-card rounded-[0.875rem] border border-accent/30 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <SectionLabel num="00">画风</SectionLabel>
            <RealismToggle value={realism} onChange={handleRealismChange} size="sm" />
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            先选好画风,再让 BOOMER 写脚本和拆分镜。当前:
            <b className="text-foreground mx-1">{realism === 'photoreal' ? '真人写实' : '插画风'}</b>
            · {realism === 'photoreal' ? '细节最真,偶尔触发审核' : '默认 · 过审稳定'}
          </p>
        </section>

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
          {duration > MAX_SEG_DUR && (
            <p className="-mt-1 text-[10px] text-muted-foreground leading-relaxed pl-1">
              · {duration} 秒视频会拆成 <b>{targetSegmentCount(duration)} 段 × 约 {Math.round(duration / targetSegmentCount(duration))} 秒</b> 生成,完成后自动拼接成一支 MP4。Seedance 只调用 {targetSegmentCount(duration)} 次,省一半 token。整体约 {targetSegmentCount(duration) * 2}-{targetSegmentCount(duration) * 3} 分钟。
            </p>
          )}

          <SectionLabel num="04">画幅</SectionLabel>
          <div className="-mt-2">
            <AspectPicker value={aspect} onChange={(v) => setAspect(v as typeof ASPECTS[number])} />
          </div>

          <SectionLabel num="05">渲染模型</SectionLabel>
          <div className="-mt-1">
            <SeedanceModelPicker
              value={modelId}
              onChange={handleModelChange}
              resolution={resolution}
              onResolutionChange={handleResolutionChange}
            />
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

        {/* 参考图(可选) */}
        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel num="05">参考图(可选,最多 20 张)</SectionLabel>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setPickerOpen(true)}>
              <FolderOpen className="w-3.5 h-3.5" />从素材库导入
            </Button>
          </div>
          <UploadGrid urls={urls} onChange={(next) => { setUrls(next); setScript(null); }} max={20} preset="thumb" title="" shopId={shopId} />
          <p className="text-[10px] text-muted-foreground">不上传也能生成。上传后,在分镜里给每张图选「开头 / 结尾 / 参考」,会真正进入对应视频段。</p>
          {urls.length > 0 && (
            <div className="border-t border-accent/10 pt-2 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="font-display tracking-[0.18em] uppercase text-accent">AI 看到的内容</span>
                {descLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              </div>
              {imageDescriptions.length > 0 ? (
                <ul className="space-y-0.5 max-h-32 overflow-y-auto pr-1">
                  {imageDescriptions.map((d) => (
                    <li key={d.index} className="text-[10.5px] leading-snug text-muted-foreground">
                      <span className="text-accent">[图 #{d.index}]</span> {d.summary}
                      {d.best_for && <span className="text-foreground/40"> · {d.best_for}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                !descLoading && <p className="text-[10px] text-muted-foreground/60">等下…AI 正在看你的图。</p>
              )}
            </div>
          )}
        </section>

        {/* 主角(可选) */}
        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-3">
          <SectionLabel num="06">主角(可选)</SectionLabel>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            选一个固定主角,所有镜头都用 TA,跨段不变脸。{duration > MAX_SEG_DUR && '多段视频如果不选,系统会自动先生成一张兜底角色身份板。'}
          </p>
          <CharacterPicker shopId={shopId} value={character} onChange={(c) => { setCharacter(c); setScript(null); }} />
        </section>

        {/* 立意沟通 */}
        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel num="07">立意沟通</SectionLabel>
            <Button size="sm" onClick={genScript} disabled={generating || userTurns < 1} className="h-7 text-[11px]">
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              生成分镜
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            先聊几句 → 让 AI 在对话框里写一版完整脚本(带 [图 #N] 标注)→ 满意后点右上「生成分镜」拆成镜头。
          </p>
          <VideoBriefChat
            context={{ video_type: vtype, duration, aspect, style }}
            messages={brief}
            onChange={(m) => { setBrief(m); setScript(null); }}
            shopId={shopId}
            imageDescriptions={imageDescriptions}
            imageUrls={urls}
          />
        </section>

        {/* 分镜确认 */}
        {script && (
          <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-5 space-y-4 animate-card-enter">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-display text-[11px] text-accent tracking-[0.18em]">脚本</span>
                <span className="w-1 h-1 rounded-full bg-accent" />
                <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">文生视频 · 逐镜确认</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {sbStale && (
                  <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/30">
                    分镜图已变更
                  </span>
                )}
                <Button size="sm" variant="ghost" onClick={() => generateStoryboard()} disabled={sbBusy || generating} className="h-7 text-[11px]">
                  {sbBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {sbBusy ? '合成中' : '重做分镜静帧'}
                </Button>
                {!sbBusy && missingSbIndices.length > 0 && hasAnyStoryboard && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => generateStoryboard(undefined, missingSbIndices)}
                    disabled={generating}
                    className="h-7 text-[11px] text-accent"
                  >
                    仅补 {missingSbIndices.length} 张
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={genScript} disabled={generating}>
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}重新生成
                </Button>
              </div>
            </div>

            {script && !sbBusy && !hasAnyStoryboard && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 leading-snug">
                ⚠ 还没有分镜静帧。如果直接渲染会用原素材图,质量会差。点右上「重做分镜静帧」先合成每一镜的定格画面。
              </div>
            )}

            <StoryboardStrip script={script} busy={sbBusy} warn={sbWarn} />

            <SegmentPreview script={script} urls={urls} character={character} />


            <SceneRow title="钩子" num="00" scene={script.hook} urls={urls}
              onField={(f, v) => updateScene('hook', f, v)}
              onImg={(v) => setSceneImage('hook', v)}
              onRole={(r) => setSceneImageRole('hook', r)}
              onPickLibrary={() => openSceneLibrary('hook')}
              onPickUpload={() => openSceneUpload('hook')}
              uploading={sceneUploading} />
            {script.scenes.map((sc: any, i: number) => (
              <SceneRow key={i} title="镜头" num={String(i + 1).padStart(2, '0')} scene={sc} urls={urls}
                onField={(f, v) => updateMid(i, f, v)}
                onImg={(v) => setSceneImage(i, v)}
                onRole={(r) => setSceneImageRole(i, r)}
                onPickLibrary={() => openSceneLibrary(i)}
                onPickUpload={() => openSceneUpload(i)}
                uploading={sceneUploading} />
            ))}
            <SceneRow title="收尾" num="99" scene={script.outro} urls={urls}
              onField={(f, v) => updateScene('outro', f, v)}
              onImg={(v) => setSceneImage('outro', v)}
              onRole={(r) => setSceneImageRole('outro', r)}
              onPickLibrary={() => openSceneLibrary('outro')}
              onPickUpload={() => openSceneUpload('outro')}
              uploading={sceneUploading} />


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
              <>
                <div className="border-t border-border pt-3">
                  <SeedanceModelPicker
                    value={modelId}
                    onChange={handleModelChange}
                    resolution={resolution}
                    onResolutionChange={handleResolutionChange}
                  />
                </div>
                <Button onClick={() => confirmRender()} disabled={rendering} className="w-full h-11">
                  {rendering ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  用 {getSeedanceShortLabel(modelId)} · {resolution} 开始渲染
                </Button>
              </>
            ) : (
              <RenderProgressCard
                jobId={jobId}
                modelId={renderModelId || modelId}
                resolution={renderResolution || resolution}
                startedAt={renderStartedAt || Date.now()}
                segmentTotal={renderSegmentTotal}
                phase={renderPhase}
                progress={renderProgress}
                videoUrl={renderVideoUrl}
                error={renderError}
                busy={rendering}
                onApplyFix={async (fix) => {
                  if (fix.kind === 'delete') {
                    setJobId(null); setRenderError(null); setRenderPhase('queued');
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
                  // 清掉当前 jobId,然后重新提交
                  setJobId(null);
                  await confirmRender({
                    modelId: patch.modelId,
                    resolution: (patch.resolution as SeedanceResolution) || undefined,
                    disable_storyboard: patch.disable_storyboard,
                    disable_references: patch.disable_references,
                  });
                }}
              />
            )}
          </section>
        )}
        </>)}
      </div>

      <LibraryImagePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        shopId={shopId}
        max={20 - urls.length}
        onConfirm={(picked) => { setUrls([...urls, ...picked].slice(0, 20)); setScript(null); }}
      />

      {/* 分镜行的「素材库」入口 */}
      <LibraryImagePickerDialog
        open={sceneLibraryOpen}
        onOpenChange={setSceneLibraryOpen}
        shopId={shopId}
        max={Math.max(1, 20 - urls.length)}
        onConfirm={(picked) => {
          if (sceneTarget != null) assignImageToTarget(sceneTarget, picked);
        }}
      />

      {/* 分镜行的「上传」隐藏 input */}
      <input
        ref={sceneFileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onSceneFiles}
      />
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

const ROLE_LABEL: Record<ImageRole, string> = { first: '开头', last: '结尾', reference: '参考' };
const ROLE_HINT: Record<ImageRole, string> = {
  first: '本镜头将作为它所属视频段的开场画面',
  last: '作为段尾画面,与开头帧约束运动方向',
  reference: '仅用于锁定主体形象,不固定在帧位上',
};

function SceneRow({
  title, num, scene, urls, onField, onImg, onRole, onPickLibrary, onPickUpload, uploading,
}: {
  title: string; num: string; scene: any; urls: string[];
  onField: (field: 'scene' | 'action' | 'dialogue' | 'subtitle' | 'motion', v: string) => void;
  onImg: (v: number | null) => void;
  onRole: (r: ImageRole) => void;
  onPickLibrary: () => void;
  onPickUpload: () => void;
  uploading?: boolean;
}) {
  const eff = effectiveImageRef(scene);
  const refImg = eff && urls[eff.index];
  const role: ImageRole = eff?.role || 'first';
  const sbImg: string | undefined = (typeof scene?.storyboard_url === 'string' && scene.storyboard_url) || undefined;
  const thumbImg = sbImg || refImg || undefined;
  const thumbLabel = sbImg ? '静帧' : (refImg ? ROLE_LABEL[role] : '');
  const [zoomOpen, setZoomOpen] = useState(false);
  // 兼容旧字段
  const sceneText = scene.scene ?? scene.video_prompt ?? '';
  const subtitle = scene.subtitle ?? scene.text ?? '';
  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="font-display text-[11px] text-accent tracking-[0.18em]">{num}</span>
          <span className="text-[11px] font-semibold text-foreground">{title}</span>
          {scene.image_binding && <BindingBadge binding={scene.image_binding} />}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{scene.duration_s}s</span>
          <span className="opacity-50">·</span>
          <Input
            value={scene.motion || ''}
            onChange={(e) => onField('motion', e.target.value)}
            placeholder="运镜"
            maxLength={16}
            className="h-6 w-20 text-[10px] px-1.5 bg-transparent"
          />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-shrink-0 flex flex-col items-center gap-1">
          {thumbImg ? (
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              className={`relative w-16 h-16 rounded border overflow-hidden active:scale-95 transition-transform ${sbImg ? 'border-accent/40' : 'border-accent/15'}`}
              aria-label="放大查看"
            >
              <img src={thumbImg} alt="" className="w-full h-full object-cover" />
              <span className={`absolute top-0.5 right-0.5 text-[9px] px-1 py-px rounded-full font-medium ${sbImg ? 'bg-accent text-accent-foreground' : 'bg-black/70 text-white'}`}>
                {thumbLabel}
              </span>
            </button>
          ) : (
            <div className="w-16 h-16 rounded border border-dashed border-border bg-card flex items-center justify-center text-[9px] text-muted-foreground text-center px-1 leading-tight">无参考图</div>
          )}
          {thumbImg && (
            <ImageLightbox
              open={zoomOpen}
              onClose={() => setZoomOpen(false)}
              images={[thumbImg]}
              initialIndex={0}
            />
          )}

          {refImg && (
            <div className="flex rounded border border-border overflow-hidden text-[9px]">
              {(['first', 'last', 'reference'] as ImageRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => onRole(r)}
                  className={[
                    'px-1 py-px transition-colors',
                    role === r ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                  title={ROLE_HINT[r]}
                >{ROLE_LABEL[r]}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <FieldBlock label="场景">
            <Textarea
              value={sceneText}
              onChange={(e) => onField('scene', e.target.value)}
              placeholder="地点 / 光线 / 道具 / 景别 / 构图"
              rows={2}
              maxLength={200}
              className="text-[11px] leading-snug resize-none bg-card"
            />
          </FieldBlock>
          <FieldBlock label="动作">
            <Textarea
              value={scene.action || ''}
              onChange={(e) => onField('action', e.target.value)}
              placeholder="人物动作 / 镜头运动"
              rows={2}
              maxLength={120}
              className="text-[11px] leading-snug resize-none bg-card"
            />
          </FieldBlock>
          <FieldBlock label="台词">
            <Textarea
              value={scene.dialogue || ''}
              onChange={(e) => onField('dialogue', e.target.value)}
              placeholder="人物说的话 / 画外音(可空)"
              rows={1}
              maxLength={60}
              className="text-[11px] leading-snug resize-none bg-card"
            />
          </FieldBlock>
          <FieldBlock label="字幕">
            <Input
              value={subtitle}
              onChange={(e) => onField('subtitle', e.target.value)}
              placeholder="≤24 字"
              maxLength={24}
              className="bg-card h-8 text-sm"
            />
          </FieldBlock>
          <div className="flex gap-1 flex-wrap pt-1 items-center">
            <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground self-center mr-1">参考图</span>
            {urls.length > 0 && (
              <button
                onClick={() => onImg(null)}
                className={[
                  'text-[10px] px-1.5 h-5 rounded border transition-colors',
                  !eff
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-accent/50',
                ].join(' ')}
              >无</button>
            )}
            {urls.map((_, i) => (
              <button
                key={i}
                onClick={() => onImg(i)}
                className={[
                  'text-[10px] px-1.5 h-5 rounded border transition-colors',
                  eff?.index === i
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-accent/50',
                ].join(' ')}
              >
                #{i}
              </button>
            ))}
            <button
              onClick={onPickLibrary}
              className="text-[10px] px-1.5 h-5 rounded border border-accent/40 bg-accent/5 text-accent hover:bg-accent/15 transition-colors inline-flex items-center gap-0.5"
            >
              <ImagePlus className="w-2.5 h-2.5" />素材库
            </button>
            <button
              onClick={onPickUpload}
              disabled={uploading}
              className="text-[10px] px-1.5 h-5 rounded border border-accent/40 bg-accent/5 text-accent hover:bg-accent/15 transition-colors inline-flex items-center gap-0.5 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Upload className="w-2.5 h-2.5" />}上传
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 把脚本里的 clip 按 hook → scenes → outro 顺序收集,与后端 gatherClips 对齐。
function gatherScriptClips(script: any): { label: string; clip: any }[] {
  const out: { label: string; clip: any }[] = [];
  if (script?.hook) out.push({ label: '钩子', clip: script.hook });
  if (Array.isArray(script?.scenes)) script.scenes.forEach((c: any, i: number) => out.push({ label: `镜${String(i + 1).padStart(2, '0')}`, clip: c }));
  if (script?.outro) out.push({ label: '收尾', clip: script.outro });
  return out;
}

function computeStoryboardSig(script: any, realism: string): string {
  if (!script) return '';
  const clips = gatherScriptClips(script);
  return clips
    .map(({ clip }) => {
      const ref = effectiveImageRef(clip);
      const idx = ref ? `${ref.index}:${ref.role}` : '_';
      return `${idx}|${clip?.storyboard_url ? '1' : '0'}`;
    })
    .join(',') + `#${realism}`;
}

function collectMissingStoryboardIndices(script: any): number[] {
  const clips = gatherScriptClips(script);
  const out: number[] = [];
  clips.forEach((c, i) => { if (!c.clip?.storyboard_url) out.push(i); });
  return out;
}

function collectStoryboardSummary(script: any): { hasAny: boolean; total: number; done: number } {
  const clips = gatherScriptClips(script);
  const done = clips.filter((c) => !!c.clip?.storyboard_url).length;
  return { hasAny: done > 0, total: clips.length, done };
}

function SegmentPreview({ script, urls, character }: { script: any; urls: string[]; character: Character | null }) {
  const segments: SegmentPlan[] = planSegments(script);
  const [open, setOpen] = useState(false);
  if (!segments.length) return null;
  const allClips = gatherScriptClips(script);

  // 把每段里包含的 clip 标签反解出来,在 allClips 里找到对应 clip 取静帧 / 实景
  const segClipsOf = (seg: SegmentPlan) => seg.sceneLabels.map((label) => {
    let idx = -1;
    if (label === '钩子') idx = allClips.findIndex((c) => c.label === '钩子');
    else if (label === '收尾') idx = allClips.findIndex((c) => c.label === '收尾');
    else if (label.startsWith('镜头')) {
      const n = parseInt(label.slice(2), 10) - 1;
      idx = allClips.findIndex((c) => c.label === `镜${String(n + 1).padStart(2, '0')}`);
    }
    const c = idx >= 0 ? allClips[idx] : null;
    const sb = (c?.clip?.storyboard_url as string | undefined) || undefined;
    const ref = c ? effectiveImageRef(c.clip) : null;
    const fallback = ref && urls[ref.index] || undefined;
    return { label, dur: Number(c?.clip?.duration_s) || 0, image: sb || fallback, isStoryboard: !!sb, hasImage: !!(sb || fallback) };
  });

  const totalDur = segments.reduce((s, x) => s + x.durationS, 0);

  return (
    <div className="border border-accent/15 rounded-lg bg-accent/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-[11px] text-accent tracking-[0.18em]">分段预览</span>
          <span className="w-1 h-1 rounded-full bg-accent" />
          <span className="text-[10px] text-muted-foreground truncate">
            共 {segments.length} 段 · {totalDur}s · 主角:{character?.name || '无'}
          </span>
        </div>
        <span className="text-[10px] text-accent shrink-0">{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[10px] text-muted-foreground leading-snug">
            固定切成 {segments.length} 段(30s = 2×15、45s = 3×15),Seedance 只跑 {segments.length} 次,省一半 token。每段第一张作开头帧、最后一张作结尾帧,主角每段都会塞进参考图锁人。
          </p>
          {segments.map((seg) => {
            const cells = segClipsOf(seg);
            const hasFirst = cells.find((c) => c.hasImage);
            const lastWith = [...cells].reverse().find((c) => c.hasImage && c !== hasFirst);
            const mode = hasFirst
              ? (lastWith ? '首尾帧' : '图生视频')
              : (character?.cover_url ? '参考生视频' : '纯文生');
            return (
              <div key={seg.index} className="bg-card border border-border rounded p-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[10.5px]">
                  <span className="font-semibold text-foreground shrink-0">第 {seg.index + 1} 段</span>
                  <span className="text-muted-foreground truncate">{seg.durationS}s · {seg.sceneLabels.length} 镜</span>
                  <span className="text-accent text-[9.5px] px-1.5 py-px rounded-full border border-accent/30 bg-accent/5 shrink-0">{mode}</span>
                </div>
                <div className="flex items-end gap-1.5 overflow-x-auto pb-0.5">
                  {cells.map((cell, i) => {
                    const isFirst = i === 0;
                    const isLast = i === cells.length - 1 && cells.length > 1;
                    return (
                      <div key={i} className="flex flex-col items-center gap-0.5 shrink-0">
                        <div className="relative w-12 h-16 rounded border border-accent/20 overflow-hidden bg-muted/40">
                          {cell.image ? (
                            <img src={thumbUrl(cell.image, 240) || cell.image} alt="" loading="lazy" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[8px] text-muted-foreground">无图</div>
                          )}
                          {(isFirst || isLast) && cell.image && (
                            <span className="absolute top-0 left-0 right-0 text-[8px] text-center bg-black/60 text-white py-px">
                              {isFirst ? '开头帧' : '结尾帧'}
                            </span>
                          )}
                          {cell.isStoryboard && (
                            <span className="absolute bottom-0 right-0 text-[7.5px] px-0.5 bg-accent text-accent-foreground">静帧</span>
                          )}
                        </div>
                        <span className="text-[8.5px] text-muted-foreground">{cell.label}</span>
                        <span className="text-[8px] text-muted-foreground/70">{cell.dur}s</span>
                      </div>
                    );
                  })}
                  {character?.cover_url && (
                    <div className="flex flex-col items-center gap-0.5 shrink-0 pl-1.5 ml-1.5 border-l border-border">
                      <div className="w-12 h-12 rounded-full overflow-hidden border border-accent/40">
                        <img src={thumbUrl(character.cover_url, 160) || character.cover_url} alt="" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-[8.5px] text-accent font-medium truncate max-w-[3rem]">{character.name || '主角'}</span>
                      <span className="text-[8px] text-muted-foreground/70">锁人</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}




function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] uppercase tracking-[0.18em] text-accent/80 font-semibold">{label}</div>
      {children}
    </div>
  );
}

function BindingBadge({ binding }: { binding: { source: string; expected: number | null; confidence: number | null } }) {
  const { source, expected, confidence } = binding;
  if (source === 'free') return null;
  if (source === 'unbound') {
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
        草稿标[无图]
      </span>
    );
  }
  if (source === 'locked') {
    return (
      <span
        className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
        title={`AI 与草稿一致 · 置信度 ${Math.round((confidence ?? 1) * 100)}%`}
      >
        🔒 锁定 #{expected} · {Math.round((confidence ?? 1) * 100)}%
      </span>
    );
  }
  if (source === 'forced') {
    return (
      <span
        className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/30"
        title={`AI 给的图与草稿不一致,已按草稿强制改回 #${expected} · 置信度 ${Math.round((confidence ?? 0.6) * 100)}%`}
      >
        ⚠ 已校正→#{expected} · {Math.round((confidence ?? 0.6) * 100)}%
      </span>
    );
  }
  return null;
}

function fmtClock(s: number): string {
  const m = Math.floor(Math.max(0, s) / 60);
  const r = Math.max(0, s) % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function RenderProgressCard({
  jobId, modelId, resolution, startedAt, segmentTotal, phase, progress, videoUrl, error,
  busy, onApplyFix,
}: {
  jobId: string;
  modelId: string;
  resolution?: SeedanceResolution;
  startedAt: number;
  segmentTotal: number;
  phase: RenderPhase;
  progress: { done: number; total: number } | null;
  videoUrl: string | null;
  error: string | null;
  busy?: boolean;
  onApplyFix?: (fix: import('@/lib/videoFailure').VideoFix) => void | Promise<void>;
}) {
  const model = getSeedanceModel(modelId);
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
  useEffect(() => {
    if (phase === 'done' || phase === 'failed') return;
    const t = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase, startedAt]);

  // 预计单段约 90 秒(Fast 75 / Mini 60),多段额外 +20s 拼接
  const perSeg = /fast/i.test(model.id) ? 75 : /mini/i.test(model.id) ? 60 : 90;
  const expected = Math.max(30, perSeg * Math.max(1, segmentTotal) + (segmentTotal > 1 ? 20 : 0));
  const remaining = Math.max(0, expected - elapsed);

  const pct = (() => {
    if (phase === 'done') return 100;
    if (phase === 'failed') return 0;
    if (progress && progress.total > 0) {
      return Math.min(99, Math.round((progress.done / progress.total) * 100));
    }
    return Math.min(95, Math.round((elapsed / expected) * 100));
  })();

  const label =
    phase === 'queued' ? '排队中…' :
    phase === 'done' ? '渲染完成 🎬' :
    phase === 'failed' ? '渲染失败' : '渲染中…';

  const tone =
    phase === 'done' ? 'border-success/40 bg-success/5' :
    phase === 'failed' ? 'border-destructive/40 bg-destructive/5' :
    'border-accent/40 bg-accent/5';

  return (
    <div className={`rounded-lg border ${tone} p-3 text-xs space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {phase !== 'done' && phase !== 'failed' && <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" />}
          <span className="font-medium text-foreground truncate">{label}</span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-semibold shrink-0">
          {model.label}{resolution ? ` · ${resolution}` : ''}
        </span>
      </div>

      <div className="space-y-1">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${phase === 'failed' ? 'bg-destructive' : 'bg-accent'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
          <span>
            {progress && progress.total > 1
              ? `分段 ${Math.min(progress.done, progress.total)}/${progress.total}`
              : phase === 'queued' ? '排队中' : phase === 'done' ? '已完成' : '单段直出'}
          </span>
          <span>
            {pct}% · 已用 {fmtClock(elapsed)}
            {phase !== 'done' && phase !== 'failed' && ` · 预计还需 ${fmtClock(remaining)}`}
          </span>
        </div>
      </div>

      {phase === 'failed' && (
        <VideoFailureCard error={error} onApplyFix={onApplyFix} busy={busy} compact />
      )}

      <div className="text-[10px] text-muted-foreground flex items-center justify-between">
        <span>任务 ID · {jobId.slice(0, 8)}</span>
        <span>关掉页面也会继续渲染</span>
      </div>

      <div className="flex gap-2">
        {phase === 'done' && videoUrl ? (
          <Button asChild size="sm" className="flex-1">
            <a href={videoUrl} target="_blank" rel="noreferrer">
              查看视频 <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </a>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link to="/me/marketing/library">
            去素材库 <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function StoryboardStrip({ script, busy, warn }: { script: any; busy: boolean; warn: string | null }) {
  const [lbIdx, setLbIdx] = useState<number | null>(null);
  const clips: { label: string; url: string | null }[] = [];
  if (script?.hook) clips.push({ label: '钩子', url: script.hook.storyboard_url || null });
  if (Array.isArray(script?.scenes)) {
    script.scenes.forEach((s: any, i: number) => clips.push({ label: `镜${String(i + 1).padStart(2, '0')}`, url: s?.storyboard_url || null }));
  }
  if (script?.outro) clips.push({ label: '收尾', url: script.outro.storyboard_url || null });
  const has = clips.some((c) => c.url);
  if (!busy && !has && !warn) return null;
  const lbImages = clips.map((c) => c.url).filter((u): u is string => !!u);
  // 用"含图的索引"映射回 clips 索引,点击时打开对应那张
  const imgIdxOf = (clipIdx: number) => {
    let count = 0;
    for (let i = 0; i < clipIdx; i++) if (clips[i].url) count++;
    return count;
  };
  return (
    <div className="border border-accent/20 rounded-lg p-3 space-y-2 bg-accent/5">
      <div className="flex items-center gap-2">
        <span className="font-display text-[11px] text-accent tracking-[0.18em]">分镜静帧</span>
        <span className="w-1 h-1 rounded-full bg-accent" />
        <span className="text-[10px] text-muted-foreground">
          {busy ? '正在合成每一镜的定格画面…' : has ? `${clips.filter((c) => c.url).length}/${clips.length} 张已就绪 · 点开放大` : '尚未合成'}
        </span>
        {busy && <Loader2 className="w-3 h-3 animate-spin text-accent" />}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {clips.map((c, i) => (
          <div key={i} className="flex flex-col items-center gap-1 shrink-0">
            {c.url ? (
              <button
                type="button"
                onClick={() => setLbIdx(imgIdxOf(i))}
                className="w-16 h-28 rounded overflow-hidden border border-accent/20 bg-muted active:scale-95 transition-transform"
                aria-label={`放大查看 ${c.label}`}
              >
                <img src={thumbUrl(c.url, 320) || c.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
              </button>
            ) : (
              <div className="w-16 h-28 rounded border border-dashed border-border bg-muted/40 flex items-center justify-center text-[9px] text-muted-foreground">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : '—'}
              </div>
            )}
            <span className="text-[9px] text-muted-foreground">{c.label}</span>
          </div>
        ))}
      </div>
      {warn && (
        <p className="text-[10px] text-amber-600 leading-snug">{warn}</p>
      )}
      <ImageLightbox
        open={lbIdx !== null}
        onClose={() => setLbIdx(null)}
        images={lbImages}
        initialIndex={lbIdx ?? 0}
      />
    </div>
  );
}

