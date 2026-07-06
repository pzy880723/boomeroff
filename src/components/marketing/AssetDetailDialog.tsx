// 营销素材详情 / 编辑抽屉。支持文案、图片、视频三种 kind。
import { useEffect, useRef, useState } from 'react';
import { Play, RefreshCw as RefreshIconTop, Loader2 as SpinTop, ImageDown } from 'lucide-react';
import { invokeFn as invokeFnTop } from '@/lib/invokeFn';
import { toast as toastTop } from 'sonner';

function LazyVideoPlayer({
  src, poster, assetId, expired, onRefreshed, onPosterUpdated,
}: {
  src: string;
  poster?: string;
  assetId?: string;
  expired?: boolean;
  onRefreshed?: (nextUrl: string) => void;
  onPosterUpdated?: (nextPosterUrl: string) => void;
}) {
  const [active, setActive] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | undefined>(poster);
  const [videoError, setVideoError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [srcNonce, setSrcNonce] = useState(0);
  const [savingPoster, setSavingPoster] = useState(false);
  const [autoPosterDone, setAutoPosterDone] = useState<boolean>(!!poster);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => { setPosterUrl(poster); setAutoPosterDone(!!poster); }, [poster]);
  useEffect(() => { setVideoError(false); setActive(false); }, [src]);

  useEffect(() => {
    if (active && videoRef.current) {
      Promise.resolve().then(() => videoRef.current?.play().catch(() => {}));
    }
  }, [active, srcNonce]);

  // 抓当前 <video> 的一帧 → 上传到 refresh-marketing-poster
  const captureAndUpload = async (opts?: { silent?: boolean }): Promise<boolean> => {
    if (!assetId) return false;
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return false;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      // 降到 720 宽以内减少上传体积
      const maxW = 720;
      let outCanvas: HTMLCanvasElement = canvas;
      if (canvas.width > maxW) {
        const ratio = maxW / canvas.width;
        outCanvas = document.createElement('canvas');
        outCanvas.width = maxW;
        outCanvas.height = Math.round(canvas.height * ratio);
        outCanvas.getContext('2d')?.drawImage(canvas, 0, 0, outCanvas.width, outCanvas.height);
      }
      const dataUrl = outCanvas.toDataURL('image/jpeg', 0.78);
      if (!opts?.silent) setSavingPoster(true);
      const { data, error } = await invokeFnTop<{ ok: boolean; url: string }>('refresh-marketing-poster', {
        body: { asset_id: assetId, image_base64: dataUrl },
      });
      if (error) throw error;
      const nextUrl = data?.url;
      if (nextUrl) {
        setPosterUrl(nextUrl);
        onPosterUpdated?.(nextUrl);
        if (!opts?.silent) toastTop.success('封面已更新');
        return true;
      }
      return false;
    } catch (e: any) {
      if (!opts?.silent) toastTop.error(e?.message || '换封面失败');
      return false;
    } finally {
      if (!opts?.silent) setSavingPoster(false);
    }
  };

  // 首次播放:视频过半 & 之前没有 poster → 悄悄抓一帧上传
  const handleTimeUpdate = () => {
    if (autoPosterDone || !assetId) return;
    const v = videoRef.current;
    if (!v || !v.duration || !isFinite(v.duration)) return;
    if (v.currentTime / v.duration >= 0.4) {
      setAutoPosterDone(true);
      captureAndUpload({ silent: true });
    }
  };

  const tryRefresh = async () => {
    if (!assetId || refreshing) return;
    setRefreshing(true);
    try {
      const { data, error } = await invokeFnTop('mirror-marketing-asset', { body: { asset_id: assetId } });
      if (error) throw error;
      const d = data as any;
      if (d?.expired) { toastTop.error('视频源已过期，请重新生成'); return; }
      if (d?.url) {
        onRefreshed?.(d.url);
        setVideoError(false);
        setActive(true);
        setSrcNonce((n) => n + 1);
        toastTop.success('视频已刷新');
      }
    } catch (e: any) {
      toastTop.error(e?.message || '刷新失败');
    } finally { setRefreshing(false); }
  };

  if (!src) {
    return (
      <div className="w-full rounded-lg bg-muted aspect-[9/16] max-h-[70vh] flex items-center justify-center text-xs text-muted-foreground">
        视频暂不可用
      </div>
    );
  }

  if (expired) {
    return (
      <div className="w-full rounded-lg bg-muted aspect-[9/16] max-h-[70vh] flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground p-4 text-center">
        <span className="text-sm">视频源已过期</span>
        <span>请点右下方「重新生成」再来一版</span>
      </div>
    );
  }

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="relative w-full rounded-lg bg-black overflow-hidden aspect-[9/16] max-h-[70vh] flex items-center justify-center"
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-contain transition-opacity duration-200"
            loading="eager"
            decoding="async"
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore — 小写属性对所有 React 版本都安全
            fetchpriority="high"
            onError={() => setPosterUrl(undefined)}
          />
        ) : null}
        <span className="relative w-14 h-14 rounded-full bg-black/55 backdrop-blur flex items-center justify-center">
          <Play className="w-7 h-7 text-white fill-white" />
        </span>
      </button>
    );
  }

  if (videoError) {
    return (
      <div className="w-full rounded-lg bg-muted aspect-[9/16] max-h-[70vh] flex flex-col items-center justify-center gap-3 text-xs text-muted-foreground p-4">
        <span>视频加载失败</span>
        <div className="flex gap-2">
          {assetId && (
            <button
              type="button"
              onClick={tryRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1 px-3 h-8 rounded-full bg-primary text-primary-foreground disabled:opacity-60"
            >
              {refreshing ? <SpinTop className="w-3 h-3 animate-spin" /> : <RefreshIconTop className="w-3 h-3" />}
              刷新链接
            </button>
          )}
          <button
            type="button"
            onClick={() => { setVideoError(false); setActive(false); }}
            className="px-3 h-8 rounded-full border border-border"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <video
        key={`${src}#${srcNonce}`}
        ref={videoRef}
        src={src}
        controls
        playsInline
        preload="metadata"
        poster={posterUrl}
        onError={() => setVideoError(true)}
        onTimeUpdate={handleTimeUpdate}
        className="w-full rounded-lg bg-black"
        crossOrigin="anonymous"
      />
      {assetId && (
        <button
          type="button"
          onClick={() => captureAndUpload()}
          disabled={savingPoster}
          className="absolute top-2 right-2 inline-flex items-center gap-1 px-2.5 h-7 rounded-full bg-black/55 backdrop-blur text-white text-[11px] hover:bg-black/70 disabled:opacity-60"
          title="用当前画面作为视频封面"
        >
          {savingPoster ? <SpinTop className="w-3 h-3 animate-spin" /> : <ImageDown className="w-3 h-3" />}
          换封面
        </button>
      )}
    </div>
  );
}




import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Copy, Download, Loader2, Pencil, Save, X, Sparkles, RefreshCw, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { VideoFailureCard } from '@/components/marketing/VideoFailureCard';
import { invokeFn } from '@/lib/invokeFn';
import { completeMarketingVideoFromSegments } from '@/lib/completeMarketingVideo';
import { useAuth } from '@/hooks/useAuth';


interface CopyCand {
  title?: string;
  body?: string;
  hashtags?: string[];
  first_comment?: string;
}

export function AssetDetailDialog({
  asset, open, onOpenChange, onUpdated, onDelete,
}: {
  asset: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdated?: (next: any) => void;
  onDelete?: (asset: any) => void;
}) {
  const { user } = useAuth();
  const [cands, setCands] = useState<CopyCand[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<CopyCand>({});
  const [saving, setSaving] = useState(false);
  // 视频专用:一键生成的小红书文案
  const [videoCopy, setVideoCopy] = useState<CopyCand | null>(null);
  const [genCopyLoading, setGenCopyLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [stitching, setStitching] = useState(false);
  // 视频详情:折叠的原始脚本
  const [videoScript, setVideoScript] = useState<any>(null);
  const [scriptOpen, setScriptOpen] = useState(false);

  

  const regenerateVideo = async () => {
    if (!asset || asset.kind !== 'video') return;
    if (!confirm('用相同的脚本和模型,重新生成一条视频?\n(原视频会保留,新视频会出现在素材库顶部)')) return;
    setRegenerating(true);
    try {
      const jobId = asset.meta?.job_id;
      let script: any = null;
      if (jobId) {
        const { data: job } = await supabase
          .from('marketing_video_jobs' as any)
          .select('script')
          .eq('id', jobId)
          .maybeSingle();
        script = (job as any)?.script || null;
      }
      if (!script) {
        // 兜底:用 topic 临时拼一个最小脚本,让后端走文生视频
        const topic = asset.meta?.topic || '中古好物随手拍';
        script = {
          topic,
          video_type: asset.meta?.video_type || 'product_intro',
          total_duration_s: asset.meta?.duration || 15,
          hook: { caption: topic, prompt: topic },
          outro: { caption: topic, prompt: topic },
          mid: [],
        };
      }
      const { data, error } = await invokeFnTop('render-marketing-video', {
        body: {
          script,
          style: asset.meta?.style || 'realistic_storefront',
          shop_id: asset.shop_id || null,
          model: asset.meta?.model,
          resolution: asset.meta?.resolution,
        },
      });
      if (error) throw error;
      const resp = data as any;
      if (resp?.ok === false || resp?.error) throw new Error(resp?.error || '提交失败');
      toast.success('已重新入队渲染,完成后会出现在素材库');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || '重新生成失败,请稍后再试');
    } finally {
      setRegenerating(false);
    }
  };

  const continueStitching = async () => {
    if (!asset || asset.kind !== 'video') return;
    if (!user) { toast.error('请先登录'); return; }
    const jobId = asset.meta?.job_id;
    if (!jobId) { toast.error('找不到视频任务,请重新生成'); return; }
    setStitching(true);
    try {
      let segUrls = Array.isArray(asset.meta?.segment_urls) ? asset.meta.segment_urls.filter(Boolean) : [];
      const { data } = await invokeFnTop('poll-marketing-video', { body: { job_id: jobId } });
      const d = data as any;
      if (Array.isArray(d?.segment_urls) && d.segment_urls.filter(Boolean).length) {
        segUrls = d.segment_urls.filter(Boolean);
      }
      const total = Number(d?.segment_total || asset.meta?.segment_total || segUrls.length || 0);
      if (!segUrls.length || (total > 0 && segUrls.length < total)) {
        throw new Error('分段还没有全部生成完成,请稍后再试');
      }
      toast.message('分段已找到,正在合成完整视频…');
      const done = await completeMarketingVideoFromSegments({ userId: user.id, jobId, segmentUrls: segUrls });
      onUpdated?.({ ...asset, output_url: done.url, meta: done.meta });
      toast.success('视频已修复完成');
    } catch (e: any) {
      toast.error(e?.message || '继续拼接失败,请重新生成');
    } finally {
      setStitching(false);
    }
  };

  useEffect(() => {
    if (!asset) { setCands([]); setVideoCopy(null); setVideoScript(null); setScriptOpen(false); return; }
    if (asset.kind === 'copy') {
      try {
        const parsed = JSON.parse(asset.output_text || '[]');
        setCands(Array.isArray(parsed) ? parsed : []);
      } catch {
        setCands([{ body: asset.output_text || '' }]);
      }
    } else {
      setCands([]);
    }
    if (asset.kind === 'video') {
      const saved = asset.meta?.video_copy;
      setVideoCopy(saved && (saved.title || saved.body) ? saved : null);
    } else {
      setVideoCopy(null);
    }
    setVideoScript(null);
    setScriptOpen(false);
    setEditing(null);
  }, [asset]);

  // 视频详情:异步拉取原始脚本供折叠展示
  useEffect(() => {
    if (!asset || asset.kind !== 'video') return;
    const jobId = asset.meta?.job_id;
    if (!jobId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from('marketing_video_jobs' as any).select('script').eq('id', jobId).maybeSingle();
        if (!cancelled) setVideoScript((data as any)?.script || null);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [asset]);

  // 视频渲染完成后 & 还没生成文案 → 自动生成一次
  useEffect(() => {
    if (!asset || asset.kind !== 'video') return;
    if (!asset.output_url) return;
    if (videoCopy) return;
    if (genCopyLoading) return;
    if (!asset.meta?.job_id) return;
    void generateVideoCopy({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id, asset?.output_url]);

  if (!asset) return null;

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('已复制'); };

  const videoCopyText = (c: CopyCand | null) => {
    if (!c) return '';
    return [c.title, c.body, (c.hashtags || []).join(' ')].filter(Boolean).join('\n\n').trim();
  };

  const generateVideoCopy = async (opts?: { silent?: boolean }) => {
    if (!asset || asset.kind !== 'video') return;
    setGenCopyLoading(true);
    try {
      const { data, error } = await invokeFnTop('generate-marketing-video-copy', {
        body: { asset_id: asset.id, shop_id: asset.shop_id || null },
      });
      if (error) throw error;
      const d = data as any;
      const got: CopyCand | undefined = d?.copy;
      if (!got || (!got.title && !got.body)) throw new Error(d?.error || '生成失败');
      setVideoCopy(got);
      const nextMeta = { ...(asset.meta || {}), video_copy: got };
      onUpdated?.({ ...asset, meta: nextMeta });
      if (!opts?.silent) toast.success('小红书文案已生成');
    } catch (e: any) {
      if (!opts?.silent) toast.error(e?.message || '生成失败,请稍后重试');
    } finally {
      setGenCopyLoading(false);
    }
  };



  const downloadAsset = async (kind: 'video' | 'image') => {
    if (!asset?.output_url) return;
    setDownloading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error('请先登录');
      const projectRef = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID || '';
      const supaUrl = (import.meta as any).env?.VITE_SUPABASE_URL || (projectRef ? `https://${projectRef}.supabase.co` : '');
      if (!supaUrl) throw new Error('无法解析下载地址');
      const tail = asset.meta?.storage_path?.split('/').pop() || '';
      const url = `${supaUrl}/functions/v1/download-marketing-asset?asset_id=${encodeURIComponent(asset.id)}${tail ? `&filename=${encodeURIComponent(tail)}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `下载失败 (${res.status})`);
      }
      const blob = await res.blob();
      // 文件名优先取 Content-Disposition
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      const filename = m ? decodeURIComponent(m[1]) : (tail || `boomer-${kind}-${asset.id.slice(0,8)}.${kind === 'video' ? 'mp4' : 'jpg'}`);

      const { saveToGallery, isNativeApp } = await import('@/lib/saveToGallery');
      const save = await saveToGallery(blob, filename, kind);
      if (kind === 'video') {
        const txt = videoCopyText(videoCopy);
        if (txt) { try { await navigator.clipboard.writeText(txt); } catch { /* noop */ } }
      }
      if (save.ok) {
        if (save.target === 'gallery') toast.success('已保存到相册');
        else toast.success('下载完成');
      } else if (isNativeApp()) {
        toast.error(save.error || '保存到相册失败，可能是相册权限被拒');
      } else {
        toast.error(save.error || '下载失败');
      }
    } catch (e: any) {
      // 兜底:直接打开原链接
      toast.message(e?.message || '下载失败,已尝试在新窗口打开,请长按保存');
      try { window.open(asset.output_url, '_blank', 'noreferrer'); } catch { /* noop */ }
    } finally { setDownloading(false); }
  };

  const downloadVideo = () => downloadAsset('video');

  const beginEdit = (i: number) => {
    setEditing(i);
    setDraft({ ...cands[i] });
  };
  const cancelEdit = () => { setEditing(null); setDraft({}); };
  const saveEdit = async () => {
    if (editing === null) return;
    const next = [...cands];
    next[editing] = { ...draft };
    setSaving(true);
    try {
      const { error } = await supabase
        .from('marketing_assets' as any)
        .update({ output_text: JSON.stringify(next) })
        .eq('id', asset.id);
      if (error) throw error;
      setCands(next);
      setEditing(null);
      onUpdated?.({ ...asset, output_text: JSON.stringify(next) });
      toast.success('已保存');
    } catch (e: any) {
      toast.error(e?.message || '保存失败');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="font-display text-[11px] text-accent tracking-[0.18em]">
              {asset.kind === 'photo' ? '图片' : asset.kind === 'copy' ? '文案' : '视频'}
            </span>
            <span className="w-1 h-1 rounded-full bg-accent" />
            <span className="text-[12px] text-muted-foreground">
              {new Date(asset.created_at).toLocaleString('zh-CN')}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* 图片 */}
        {asset.kind === 'photo' && (
          <div className="space-y-3">
            {asset.output_url ? (
              <img src={asset.output_url} alt="" className="w-full rounded-lg border border-accent/15" loading="eager" decoding="async" />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">暂无输出图</p>
            )}

            {asset.output_url && (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => copy(asset.output_url)}>
                  <Copy className="w-3.5 h-3.5" />复制链接
                </Button>
                <Button className="flex-1" onClick={() => downloadAsset('image')} disabled={downloading}>
                  {downloading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}下载
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 文案 */}
        {asset.kind === 'copy' && (
          <div className="space-y-3">
            {asset.meta?.platform && (
              <p className="text-[11px] text-muted-foreground">
                平台 · {asset.meta.platform}　口吻 · {asset.meta.tone}
              </p>
            )}
            {cands.length === 0 && <p className="text-sm text-muted-foreground">没有可读的文案内容</p>}
            {cands.map((c, i) => (
              <div key={i} className="border border-accent/15 rounded-lg p-3 space-y-2 bg-card">
                <div className="flex items-center justify-between">
                  <span className="font-display text-[11px] text-accent tracking-[0.18em]">
                    候选 · {String(i + 1).padStart(2, '0')}
                  </span>
                  {editing === i ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}><X className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" onClick={saveEdit} disabled={saving}>
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}保存
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => beginEdit(i)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => copy([c.title, c.body, c.hashtags?.join(' ')].filter(Boolean).join('\n\n'))}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {editing === i ? (
                  <div className="space-y-2">
                    <Input
                      value={draft.title || ''}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      placeholder="标题"
                      className="text-sm"
                    />
                    <Textarea
                      value={draft.body || ''}
                      onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                      placeholder="正文"
                      rows={6}
                      className="text-sm resize-none"
                    />
                    <Input
                      value={(draft.hashtags || []).join(' ')}
                      onChange={(e) => setDraft({ ...draft, hashtags: e.target.value.split(/\s+/).filter(Boolean) })}
                      placeholder="#标签 用空格分隔"
                      className="text-xs"
                    />
                    <Input
                      value={draft.first_comment || ''}
                      onChange={(e) => setDraft({ ...draft, first_comment: e.target.value })}
                      placeholder="首评"
                      className="text-xs"
                    />
                  </div>
                ) : (
                  <>
                    {c.title && <p className="font-display text-[15px] leading-snug">{c.title}</p>}
                    {c.body && <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{c.body}</p>}
                    {c.hashtags && c.hashtags.length > 0 && (
                      <p className="text-[11px] text-accent">{c.hashtags.join(' ')}</p>
                    )}
                    {c.first_comment && (
                      <p className="text-[11px] text-muted-foreground border-t border-border pt-1.5">
                        <span className="text-accent font-semibold mr-1">首评</span>{c.first_comment}
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 视频 */}
        {asset.kind === 'video' && (
          <div className="space-y-3">
            <div>
              <p className="font-display text-lg leading-snug text-foreground">
                {(asset.meta?.title || asset.meta?.topic || '未命名视频').toString().slice(0, 30)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {asset.meta?.style_label && <span>{asset.meta.style_label}　·　</span>}
                时长 {asset.meta?.duration || '?'}s　{asset.meta?.aspect || ''}
                {asset.meta?.mode === 'text2video' && '　· 文生视频'}
                <span className="mx-1">·</span>状态 {asset.meta?.status || '未知'}
              </p>
            </div>
            {asset.meta?.topic && asset.meta?.topic !== asset.meta?.title && (
              <div className="border border-accent/15 rounded-lg p-3 bg-muted/30">
                <p className="text-[10px] uppercase tracking-[0.18em] text-accent mb-1">立意</p>
                <p className="text-sm">{asset.meta.topic}</p>
              </div>
            )}
            {asset.output_url ? (
              <LazyVideoPlayer
                src={asset.output_url}
                assetId={asset.id}
                expired={asset.meta?.status === 'expired'}
                onRefreshed={(nextUrl) => onUpdated?.({ ...asset, output_url: nextUrl })}
                onPosterUpdated={(nextPoster) => onUpdated?.({ ...asset, meta: { ...(asset.meta || {}), poster_url: nextPoster } })}
                poster={asset.meta?.poster_url || asset.meta?.cover_url || undefined}
              />

            ) : asset.meta?.status === 'failed' ? (
              <div className="space-y-2">
                <VideoFailureCard
                  error={asset.meta?.error || '视频生成失败'}
                  allowRetry={false}
                  onApplyFix={(fix) => {
                    if (fix.kind === 'delete') {
                      if (confirm('确认删除这条失败的视频任务？')) {
                        onDelete?.(asset);
                        onOpenChange(false);
                      }
                    }
                  }}
                />
                {(asset.meta?.error || '').includes('超过') || Array.isArray(asset.meta?.segment_urls) ? (
                  <Button
                    className="w-full"
                    onClick={continueStitching}
                    disabled={stitching}
                  >
                    {stitching ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshIconTop className="w-3.5 h-3.5 mr-1" />}
                    不重渲，继续合成已生成分段
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={regenerateVideo}
                  disabled={regenerating}
                >
                  {regenerating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshIconTop className="w-3.5 h-3.5 mr-1" />}
                  用同样的脚本重新生成
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                视频还在排队渲染，完成后这里会出现可播放的视频。
              </p>
            )}

            {/* 视频脚本(折叠) */}
            {asset.output_url && (
              <VideoScriptPanel script={videoScript} open={scriptOpen} onToggle={() => setScriptOpen(v => !v)} />
            )}

            {/* 视频可用时:自动生成单条小红书文案 + 下载 */}
            {asset.output_url && (
              <div className="space-y-2 pt-1">
                {videoCopy ? (
                  <div className="border border-pink-300/40 rounded-lg p-3 space-y-2.5 bg-gradient-to-br from-pink-50/70 via-rose-50/50 to-orange-50/40 dark:from-pink-950/20 dark:via-rose-950/15 dark:to-orange-950/10">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-[11px] text-pink-600 dark:text-pink-400 tracking-[0.18em] flex items-center gap-1">
                        📕 小红书文案
                      </span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { copy(videoCopyText(videoCopy)); }} title="复制全文">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => generateVideoCopy()} disabled={genCopyLoading} title="重新生成">
                          {genCopyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshIconTop className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </div>
                    {videoCopy.title && <p className="font-display text-[15px] leading-snug">✨ {videoCopy.title}</p>}
                    {videoCopy.body && <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{videoCopy.body}</p>}
                    {videoCopy.hashtags && videoCopy.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {videoCopy.hashtags.map((tag, i) => (
                          <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-pink-100/80 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {videoCopy.first_comment && (
                      <p className="text-[11px] text-muted-foreground border-t border-pink-200/40 dark:border-pink-800/30 pt-1.5">
                        <span className="text-pink-600 dark:text-pink-400 font-semibold mr-1">💬 首评</span>{videoCopy.first_comment}
                      </p>
                    )}
                    <Button
                      className="w-full bg-pink-500 hover:bg-pink-600 text-white shadow-sm"
                      onClick={() => {
                        navigator.clipboard.writeText(videoCopyText(videoCopy));
                        toast.success('小红书文案已复制,快去发布吧 ✨');
                      }}
                    >
                      <Copy className="w-4 h-4 mr-1.5" />一键复制全文
                    </Button>
                  </div>
                ) : (
                  <div className="border border-dashed border-pink-300/50 rounded-lg p-3 text-center space-y-2 bg-pink-50/30 dark:bg-pink-950/10">
                    <p className="text-[11px] text-muted-foreground">
                      {genCopyLoading ? '正在根据脚本生成小红书文案…' : '还没生成小红书文案 📝'}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => generateVideoCopy()} disabled={genCopyLoading}>
                      {genCopyLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                      生成小红书文案
                    </Button>
                  </div>
                )}


                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => copy(asset.output_url)}>
                    <Copy className="w-3.5 h-3.5 mr-1" />复制链接
                  </Button>
                  <Button className="flex-1" onClick={downloadVideo} disabled={downloading}>
                    {downloading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
                    下载视频{videoCopy ? ' + 复制文案' : ''}
                  </Button>
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-500 text-white hover:opacity-90"
                  onClick={() => {
                    onOpenChange(false);
                    window.location.href = `/me/marketing/dispatch/workbench?asset_id=${asset.id}`;
                  }}
                >
                  ✈️ 一键发布到自媒体平台
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={regenerateVideo}
                  disabled={regenerating}
                >
                  {regenerating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshIconTop className="w-3.5 h-3.5 mr-1" />}
                  用同样的脚本重新生成一条
                </Button>
              </div>
            )}
          </div>
        )}

        {onDelete && (
          <div className="pt-2 border-t border-border/60">
            <Button
              variant="outline"
              className="w-full text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                if (confirm('确认删除这条素材？删除后无法恢复。')) {
                  onDelete?.(asset);
                  onOpenChange(false);
                }
              }}
            >
              <X className="w-3.5 h-3.5 mr-1" />删除此素材
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


// 给列表卡片预览文案用 — 不再露出 JSON
export function copyPreview(asset: any): string {
  if (asset?.kind !== 'copy' || !asset.output_text) return '';
  try {
    const arr = JSON.parse(asset.output_text);
    const first = Array.isArray(arr) ? arr[0] : arr;
    return ((first?.title || first?.body || '') as string).replace(/\n+/g, ' ').slice(0, 80);
  } catch {
    return (asset.output_text as string).replace(/[\[\]{}"`]/g, '').slice(0, 80);
  }
}

// 视频脚本折叠面板:展示 hook / scenes / outro
function VideoScriptPanel({ script, open, onToggle }: { script: any; open: boolean; onToggle: () => void }) {
  const clips: { label: string; c: any }[] = [];
  if (script?.hook) clips.push({ label: '钩子', c: script.hook });
  if (Array.isArray(script?.scenes)) script.scenes.forEach((c: any, i: number) => clips.push({ label: `镜${String(i + 1).padStart(2, '0')}`, c }));
  if (script?.outro) clips.push({ label: '收尾', c: script.outro });
  const total = clips.reduce((a, x) => a + (Number(x.c?.duration_s) || 0), 0);

  return (
    <div className="rounded-lg border border-border bg-card/60 overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-muted/40">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <FileText className="w-3.5 h-3.5 text-accent" />
        <span className="font-medium">视频脚本</span>
        {clips.length > 0 ? (
          <span className="text-muted-foreground text-[11px]">· 共 {clips.length} 镜 · 总 {Math.round(total)}s</span>
        ) : (
          <span className="text-muted-foreground text-[11px]">· {script ? '空脚本' : '脚本已过期或未保存'}</span>
        )}
      </button>
      {open && clips.length > 0 && (
        <ul className="divide-y divide-border">
          {clips.map((x, i) => (
            <li key={i} className="px-3 py-2 text-[11.5px] space-y-0.5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="font-medium text-foreground">{x.label}</span>
                <span>· {Number(x.c?.duration_s) || 0}s</span>
                {x.c?.motion ? <span>· {x.c.motion}</span> : null}
              </div>
              {x.c?.dialogue ? <p className="text-foreground">🎙 {x.c.dialogue}</p> : null}
              {x.c?.subtitle ? <p className="text-accent">💬 {x.c.subtitle}</p> : null}
              {x.c?.scene ? <p className="text-muted-foreground line-clamp-2">🎬 {x.c.scene}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

