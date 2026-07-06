// 每个镜头一张卡:首帧/视频预览 + 状态 + 一键重试
import { Loader2, RefreshCw, Play, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DirectorShot } from '@/api/videoGeneration';

export function ShotGrid({
  shots, onRetry, retrying,
}: {
  shots: DirectorShot[];
  onRetry?: (shotIndex: number) => void | Promise<void>;
  retrying?: number | null;
}) {
  if (!shots.length) return null;
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground">分镜生成 · {shots.length} 个镜头</div>
      <div className="grid grid-cols-2 gap-2">
        {shots.map((s) => {
          const busy = retrying === s.shot_index;
          return (
            <div key={s.id} className="rounded-lg border bg-card overflow-hidden">
              <div className="aspect-[9/16] bg-muted relative">
                {s.video_url ? (
                  <video src={s.video_url} className="w-full h-full object-cover" controls playsInline preload="metadata" />
                ) : s.first_frame_url ? (
                  <img src={s.first_frame_url} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    {s.status === 'running' || s.status === 'submitting' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : s.status === 'failed' ? (
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                    ) : (
                      <Play className="w-5 h-5 opacity-40" />
                    )}
                  </div>
                )}
                <div className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded bg-black/60 text-white">
                  镜头 {s.shot_index + 1} · {Number(s.duration).toFixed(0)}s
                </div>
                {s.status === 'succeeded' && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-success text-white flex items-center justify-center">
                    <Check className="w-3 h-3" />
                  </div>
                )}
              </div>
              <div className="p-1.5 space-y-1">
                {s.subtitle && (
                  <div className="text-[10px] leading-tight text-foreground/80 line-clamp-2">
                    {s.subtitle}
                  </div>
                )}
                {s.dialogue && (
                  <div className="text-[10px] leading-tight text-muted-foreground line-clamp-2">
                    "{s.dialogue}"
                  </div>
                )}
                {s.status === 'failed' && (
                  <>
                    <div className="text-[10px] text-destructive line-clamp-2">
                      {s.error_message || '拍摄失败'}
                    </div>
                    {onRetry && (
                      <Button
                        variant="outline" size="sm"
                        className="w-full h-6 text-[10px]"
                        onClick={() => onRetry(s.shot_index)}
                        disabled={busy}
                      >
                        {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                        重拍这镜
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
