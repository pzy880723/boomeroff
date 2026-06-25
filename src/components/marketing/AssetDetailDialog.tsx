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
import { Copy, Download, Loader2, Pencil, Save, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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
  const [cands, setCands] = useState<CopyCand[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<CopyCand>({});
  const [saving, setSaving] = useState(false);
  // 视频专用:一键生成的小红书文案
  const [videoCopy, setVideoCopy] = useState<CopyCand | null>(null);
  const [genCopyLoading, setGenCopyLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

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

  const generateVideoCopy = async () => {
    if (!asset || asset.kind !== 'video') return;
    const poster: string | undefined =
      asset.meta?.poster_url ||
      asset.meta?.cover_url ||
      (Array.isArray(asset.meta?.image_urls) && asset.meta.image_urls[0]) ||
      (Array.isArray(asset.input_image_urls) && asset.input_image_urls[0]) ||
      undefined;
    if (!poster) { toast.error('找不到视频封面,无法生成文案'); return; }
    setGenCopyLoading(true);
    try {
      const topic = asset.meta?.topic || asset.meta?.style_label || '';
      const { data, error } = await supabase.functions.invoke('generate-marketing-copy', {
        body: {
          image_urls: [poster],
          platform: 'xhs',
          tone: '种草',
          highlight: topic ? `配合一条 ${asset.meta?.duration || 15}s 视频:${topic}` : '',
          shop_id: asset.shop_id || null,
          from_video_id: asset.id,
        },
      });
      if (error) throw error;
      const d = data as any;
      const c: CopyCand | undefined = Array.isArray(d?.candidates) ? d.candidates[0] : undefined;
      if (!c) throw new Error(d?.error || '生成失败');
      setVideoCopy(c);
      // 写回 asset.meta,下次打开能恢复
      const nextMeta = { ...(asset.meta || {}), video_copy: c, video_copy_asset_id: d?.asset_id || null };
      try {
        await supabase.from('marketing_assets' as any).update({ meta: nextMeta }).eq('id', asset.id);
        onUpdated?.({ ...asset, meta: nextMeta });
      } catch {}
      toast.success('文案已生成');
    } catch (e: any) {
      toast.error(e?.message || '生成失败');
    } finally { setGenCopyLoading(false); }
  };

  const downloadVideo = async () => {
    if (!asset?.output_url) return;
    setDownloading(true);
    try {
      const res = await fetch(asset.output_url, { credentials: 'omit' });
      if (!res.ok) throw new Error('下载失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const tail = asset.meta?.storage_path?.split('/').pop() || `video-${asset.id}.mp4`;
      a.download = tail.endsWith('.mp4') ? tail : `${tail}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      // 顺便复制文案
      const txt = videoCopyText(videoCopy);
      if (txt) {
        try { await navigator.clipboard.writeText(txt); toast.success('视频已开始下载,文案也复制好了'); }
        catch { toast.success('视频已开始下载'); }
      } else {
        toast.success('视频已开始下载');
      }
    } catch (e: any) {
      // 浏览器对跨域链接 download 会被忽略,退而求其次直接新开窗口
      window.open(asset.output_url, '_blank', 'noreferrer');
      toast.message('已在新窗口打开,请长按/右键保存');
    } finally { setDownloading(false); }
  };

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
              <img src={asset.output_url} alt="" className="w-full rounded-lg border border-accent/15" />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">暂无输出图</p>
            )}
            {asset.output_url && (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => copy(asset.output_url)}>
                  <Copy className="w-3.5 h-3.5" />复制链接
                </Button>
                <Button variant="outline" className="flex-1" asChild>
                  <a href={asset.output_url} target="_blank" rel="noreferrer" download>
                    <Download className="w-3.5 h-3.5" />下载
                  </a>
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
              <div className="space-y-3 py-4">
                <p className="text-sm text-destructive text-center">
                  {asset.meta?.error || '视频生成失败,请删除后重新生成。'}
                </p>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => {
                    if (confirm('确认删除这条失败的视频任务？')) {
                      onDelete?.(asset);
                      onOpenChange(false);
                    }
                  }}
                >
                  删除此任务
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                视频还在排队渲染，完成后这里会出现可播放的视频。
              </p>
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
