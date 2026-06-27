// 发布工作台用:从素材库挑视频(单选)或图片(多选,1-9)
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Loader2, Check, Play, Maximize2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { thumbUrl } from '@/lib/imageUrl';
import { ImageLightbox } from '@/components/voucher/ImageLightbox';

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

  useEffect(() => { if (open) { setTab(defaultTab); setSelVideo(null); setSelImgs(new Map()); } }, [open, defaultTab]);

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      setLoading(true);
      const base = supabase
        .from('marketing_assets' as any)
        .select('id, kind, output_url, meta, tags, category, created_at, shop_id, user_id')
        .not('output_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(120);
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
                {videos.map((it) => {
                  const poster = it.meta?.poster_url || it.meta?.cover_url;
                  const active = selVideo?.id === it.id;
                  return (
                    <button key={it.id} onClick={() => setSelVideo(it)}
                      className={['relative aspect-[9/16] rounded overflow-hidden border-2 transition-all bg-muted',
                        active ? 'border-accent shadow-md' : 'border-transparent hover:border-accent/40'].join(' ')}>
                      {poster
                        ? <img src={poster} alt="" className="w-full h-full object-cover" />
                        : <div className="absolute inset-0 flex items-center justify-center"><Play className="w-6 h-6 text-muted-foreground" /></div>}
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

          <TabsContent value="image_text" className="mt-3">
            {loading ? (
              <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" /></div>
            ) : images.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">暂无图片素材</div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {images.map((it) => {
                  const active = selImgs.has(it.id);
                  return (
                    <button key={it.id} onClick={() => toggleImg(it)}
                      className={['relative aspect-square rounded overflow-hidden border-2 transition-all',
                        active ? 'border-accent shadow-md' : 'border-transparent hover:border-accent/40'].join(' ')}>
                      <img src={it.output_url} alt="" className="w-full h-full object-cover" />
                      {active && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-[10px] font-bold">
                          {Array.from(selImgs.keys()).indexOf(it.id) + 1}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

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
