// 营销素材详情 / 编辑抽屉。支持文案、图片、视频三种 kind。
import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

function LazyVideoPlayer({ src, poster }: { src: string; poster?: string }) {
  const [active, setActive] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | undefined>(poster);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => { setPosterUrl(poster); }, [poster]);

  useEffect(() => {
    if (active && videoRef.current) {
      // 静默尝试播放;移动浏览器拒绝 autoplay 时只是 reject,不要让它冒成渲染异常
      Promise.resolve().then(() => videoRef.current?.play().catch(() => {}));
    }
  }, [active]);

  if (!src) {
    return (
      <div className="w-full rounded-lg bg-muted aspect-[9/16] max-h-[70vh] flex items-center justify-center text-xs text-muted-foreground">
        视频暂不可用
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
            className="absolute inset-0 w-full h-full object-contain"
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
      <button
        type="button"
        onClick={() => { setVideoError(false); setActive(false); }}
        className="w-full rounded-lg bg-muted aspect-[9/16] max-h-[70vh] flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground"
      >
        <span>视频加载失败</span>
        <span className="underline">点这里重试</span>
      </button>
    );
  }

  return (
    <video
      ref={videoRef}
      src={src}
      controls
      playsInline
      preload="metadata"
      poster={posterUrl}
      onError={() => setVideoError(true)}
      className="w-full rounded-lg bg-black"
    />
  );
}



import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Copy, Download, Loader2, Pencil, Save, X, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { VideoFailureCard } from '@/components/marketing/VideoFailureCard';
import { buildXhsViral, VIRAL_STYLE_LABELS, type ViralStyle } from '@/lib/shareCopy';
import { invokeFn } from '@/lib/invokeFn';
import { completeMarketingVideoFromSegments } from '@/lib/completeMarketingVideo';
import { useAuth } from '@/hooks/useAuth';


interface CopyCand {
  title?: string;
  body?: string;
  hashtags?: string[];
  first_comment?: string;
  style?: ViralStyle;
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
      const { data, error } = await invokeFn('render-marketing-video', {
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
      const { data } = await invokeFn('poll-marketing-video', { body: { job_id: jobId } });
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
    if (!asset) { setCands([]); setVideoCopy(null); return; }
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
    setEditing(null);
  }, [asset]);

  if (!asset) return null;

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('已复制'); };

  const videoCopyText = (c: CopyCand | null) => {
    if (!c) return '';
    return [c.title, c.body, (c.hashtags || []).join(' ')].filter(Boolean).join('\n\n').trim();
  };

  const generateVideoCopy = async (style: ViralStyle = 'scream') => {
    if (!asset || asset.kind !== 'video') return;
    const poster: string | undefined =
      asset.meta?.poster_url ||
      asset.meta?.cover_url ||
      (Array.isArray(asset.meta?.image_urls) && asset.meta.image_urls[0]) ||
      (Array.isArray(asset.input_image_urls) && asset.input_image_urls[0]) ||
      undefined;
    if (!poster) { toast.error('找不到视频封面,无法生成文案'); return; }
    setGenCopyLoading(true);
    let c: CopyCand | null = null;
    try {
      const topic = asset.meta?.topic || asset.meta?.style_label || '';
      const { data, error } = await invokeFn('generate-marketing-copy', {
        body: {
          image_urls: [poster],
          platform: 'xhs',
          tone: '种草',
          style,
          highlight: topic ? `配合一条 ${asset.meta?.duration || 15}s 视频:${topic}` : '',
          shop_id: asset.shop_id || null,
          from_video_id: asset.id,
        },
      });
      if (error) throw error;
      const d = data as any;
      const got: CopyCand | undefined = Array.isArray(d?.candidates) ? d.candidates[0] : undefined;
      if (!got) throw new Error(d?.error || '生成失败');
      c = { ...got, style };
    } catch (e: any) {
      // 兜底:本地爆文模板,断网/限流也能立刻出
      const fallback = buildXhsViral({
        name: asset.meta?.topic || '中古好物',
        category: asset.meta?.category,
      }, style);
      c = fallback;
      toast.message('AI 暂时忙，先给你一版本地爆文模板');
    }
    try {
      setVideoCopy(c);
      const nextMeta = { ...(asset.meta || {}), video_copy: c, video_copy_style: style };
      try {
        await supabase.from('marketing_assets' as any).update({ meta: nextMeta }).eq('id', asset.id);
        onUpdated?.({ ...asset, meta: nextMeta });
      } catch {}
      toast.success(`文案已生成 · ${VIRAL_STYLE_LABELS[style]}`);
    } finally { setGenCopyLoading(false); }
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
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      // 优先用响应头里的 filename
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      a.download = m ? decodeURIComponent(m[1]) : (tail || `boomer-${kind}-${asset.id.slice(0,8)}.${kind === 'video' ? 'mp4' : 'jpg'}`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      // 视频同时复制文案
      if (kind === 'video') {
        const txt = videoCopyText(videoCopy);
        if (txt) {
          try { await navigator.clipboard.writeText(txt); toast.success('视频已下载,文案也复制好了'); return; }
          catch { /* noop */ }
        }
      }
      toast.success('下载完成');
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
            <p className="text-[11px] text-muted-foreground">
              状态 · {asset.meta?.status || '未知'}　时长 {asset.meta?.duration || '?'}s　{asset.meta?.aspect || ''}
              {asset.meta?.mode === 'text2video' && '　· 文生视频'}
            </p>
            {asset.meta?.topic && (
              <div className="border border-accent/15 rounded-lg p-3 bg-muted/30">
                <p className="text-[10px] uppercase tracking-[0.18em] text-accent mb-1">立意</p>
                <p className="text-sm">{asset.meta.topic}</p>
              </div>
            )}
            {asset.output_url ? (
              <LazyVideoPlayer
                src={asset.output_url}
                poster={asset.meta?.poster_url || asset.meta?.cover_url || (Array.isArray(asset.meta?.image_urls) && asset.meta.image_urls[0]) || (Array.isArray(asset.input_image_urls) && asset.input_image_urls[0]) || undefined}
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
                    {stitching ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                    不重渲，继续合成已生成分段
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={regenerateVideo}
                  disabled={regenerating}
                >
                  {regenerating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                  用同样的脚本重新生成
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                视频还在排队渲染，完成后这里会出现可播放的视频。
              </p>
            )}

            {/* 视频可用时:一键生成小红书爆文 + 下载 */}
            {asset.output_url && (
              <div className="space-y-2 pt-1">
                {videoCopy ? (
                  <div className="border border-accent/15 rounded-lg p-3 space-y-2 bg-card">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-[11px] text-accent tracking-[0.18em]">
                        小红书爆文{videoCopy.style ? ` · ${VIRAL_STYLE_LABELS[videoCopy.style as ViralStyle]}` : ''}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => copy(videoCopyText(videoCopy))}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {videoCopy.title && <p className="font-display text-[15px] leading-snug">{videoCopy.title}</p>}
                    {videoCopy.body && <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{videoCopy.body}</p>}
                    {videoCopy.hashtags && videoCopy.hashtags.length > 0 && (
                      <p className="text-[11px] text-accent leading-relaxed">{videoCopy.hashtags.join(' ')}</p>
                    )}
                    {videoCopy.first_comment && (
                      <p className="text-[11px] text-muted-foreground border-t border-border pt-1.5">
                        <span className="text-accent font-semibold mr-1">首评</span>{videoCopy.first_comment}
                      </p>
                    )}
                    <div className="pt-2 border-t border-border/60">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" />换个风格再来一版
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(VIRAL_STYLE_LABELS) as ViralStyle[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => generateVideoCopy(s)}
                            disabled={genCopyLoading}
                            className={[
                              'px-2.5 h-7 rounded-full text-[11px] border transition-all',
                              videoCopy.style === s
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-transparent text-foreground border-border hover:border-accent/50',
                            ].join(' ')}
                          >
                            {VIRAL_STYLE_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">挑一种爆文风格 ✨</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(VIRAL_STYLE_LABELS) as ViralStyle[]).map((s) => (
                        <Button
                          key={s}
                          variant="outline"
                          size="sm"
                          className="h-9 text-[12px] justify-center"
                          onClick={() => generateVideoCopy(s)}
                          disabled={genCopyLoading}
                        >
                          {genCopyLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                          {VIRAL_STYLE_LABELS[s]}
                        </Button>
                      ))}
                    </div>
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
                  {regenerating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
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
