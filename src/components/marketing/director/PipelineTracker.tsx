// 7 步流水线进度条
import { Check, Loader2, Circle, X } from 'lucide-react';
import type { DirectorJobStatus } from '@/api/videoGeneration';

interface Step {
  key: string;
  label: string;
}
const STEPS: Step[] = [
  { key: 'understand', label: '理解需求' },
  { key: 'script',     label: '生成脚本' },
  { key: 'storyboard', label: '拆分镜' },
  { key: 'character',  label: '创建角色' },
  { key: 'shooting',   label: '生成镜头' },
  { key: 'composing',  label: '合成字幕与配音' },
  { key: 'saving',     label: '保存成片' },
];

type StepStatus = 'pending' | 'running' | 'done' | 'failed';

function computeStepStatuses(
  jobStatus: DirectorJobStatus,
  progress?: { done: number; total: number; failed: number } | null,
): StepStatus[] {
  // create-job 一进来就把 step1-3 落库了
  const s: StepStatus[] = ['done', 'done', 'done', 'pending', 'pending', 'pending', 'pending'];
  if (jobStatus === 'failed') {
    // 找出正在跑的那步标红
    const idx = jobStatus === 'failed' ? Math.max(3, (progress?.done ?? 0) > 0 ? 4 : 3) : 3;
    for (let i = idx; i < s.length; i++) s[i] = i === idx ? 'failed' : 'pending';
    return s;
  }
  switch (jobStatus) {
    case 'queued':
      s[3] = 'running';
      break;
    case 'character':
      s[3] = 'running';
      break;
    case 'shooting':
      s[3] = 'done';
      s[4] = 'running';
      break;
    case 'generating_voice':
      s[3] = 'done'; s[4] = 'done';
      s[5] = 'running';
      break;
    case 'ready_to_stitch':
      s[3] = 'done'; s[4] = 'done'; s[5] = 'done';
      s[6] = 'running';
      break;
    case 'composing':
      s[3] = 'done'; s[4] = 'done'; s[5] = 'done';
      s[6] = 'running';
      break;
    case 'done':
      for (let i = 3; i < s.length; i++) s[i] = 'done';
      break;
  }
  return s;
}

export function PipelineTracker({
  status, progress,
}: {
  status: DirectorJobStatus;
  progress?: { done: number; total: number; failed: number } | null;
}) {
  const stepStatuses = computeStepStatuses(status, progress);
  return (
    <div className="rounded-xl border bg-card p-3 space-y-1.5">
      <div className="text-[11px] text-muted-foreground mb-1">拍片进度</div>
      {STEPS.map((step, i) => {
        const st = stepStatuses[i];
        const isShooting = step.key === 'shooting' && st === 'running' && progress && progress.total > 0;
        return (
          <div key={step.key} className="flex items-center gap-2 text-[12px]">
            <span className="w-4 h-4 flex items-center justify-center shrink-0">
              {st === 'done' && <Check className="w-3.5 h-3.5 text-success" />}
              {st === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />}
              {st === 'failed' && <X className="w-3.5 h-3.5 text-destructive" />}
              {st === 'pending' && <Circle className="w-3 h-3 text-muted-foreground/40" />}
            </span>
            <span className={
              st === 'done' ? 'text-foreground/70' :
              st === 'running' ? 'text-foreground font-medium' :
              st === 'failed' ? 'text-destructive font-medium' :
              'text-muted-foreground/70'
            }>
              {step.label}
              {isShooting && (
                <span className="ml-1 text-muted-foreground tabular-nums">
                  {progress!.done}/{progress!.total}
                  {progress!.failed > 0 && <span className="text-destructive"> · {progress!.failed} 失败</span>}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
