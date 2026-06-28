// 发布工作台用:从素材库挑视频(单选)或图片(多选,1-9)
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Loader2, Check, Play, Maximize2, Camera, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { thumbUrl, thumbSrcSet } from '@/lib/imageUrl';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageLightbox } from '@/components/voucher/ImageLightbox';
import { assetSource, type AssetSource } from '@/lib/assetSource';

export type PickedAsset =
  | { kind: 'video'; asset: any }
  | { kind: 'image_text'; images: string[]; assetIds: string[] };

export function LibraryAssetPickerDialog({
  open, onOpenChange, shopId, onConfirm, defaultTab = 'video', maxImages = 9,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shopId: string | null;
  onConfirm: (picked: PickedAsset) => void;
  defaultTab?: 'video' | 'image_text';
  maxImages?: number;
}) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'video' | 'image_text'>(defaultTab);
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<any[]>([]);
  const [images, setImages] = useState<any[]>([]);
  const [selVideo, setSelVideo] = useState<any | null>(null);
  const [selImgs, setSelImgs] = useState<Map<string, string>>(new Map()); // assetId -> url
  const [lbIdx, setLbIdx] = useState<number | null>(null);
  const [loadedImgs, setLoadedImgs] = useState<Set<string>>(new Set());
  const [imgSource, setImgSource] = useState<AssetSource | 'all'>('upload');

  useEffect(() => { if (open) { setTab(defaultTab); setSelVideo(null); setSelImgs(new Map()); setLbIdx(null); setLoadedImgs(new Set()); setImgSource('upload'); } }, [open, defaultTab]);

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      setLoading(true);
      const base = supabase
        .from('marketing_assets' as any)
        .select('id, kind, output_url, meta, tags, category, created_at, shop_id, user_id')
        .not('output_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(60);
      const q1 = shopId ? base.eq('shop_id', shopId) : base.eq('user_id', user.id);
      const { data } = await q1;
      const all = (data as any[]) || [];
      setVideos(all.filter((a) => a.kind === 'video'));
      setImages(all.filter((a) => a.kind === 'photo'));
      setLoading(false);
    })();
  }, [open, user, shopId]);

  const toggleImg = (it: any) => {
    const next = new Map(selImgs);
    if (next.has(it.id)) next.delete(it.id);
    else { if (next.size >= maxImages) return; next.set(it.id, it.output_url); }
    setSelImgs(next);
  };

  const confirm = () => {
    if (tab === 'video') {
      if (!selVideo) return;
      onConfirm({ kind: 'video', asset: selVideo });
    } else {
      if (selImgs.size === 0) return;
      onConfirm({ kind: 'image_text', images: Array.from(selImgs.values()), assetIds: Array.from(selImgs.keys()) });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">从素材库选择</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="video">视频</TabsTrigger>
            <TabsTrigger value="image_text">图文 ({selImgs.size}/{maxImages})</TabsTrigger>
          </TabsList>

          <TabsContent value="video" className="mt-3">
            {loading ? (
              <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" /></div>
            ) : videos.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">暂无视频素材</div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {videos.map((it, i) => {
                  const poster = it.meta?.poster_url || it.meta?.cover_url;
                  const thumb = poster ? (thumbUrl(poster, 240) || poster) : null;
                  const srcSet = poster ? thumbSrcSet(poster, 120) : undefined;
                  const loaded = !thumb || loadedImgs.has(it.id);
                  const active = selVideo?.id === it.id;
                  return (
                    <button key={it.id} onClick={() => setSelVideo(it)}
                      className={['relative aspect-[9/16] rounded overflow-hidden border-2 transition-all bg-muted',
                        active ? 'border-accent shadow-md' : 'border-transparent hover:border-accent/40'].join(' ')}>
                      {thumb ? (
                        <>
                          {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
                          <img src={thumb} srcSet={srcSet} sizes="33vw" alt="" width={240} height={427}
                            loading={i < 6 ? 'eager' : 'lazy'} decoding="async"
                            className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                            onLoad={() => setLoadedImgs((p) => p.has(it.id) ? p : new Set(p).add(it.id))}
                            onError={() => setLoadedImgs((p) => p.has(it.id) ? p : new Set(p).add(it.id))} />
                        </>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center"><Play className="w-6 h-6 text-muted-foreground" /></div>
                      )}
                      {active && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                          <Check className="w-3 h-3" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="image_text" className="mt-3 space-y-2">
            <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-[11px]">
              {([
                { v: 'upload', label: '我上传的', Icon: Camera },
                { v: 'generated', label: 'AI 生成', Icon: Sparkles },
                { v: 'all', label: '全部', Icon: null as any },
              ] as { v: AssetSource | 'all'; label: string; Icon: any }[]).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setImgSource(opt.v)}
                  className={[
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors',
                    imgSource === opt.v ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {opt.Icon && <opt.Icon className="w-3 h-3" />}{opt.label}
                </button>
              ))}
            </div>
            {(() => {
              const matchSrc = (it: any) => {
                if (imgSource === 'all') return true;
                const s = assetSource(it);
                if (imgSource === 'upload') return s === 'upload' || s === 'base';
                return s === imgSource;
              };
              const imgList = images.filter(matchSrc);
              if (loading) return (<div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" /></div>);
              if (imgList.length === 0) return (<div className="py-8 text-center text-sm text-muted-foreground">暂无图片素材</div>);
              return (
              <div className="grid grid-cols-3 gap-2">
                {imgList.map((it, i) => {
                  const active = selImgs.has(it.id);
                  const thumb = thumbUrl(it.output_url, 240) || it.output_url;
                  const srcSet = thumbSrcSet(it.output_url, 120);
                  const loaded = loadedImgs.has(it.id);
                  return (
                    <div key={it.id} className="relative">
                      <button onClick={() => toggleImg(it)}
                        className={['block w-full relative aspect-square rounded overflow-hidden border-2 transition-all bg-muted',
                          active ? 'border-accent shadow-md' : 'border-transparent hover:border-accent/40'].join(' ')}>
                        {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
                        <img src={thumb} srcSet={srcSet} sizes="33vw" alt="" width={240} height={240}
                          loading={i < 6 ? 'eager' : 'lazy'} decoding="async"
                          className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                          onLoad={() => setLoadedImgs((p) => p.has(it.id) ? p : new Set(p).add(it.id))}
                          onError={() => setLoadedImgs((p) => p.has(it.id) ? p : new Set(p).add(it.id))} />
                        {active && (
                          <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-[10px] font-bold">
                            {Array.from(selImgs.keys()).indexOf(it.id) + 1}
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLbIdx(i); }}
                        className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/55 backdrop-blur text-white flex items-center justify-center active:scale-95"
                        aria-label="放大查看"
                      >
                        <Maximize2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
              );
            })()}
          </TabsContent>
        </Tabs>

        <ImageLightbox
          open={lbIdx !== null}
          onClose={() => setLbIdx(null)}
          images={images.filter((it) => {
            if (imgSource === 'all') return true;
            const s = assetSource(it);
            if (imgSource === 'upload') return s === 'upload' || s === 'base';
            return s === imgSource;
          }).map((it) => it.output_url as string).filter(Boolean)}
          initialIndex={lbIdx ?? 0}
        />

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="flex-1"
            disabled={tab === 'video' ? !selVideo : selImgs.size === 0}
            onClick={confirm}>
            确认{tab === 'video' ? '视频' : `${selImgs.size} 张图`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
