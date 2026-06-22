// 共享上传进度瓦片:顶部细进度条 + 缩略图网格 + 失败重试
import { Loader2 } from 'lucide-react';
import type { UploadStage } from '@/pages/marketing/uploadMarketingImages';

export type UploadTileItem = {
  id: string;
  preview: string;
  stage: UploadStage;
  error?: string;
};

export function UploadProgressBar({ total, done }: { total: number; done: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const active = total > 0 && done < total;
  return (
    <div className={`h-[3px] w-full bg-muted ${active ? '' : 'opacity-0'} transition-opacity`}>
      <div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function UploadProgressGrid({
  items,
  cols = 'grid-cols-4',
  onRetry,
  onRemove,
}: {
  items: UploadTileItem[];
  cols?: string;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className={`grid ${cols} gap-2.5`}>
      {items.map((it) => (
        <ItemTile key={it.id} item={it} onRemove={() => onRemove(it.id)} onRetry={() => onRetry(it.id)} />
      ))}
    </div>
  );
}

export function ItemTile({
  item,
  onRemove,
  onRetry,
}: {
  item: UploadTileItem;
  onRemove: () => void;
  onRetry: () => void;
}) {
  if (item.stage === 'error') {
    return (
      <div className="relative aspect-square rounded-lg border border-destructive/30 bg-destructive/5 flex flex-col items-center justify-center gap-1 p-1">
        <svg className="w-4 h-4 text-destructive flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {item.error && (
          <span className="text-[9px] text-destructive/80 text-center line-clamp-2 leading-tight px-0.5">
            {item.error}
          </span>
        )}
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
        ) : item.stage === 'queued' ? (
          <span className="text-[9px] font-medium text-muted-foreground bg-card/95 px-1.5 py-0.5 rounded border border-border">排队</span>
        ) : (
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        )}
      </div>
    </div>
  );
}
