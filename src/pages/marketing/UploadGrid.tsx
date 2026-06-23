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

  // 批量查重:一次拿到所有命中
  const lookupExistingBatch = async (hashes: string[]): Promise<Map<string, string>> => {
    const map = new Map<string, string>();
    if (!user || hashes.length === 0) return map;
    try {
      let q = supabase
        .from('marketing_assets' as any)
        .select('output_url, sha256')
        .in('sha256', hashes)
        .not('output_url', 'is', null);
      if (shopId) q = q.eq('shop_id', shopId);
      else q = q.eq('user_id', user.id).is('shop_id', null);
      const { data } = await q;
      ((data as any[]) || []).forEach((r) => {
        if (r?.sha256 && r?.output_url && !map.has(r.sha256)) map.set(r.sha256, r.output_url);
      });
    } catch { /* ignore */ }
    return map;
  };

  // 单图上传:hash 已预先算好,不再重算;insert 走 fire-and-forget,不阻塞下一张
  const processOne = async (
    file: File,
    hash: string,
    onStage: (s: UploadStage, url?: string, error?: string) => void,
  ): Promise<string> => {
    if (!user) throw new Error('未登录');
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

    // 入库异步:不让 worker 等 insert RTT
    void supabase
      .from('marketing_assets' as any)
      .insert({
        user_id: user.id,
        shop_id: shopId,
        kind: 'photo',
        output_url: finalUrl,
        input_image_urls: [finalUrl],
        sha256: hash,
        tags: defaultTags,
        meta: { source: 'reference_upload', sha256: hash, filename: file.name },
      })
      .then(({ error }) => { if (error) console.warn('[upload-grid] asset insert failed', error.message); });
    return finalUrl;
  };

  const onPick = async (files: FileList | null) => {
    if (!files || !user) return;
    const picked = Array.from(files).slice(0, remaining);
    if (!picked.length) { toast.error(`最多 ${max} 张`); return; }

    // 1) 并行算 hash
    const hashes = await Promise.all(picked.map((f) => fileSha256(f).catch(() => `r-${Math.random()}`)));

    // 2) 本地去重
    const localSeen = new Set<string>();
    const localKeep: { file: File; hash: string }[] = [];
    picked.forEach((f, i) => {
      const h = hashes[i];
      if (localSeen.has(h)) return;
      localSeen.add(h);
      localKeep.push({ file: f, hash: h });
    });
    const localDupCount = picked.length - localKeep.length;

    // 3) 一次 DB 查重(整店级)
    const hitMap = await lookupExistingBatch(localKeep.map((x) => x.hash));

    // 4) 命中的直接复用 URL,未命中的进上传队列
    const reusedUrls: string[] = [];
    const toUpload: { file: File; hash: string }[] = [];
    localKeep.forEach((x) => {
      const hit = hitMap.get(x.hash);
      if (hit) reusedUrls.push(hit);
      else toUpload.push(x);
    });

    const newItems: (Item & { hash: string })[] = toUpload.map((x) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: x.file,
      hash: x.hash,
      preview: URL.createObjectURL(x.file),
      stage: 'queued',
    }));
    setItems((prev) => [...prev, ...newItems]);

    const successUrls: string[] = [];
    const CONCURRENCY = 4;
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const i = cursor++;
        if (i >= newItems.length) return;
        const it = newItems[i];
        try {
          const url = await processOne(it.file, it.hash, (stage, url, error) =>
            updateItem(it.id, { stage, url, error }),
          );
          successUrls.push(url);
        } catch (e: any) {
          const msg = e?.message || (typeof e === 'string' ? e : JSON.stringify(e || {}).slice(0, 80)) || '上传失败';
          updateItem(it.id, { stage: 'error', error: msg });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, newItems.length) }, worker));

    const allNew = [...reusedUrls, ...successUrls];
    if (allNew.length) onChange([...urls, ...allNew]);
    setItems((prev) => prev.filter((it) => it.stage !== 'done'));

    const newlyAdded = successUrls.length;
    const dedupTotal = reusedUrls.length + localDupCount;
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
