import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Check, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { uploadMarketingImages } from '@/pages/marketing/uploadMarketingImages';
import { fileSha256 } from '@/lib/fileSha256';

export function LibraryImagePickerDialog({
  open, onOpenChange, shopId, max = 20, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shopId: string | null;
  max?: number;
  onConfirm: (urls: string[]) => void;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from('marketing_assets' as any)
      .select('id, output_url, shop_id, created_at')
      .eq('user_id', user.id)
      .eq('kind', 'photo')
      .not('output_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(60);
    if (shopId) q = q.eq('shop_id', shopId);
    const { data } = await q;
    setItems((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!open || !user) return;
    setSel(new Set());
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user, shopId]);

  const toggle = (url: string) => {
    const next = new Set(sel);
    if (next.has(url)) next.delete(url);
    else { if (next.size >= max) return; next.add(url); }
    setSel(next);
  };

  const onUpload = async (files: FileList | null) => {
    if (!files || !user) return;
    const arr = Array.from(files).slice(0, max);
    if (!arr.length) return;
    setUploading(true);
    const uploadedUrls: string[] = [];
    try {
      for (const file of arr) {
        try {
          let hash = '';
          try { hash = await fileSha256(file); } catch {}
          let finalUrl: string | undefined;
          await uploadMarketingImages(user.id, [file], {
            preset: 'thumb',
            onProgress: ({ stage, url }) => {
              if (stage === 'done' && url) finalUrl = url;
            },
          });
          if (!finalUrl) continue;
          await supabase.from('marketing_assets' as any).insert({
            user_id: user.id,
            shop_id: shopId,
            kind: 'photo',
            output_url: finalUrl,
            input_image_urls: [finalUrl],
            meta: { source: 'library_picker_upload', sha256: hash, filename: file.name },
          });
          uploadedUrls.push(finalUrl);
        } catch (e: any) {
          console.warn('[library-upload] one failed', e);
        }
      }
      if (uploadedUrls.length) {
        toast.success(`已加入素材库 ${uploadedUrls.length} 张`);
        // 自动勾选新传的图(不超过 max)
        const next = new Set(sel);
        for (const u of uploadedUrls) {
          if (next.size >= max) break;
          next.add(u);
        }
        setSel(next);
        await load();
      } else {
        toast.error('上传失败');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">从素材库导入</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {shopId ? '当前店铺图片' : '所有店铺图片'} · 最多 {max} · 已选 {sel.size}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1"
            disabled={uploading || sel.size >= max}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            上传到素材库
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { onUpload(e.target.files); e.target.value = ''; }}
          />
        </div>
        {loading ? (
          <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" /></div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">该店铺暂无图片素材</p>
            <p className="text-[11px] text-muted-foreground/70">点右上「上传到素材库」直接传几张</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {items.map((it) => {
              const url = it.output_url as string;
              const active = sel.has(url);
              return (
                <button key={it.id} onClick={() => toggle(url)}
                  className={[
                    'relative aspect-square rounded overflow-hidden border-2 transition-all',
                    active ? 'border-accent shadow-md' : 'border-transparent hover:border-accent/40',
                  ].join(' ')}>
                  <img src={url} alt="" className="w-full h-full object-cover" />
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
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="flex-1" disabled={!sel.size}
            onClick={() => { onConfirm(Array.from(sel)); onOpenChange(false); }}>
            导入 {sel.size} 张
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
