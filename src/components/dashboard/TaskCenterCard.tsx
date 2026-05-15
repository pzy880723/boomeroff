import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Gift, Check, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { useTasks } from '@/hooks/useTasks';

interface Props {
  tasks: ReturnType<typeof useTasks>;
  onClaimed?: () => void;
}

export function TaskCenterCard({ tasks, onClaimed }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);

  const pendingCount = tasks.pending.length;
  const pendingExp = tasks.pending.reduce((s, p) => s + p.amount, 0);
  const dailyDone = tasks.dailyTasks.filter(t => t.claimed).length;

  const handleClaimEvent = async (id: string, amount: number) => {
    setBusyKey(id);
    const r = await tasks.claimEvent(id);
    setBusyKey(null);
    if (r.ok) { toast.success(`+${amount} 经验已入袋 ✨`); onClaimed?.(); }
    else toast.error('领取失败');
  };

  const handleClaimDaily = async (key: any, amount: number) => {
    setBusyKey(key);
    const r = await tasks.claimDaily(key);
    setBusyKey(null);
    if (r.ok) { toast.success(`+${amount} 经验已入袋 ✨`); onClaimed?.(); }
    else toast.error('还没完成或已领取');
  };

  const handleClaimAll = async () => {
    if (!pendingCount) return;
    setClaimingAll(true);
    const total = await tasks.claimAllPending();
    setClaimingAll(false);
    if (total > 0) { toast.success(`一键领取 +${total} 经验 🎁`); onClaimed?.(); }
  };

  const hasAnything = tasks.totalUnclaimedCount > 0;

  return (
    <Card className={cn(
      'p-4 border-border/50 shadow-sm rounded-2xl transition-all',
      hasAnything && 'border-amber-300/60 bg-gradient-to-br from-amber-50/40 to-transparent dark:from-amber-950/20'
    )}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
            hasAnything ? 'bg-amber-500/15' : 'bg-muted'
          )}>
            <Gift className={cn('w-4 h-4', hasAnything ? 'text-amber-600' : 'text-muted-foreground')} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">任务中心</div>
            <div className="text-[11px] text-muted-foreground">
              {hasAnything ? `${tasks.totalUnclaimedCount} 项可领 · 共 +${tasks.totalUnclaimedExp} 经验` : '今天的奖励都领完啦 🎉'}
            </div>
          </div>
        </div>
        {pendingCount > 1 && (
          <Button
            size="sm"
            variant="default"
            disabled={claimingAll}
            onClick={handleClaimAll}
            className="h-7 px-2.5 text-[11px] bg-amber-500 hover:bg-amber-600 text-white"
          >
            {claimingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : `一键领 +${pendingExp}`}
          </Button>
        )}
      </div>

      {/* 每日任务 */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">今日任务</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{dailyDone}/{tasks.dailyTasks.length}</span>
        </div>
        {tasks.dailyTasks.map(t => {
          const pct = Math.round((t.progress / t.target) * 100);
          const canClaim = t.completed && !t.claimed;
          return (
            <div key={t.key} className={cn(
              'flex items-center gap-2 p-2 rounded-lg border',
              t.claimed ? 'border-transparent bg-muted/30 opacity-60'
                : canClaim ? 'border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20'
                : 'border-border/40 bg-card'
            )}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {t.claimed && <Check className="w-3 h-3 text-primary shrink-0" />}
                  <span className={cn('text-xs font-medium truncate', t.claimed && 'line-through')}>{t.label}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{t.progress}/{t.target}</span>
                </div>
                {!t.claimed && (
                  <Progress value={pct} className="h-1 mt-1" />
                )}
              </div>
              {t.claimed ? (
                <span className="text-[10px] text-muted-foreground shrink-0">已领 +{t.amount}</span>
              ) : (
                <Button
                  size="sm"
                  variant={canClaim ? 'default' : 'outline'}
                  disabled={!canClaim || busyKey === t.key}
                  onClick={() => handleClaimDaily(t.key, t.amount)}
                  className={cn(
                    'h-7 px-2 text-[11px] shrink-0',
                    canClaim && 'bg-amber-500 hover:bg-amber-600 text-white border-0'
                  )}
                >
                  {busyKey === t.key ? <Loader2 className="w-3 h-3 animate-spin" /> : canClaim ? `领 +${t.amount}` : `+${t.amount}`}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* 事件奖励 */}
      {pendingCount > 0 && (
        <div>
          <div className="text-[11px] font-semibold tracking-wider text-muted-foreground mb-1.5">
            待领取奖励 · {pendingCount}
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {tasks.pending.map(p => (
              <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-xs flex-1 min-w-0 truncate">{p.title}</span>
                <Button
                  size="sm"
                  disabled={busyKey === p.id}
                  onClick={() => handleClaimEvent(p.id, p.amount)}
                  className="h-7 px-2 text-[11px] bg-amber-500 hover:bg-amber-600 text-white border-0 shrink-0"
                >
                  {busyKey === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : `领 +${p.amount}`}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
