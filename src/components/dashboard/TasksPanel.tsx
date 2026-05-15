import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SectionCard } from './primitives/SectionCard';
import { Check, Loader2, ArrowRight, Sparkles, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { useTasks, DailyTaskKey } from '@/hooks/useTasks';

interface Props {
  tasks: ReturnType<typeof useTasks>;
  onClaimed?: () => void;
  onNavigate?: (path: string) => void;
}

const TASK_ROUTE: Record<DailyTaskKey, string> = {
  daily_first_scan: '/scan',
  daily_3_scans: '/scan',
  daily_quiz: '/library',
  daily_post: '/community',
};

export function TasksPanel({ tasks, onClaimed, onNavigate }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);

  const dailyDone = tasks.dailyTasks.filter(t => t.claimed).length;
  const dailyTotal = tasks.dailyTasks.length;
  const pendingCount = tasks.pending.length;
  const pendingExp = tasks.pending.reduce((s, p) => s + p.amount, 0);

  const handleClaimDaily = async (key: DailyTaskKey, amount: number) => {
    setBusyKey(key);
    const r = await tasks.claimDaily(key);
    setBusyKey(null);
    if (r.ok) { toast.success(`+${amount} 经验已入袋`); onClaimed?.(); }
    else toast.error('还没完成或已领取');
  };

  const handleClaimEvent = async (id: string, amount: number) => {
    setBusyKey(id);
    const r = await tasks.claimEvent(id);
    setBusyKey(null);
    if (r.ok) { toast.success(`+${amount} 经验已入袋`); onClaimed?.(); }
    else toast.error('领取失败');
  };

  const handleClaimAll = async () => {
    if (!pendingCount) return;
    setClaimingAll(true);
    const total = await tasks.claimAllPending();
    setClaimingAll(false);
    if (total > 0) { toast.success(`一键领取 +${total} 经验`); onClaimed?.(); }
  };

  return (
    <div className="space-y-3">
      {/* 今日任务进度 */}
      <SectionCard className="p-4" delay={0}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] tracking-[0.18em] text-white/50">今日任务</span>
            <span className="text-[11px] text-white/70 tabular-nums">{dailyDone}/{dailyTotal}</span>
          </div>
        </div>

        {/* 分段进度条 */}
        <div className="grid gap-1 mb-4" style={{ gridTemplateColumns: `repeat(${dailyTotal}, 1fr)` }}>
          {tasks.dailyTasks.map(t => (
            <div
              key={t.key}
              className={cn(
                'h-1.5 rounded-full transition-colors',
                t.claimed ? 'bg-primary'
                  : t.completed ? 'bg-amber-400/80'
                  : 'bg-white/8'
              )}
            />
          ))}
        </div>

        <div className="space-y-2">
          {tasks.dailyTasks.map(t => {
            const canClaim = t.completed && !t.claimed;
            const status: 'todo' | 'claim' | 'done' = t.claimed ? 'done' : canClaim ? 'claim' : 'todo';
            const stripe = status === 'done' ? 'bg-primary/70'
              : status === 'claim' ? 'bg-amber-400'
              : 'bg-white/15';
            return (
              <div
                key={t.key}
                className="relative flex items-center gap-3 pl-3 pr-2 py-2.5 rounded-lg bg-white/[0.03] border border-white/5 overflow-hidden"
              >
                <div className={cn('absolute left-0 top-2 bottom-2 w-1 rounded-r', stripe)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {status === 'done' && <Check className="w-3 h-3 text-primary shrink-0" />}
                    <span className={cn(
                      'text-sm font-medium truncate',
                      status === 'done' ? 'text-white/45 line-through' : 'text-white/90'
                    )}>
                      {t.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/45 tabular-nums mt-0.5">
                    进度 {t.progress}/{t.target} · 奖励 +{t.amount}
                  </div>
                </div>
                {status === 'done' ? (
                  <span className="text-[11px] text-white/40 shrink-0 px-2">已领取</span>
                ) : status === 'claim' ? (
                  <Button
                    size="sm"
                    disabled={busyKey === t.key}
                    onClick={() => handleClaimDaily(t.key, t.amount)}
                    className="h-8 px-3 text-xs shrink-0 bg-primary hover:bg-primary/90 relative overflow-hidden animate-shine-once"
                  >
                    {busyKey === t.key
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : `领取 +${t.amount} 经验`}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onNavigate?.(TASK_ROUTE[t.key])}
                    className="h-8 px-3 text-xs shrink-0 gap-1 bg-white/5 border-white/10 text-white/85 hover:bg-white/10 hover:text-white"
                  >
                    去完成 <ArrowRight className="w-3 h-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* 待领取奖励 */}
      {pendingCount > 0 && (
        <SectionCard className="p-4" delay={80}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Gift className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-[11px] tracking-[0.18em] text-white/50">待领取奖励</span>
              <span className="text-[11px] text-amber-300/90 tabular-nums">{pendingCount} 项</span>
            </div>
            {pendingCount > 1 && (
              <Button
                size="sm"
                disabled={claimingAll}
                onClick={handleClaimAll}
                className="h-7 px-3 text-xs bg-primary hover:bg-primary/90 relative overflow-hidden animate-shine-once"
              >
                {claimingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : `一键领取 +${pendingExp}`}
              </Button>
            )}
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {tasks.pending.map(p => (
              <div
                key={p.id}
                className="relative flex items-center gap-3 pl-3 pr-2 py-2 rounded-lg bg-amber-500/[0.06] border border-amber-400/20"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="text-sm text-white/90 flex-1 min-w-0 truncate">{p.title}</span>
                <Button
                  size="sm"
                  disabled={busyKey === p.id}
                  onClick={() => handleClaimEvent(p.id, p.amount)}
                  className="h-7 px-3 text-xs shrink-0 bg-primary hover:bg-primary/90"
                >
                  {busyKey === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : `领取 +${p.amount}`}
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {tasks.totalUnclaimedCount === 0 && pendingCount === 0 && (
        <p className="text-center text-xs text-white/40 py-2">今天的奖励都已领取完毕</p>
      )}
    </div>
  );
}
