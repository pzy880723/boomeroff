// 营销中心通用多图上传卡片(极简留白风格)
// - 用户选完文件,立刻显示本地预览
// - 每张缩略图实时显示:压缩中 / 上传中(进度环) / ✓ / 失败!(可重试 + 错误原因)
// - 顶部一条细进度条 + "上传中 X/N"
// - 哈希去重提升到「整店」级别:同 shop_id + 同 sha256 直接复用
import { useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { uploadMarketingImages, type UploadStage } from './uploadMarketingImages';
import { toast } from 'sonner';
import { fileSha256 } from '@/lib/fileSha256';
import { supabase } from '@/integrations/supabase/client';
import { UploadProgressBar, ItemTile, type UploadTileItem } from '@/components/marketing/UploadProgressTiles';

type Item = UploadTileItem & { file: File; url?: string };

export type UploadGridProps = {
  urls: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  preset?: 'thumb' | 'hd';
  title?: string;
  shopId?: string | null;
  defaultTags?: string[];
};

export function UploadGrid({ urls, onChange, max = 10, preset = 'thumb', title = '素材', shopId = null, defaultTags = [] }: UploadGridProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const inflight = items.filter(i => i.stage !== 'done' && i.stage !== 'error').length;
  const totalActive = items.length;
  const doneCount = items.filter(i => i.stage === 'done').length;
  const total = urls.length + totalActive;
  const remaining = Math.max(0, max - total);

  const updateItem = (id: string, patch: Partial<Item>) =>
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));

  // 查重:优先 shop 级,无 shop 时退回 user 私有
  const lookupExisting = async (hash: string): Promise<string | null> => {
    if (!user) return null;
    try {
      let q = supabase
        .from('marketing_assets' as any)
        .select('output_url')
        .eq('sha256', hash)
        .not('output_url', 'is', null)
        .limit(1);
      if (shopId) q = q.eq('shop_id', shopId);
      else q = q.eq('user_id', user.id).is('shop_id', null);
      const { data } = await q.maybeSingle();
      return (data as any)?.output_url || null;
    } catch {
      return null;
    }
  };

  const processOne = async (
    file: File,
    onStage: (s: UploadStage, url?: string, error?: string) => void,
  ): Promise<{ url: string; reused: boolean }> => {
    if (!user) throw new Error('未登录');
    onStage('compressing');
    const hash = await fileSha256(file);

    const hit = await lookupExisting(hash);
    if (hit) { onStage('done', hit); return { url: hit, reused: true }; }

    let finalUrl: string | undefined;
    let finalErr: string | undefined;
    await uploadMarketingImages(user.id, [file], {
      preset,
      onProgress: ({ stage, url, error }) => {
        onStage(stage, url, error);
        if (stage === 'done' && url) finalUrl = url;
        if (stage === 'error') finalErr = error;
      },
    });
    if (!finalUrl) throw new Error(finalErr || '上传失败');

    try {
      await supabase.from('marketing_assets' as any).insert({
        user_id: user.id,
        shop_id: shopId,
        kind: 'photo',
        output_url: finalUrl,
        input_image_urls: [finalUrl],
        sha256: hash,
        tags: defaultTags,
        meta: { source: 'reference_upload', sha256: hash, filename: file.name },
      });
    } catch (e: any) {
      console.warn('[upload-grid] asset insert failed', e?.message);
    }
    return { url: finalUrl, reused: false };
  };

  const onPick = async (files: FileList | null) => {
    if (!files || !user) return;
    const picked = Array.from(files).slice(0, remaining);
    if (!picked.length) { toast.error(`最多 ${max} 张`); return; }

    const hashes = await Promise.all(picked.map((f) => fileSha256(f).catch(() => `r-${Math.random()}`)));
    const seen = new Set<string>();
    const arr: File[] = [];
    const localDupCount = picked.length - new Set(hashes).size;
    picked.forEach((f, i) => {
      const h = hashes[i];
      if (seen.has(h)) return;
      seen.add(h);
      arr.push(f);
    });

    const newItems: Item[] = arr.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      preview: URL.createObjectURL(f),
      stage: 'queued',
    }));
    setItems((prev) => [...prev, ...newItems]);

    const successUrls: string[] = [];
    let reusedCount = 0;
    const CONCURRENCY = 3;
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const i = cursor++;
        if (i >= newItems.length) return;
        const it = newItems[i];
        try {
          const { url, reused } = await processOne(it.file, (stage, url, error) =>
            updateItem(it.id, { stage, url, error }),
          );
          successUrls.push(url);
          if (reused) reusedCount += 1;
        } catch (e: any) {
          const msg = e?.message || (typeof e === 'string' ? e : JSON.stringify(e || {}).slice(0, 80)) || '上传失败';
          updateItem(it.id, { stage: 'error', error: msg });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, newItems.length) }, worker));

    if (successUrls.length) onChange([...urls, ...successUrls]);
    setItems((prev) => prev.filter((it) => it.stage !== 'done'));

    const newlyAdded = successUrls.length - reusedCount;
    const dedupTotal = reusedCount + localDupCount;
    if (newlyAdded > 0 || dedupTotal > 0) {
      const parts: string[] = [];
      if (newlyAdded > 0) parts.push(`新增 ${newlyAdded} 张`);
      if (dedupTotal > 0) parts.push(`去重复用 ${dedupTotal} 张`);
      toast.success(parts.join(' · '));
    }
  };

  const removeUrl = (i: number) => onChange(urls.filter((_, j) => j !== i));
  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const retryOne = async (id: string) => {
    if (!user) return;
    const it = items.find((x) => x.id === id);
    if (!it) return;
    updateItem(id, { stage: 'queued', error: undefined });
    try {
      const { url } = await processOne(it.file, (stage, url, error) =>
        updateItem(id, { stage, url, error }),
      );
      onChange([...urls, url]);
      setTimeout(() => removeItem(id), 50);
    } catch (e: any) {
      const msg = e?.message || '失败';
      updateItem(id, { stage: 'error', error: msg });
    }
  };

  return (
    <div className="bg-card rounded-[0.875rem] shadow-sm overflow-hidden border border-accent/15">
      <UploadProgressBar total={totalActive} done={doneCount} />

      <div className="p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-accent" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">{title}</span>
            <span className="text-[10px] text-muted-foreground">最多 {max} 张</span>
          </div>
          {inflight > 0 && (
            <span className="text-[11px] text-muted-foreground font-medium">
              上传中 {doneCount}/{totalActive}
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2.5">
          {urls.map((u, i) => (
            <div key={`u-${u}`} className="relative aspect-square rounded-lg overflow-hidden group border border-border">
              <img src={u} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeUrl(i)}
                aria-label="移除"
                className="absolute -top-0.5 -right-0.5 bg-foreground/60 text-background rounded-full p-0.5 hover:bg-foreground transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {items.map(it => (
            <ItemTile key={it.id} item={it} onRemove={() => removeItem(it.id)} onRetry={() => retryOne(it.id)} />
          ))}

          {remaining > 0 && (
            <>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:bg-muted/40 transition-colors active:scale-95"
                aria-label="添加图片"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => { onPick(e.target.files); e.target.value = ''; }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
