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

  const onPick = async (files: FileList | null) => {
    if (!files || !user) return;
    const arr = Array.from(files).slice(0, remaining);
    if (!arr.length) {
      toast.error(`最多 ${max} 张`);
      return;
    }
    const newItems: Item[] = arr.map(f => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      preview: URL.createObjectURL(f),
      stage: 'queued',
    }));
    setItems(prev => [...prev, ...newItems]);

    const successUrls: string[] = [];
    await uploadMarketingImages(user.id, arr, {
      preset,
      onProgress: ({ index, stage, url, error }) => {
        const it = newItems[index];
        if (!it) return;
        updateItem(it.id, { stage, url, error });
        if (stage === 'done' && url) successUrls.push(url);
      },
    });
    // 把成功的合并进父级 urls,失败的留在 items 让用户看到红色失败块
    if (successUrls.length) onChange([...urls, ...successUrls]);
    // 移除已成功的(它们已经在 urls 里展示了)
    setItems(prev => {
      const doneIds = new Set(
        newItems.filter(it => successUrls.includes(it.url || '__none__') || prev.find(p => p.id === it.id)?.stage === 'done').map(it => it.id),
      );
      // 实际上更简单:把所有 stage==='done' 的清掉
      return prev.filter(it => it.stage !== 'done').map(it => {
        // revoke 预览 URL 节省内存(失败的也清,显示纯红色失败块即可)
        return it;
      });
    });
  };

  const removeUrl = (i: number) => onChange(urls.filter((_, j) => j !== i));
  const removeItem = (id: string) => setItems(prev => prev.filter(it => it.id !== id));
  const retryOne = async (id: string) => {
    if (!user) return;
    const it = items.find(x => x.id === id);
    if (!it) return;
    updateItem(id, { stage: 'queued', error: undefined });
    await uploadMarketingImages(user.id, [it.file], {
      preset,
      onProgress: ({ stage, url, error }) => {
        updateItem(id, { stage, url, error });
        if (stage === 'done' && url) {
          onChange([...urls, url]);
          setTimeout(() => removeItem(id), 50);
        }
      },
    });
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm overflow-hidden border border-border">
      {/* 顶部进度条:有任务时显示 */}
      <div className={`h-1 w-full bg-muted ${inflight === 0 ? 'opacity-0' : ''} transition-opacity`}>
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            {title} <span className="text-muted-foreground font-normal">（最多 {max} 张）</span>
          </h3>
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
