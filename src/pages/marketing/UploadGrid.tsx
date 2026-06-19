// 营销中心通用多图上传卡片(极简留白风格)
// - 用户选完文件,立刻显示本地预览
// - 每张缩略图实时显示:压缩中 / 上传中(进度环) / ✓ / 失败!
// - 顶部一条细进度条 + "上传中 X/N"
// - 失败可单张重试或移除
import { useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { uploadMarketingImages, type UploadStage } from './uploadMarketingImages';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { fileSha256 } from '@/lib/fileSha256';
import { supabase } from '@/integrations/supabase/client';

type Item = {
  id: string;
  file: File;
  preview: string;
  stage: UploadStage;
  url?: string;
  error?: string;
};

export type UploadGridProps = {
  urls: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  preset?: 'thumb' | 'hd';
  title?: string;
};

export function UploadGrid({ urls, onChange, max = 10, preset = 'thumb', title = '素材' }: UploadGridProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const inflight = items.filter(i => i.stage !== 'done' && i.stage !== 'error').length;
  const totalActive = items.length;
  const doneCount = items.filter(i => i.stage === 'done').length;
  const total = urls.length + totalActive;
  const remaining = Math.max(0, max - total);
  const progress = totalActive ? Math.round((doneCount / totalActive) * 100) : 0;

  const updateItem = (id: string, patch: Partial<Item>) =>
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));

  // 单文件：算 hash → 查我自己的素材库 → 命中则复用 URL，否则压缩上传 + 入库。
  // 返回 { url, reused } 或抛错。
  const processOne = async (
    file: File,
    onStage: (s: UploadStage, url?: string, error?: string) => void,
  ): Promise<{ url: string; reused: boolean }> => {
    if (!user) throw new Error('未登录');
    onStage('compressing');
    const hash = await fileSha256(file);

    // 查重：当前用户自己的素材库
    try {
      const { data: hit } = await supabase
        .from('marketing_assets' as any)
        .select('id, output_url, meta')
        .eq('created_by', user.id)
        .eq('meta->>sha256', hash)
        .not('output_url', 'is', null)
        .limit(1)
        .maybeSingle();
      const hitUrl = (hit as any)?.output_url as string | undefined;
      if (hitUrl) {
        onStage('done', hitUrl);
        return { url: hitUrl, reused: true };
      }
    } catch {
      // 查询失败不阻塞上传
    }

    // 没命中：走原流程
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

    // 入库（失败不阻塞参考图使用）
    try {
      await supabase.from('marketing_assets' as any).insert({
        created_by: user.id,
        kind: 'photo',
        output_url: finalUrl,
        input_image_urls: [finalUrl],
        meta: { source: 'reference_upload', sha256: hash, filename: file.name },
      });
    } catch {
      // ignore
    }
    return { url: finalUrl, reused: false };
  };

  const onPick = async (files: FileList | null) => {
    if (!files || !user) return;
    const picked = Array.from(files).slice(0, remaining);
    if (!picked.length) {
      toast.error(`最多 ${max} 张`);
      return;
    }

    // 同一批内按 hash 排重
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
    await Promise.all(
      newItems.map(async (it) => {
        try {
          const { url, reused } = await processOne(it.file, (stage, url, error) =>
            updateItem(it.id, { stage, url, error }),
          );
          successUrls.push(url);
          if (reused) reusedCount += 1;
        } catch (e: any) {
          updateItem(it.id, { stage: 'error', error: e?.message || '失败' });
        }
      }),
    );

    if (successUrls.length) onChange([...urls, ...successUrls]);
    setItems((prev) => prev.filter((it) => it.stage !== 'done'));

    const newlyAdded = successUrls.length - reusedCount;
    const dedupTotal = reusedCount + localDupCount;
    if (newlyAdded > 0 || dedupTotal > 0) {
      const parts: string[] = [];
      if (newlyAdded > 0) parts.push(`已加入素材库 ${newlyAdded} 张`);
      if (dedupTotal > 0) parts.push(`去重 ${dedupTotal} 张`);
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
      updateItem(id, { stage: 'error', error: e?.message || '失败' });
    }
  };


  return (
    <div className="bg-card rounded-[0.875rem] shadow-sm overflow-hidden border border-accent/15">
      {/* 顶部进度条:有任务时显示 */}
      <div className={`h-[3px] w-full bg-muted ${inflight === 0 ? 'opacity-0' : ''} transition-opacity`}>
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

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
          {/* 已成功:从父级 urls 来 */}
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

          {/* 进行中 / 失败 */}
          {items.map(it => (
            <ItemTile key={it.id} item={it} onRemove={() => removeItem(it.id)} onRetry={() => retryOne(it.id)} />
          ))}

          {/* 添加按钮 */}
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

function ItemTile({ item, onRemove, onRetry }: { item: Item; onRemove: () => void; onRetry: () => void }) {
  if (item.stage === 'error') {
    return (
      <div className="relative aspect-square rounded-lg border border-destructive/30 bg-destructive/5 flex flex-col items-center justify-center gap-1">
        <svg className="w-4 h-4 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <button onClick={onRetry} className="text-[10px] font-medium text-destructive hover:underline">重试</button>
        <button onClick={onRemove} aria-label="移除" className="absolute -top-0.5 -right-0.5 bg-foreground/60 text-background rounded-full p-0.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden bg-muted border border-border">
      <img src={item.preview} alt="" className="w-full h-full object-cover opacity-40" />
      <div className="absolute inset-0 flex items-center justify-center">
        {item.stage === 'compressing' ? (
          <span className="text-[9px] font-medium text-foreground bg-card/95 px-1.5 py-0.5 rounded border border-border">压缩中</span>
        ) : (
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        )}
      </div>
    </div>
  );
}
