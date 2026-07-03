import { useEffect, useState } from 'react';
import { Check, Loader2, ArrowRight, Gift, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SpiritMascot } from './SpiritMascot';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { useTasks, DailyTaskKey } from '@/hooks/useTasks';

const TASK_ROUTE: Record<DailyTaskKey, string> = {
  daily_first_scan: '/scan',
  daily_3_scans: '/scan',
  daily_quiz: '/library',
  daily_post: '/community',
};

interface Props {
  tasks: ReturnType<typeof useTasks>;
  onNavigate: (path: string) => void;
}

/**
 * BOOMER 抽屉内嵌任务卡:主动告诉店员今天还能领什么,直接在气泡里领取。
 * 替代旧仪表盘的 TasksPanel 入口。
 */
export function SpiritTaskCard({ tasks, onNavigate }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const totalCount = tasks.totalUnclaimedCount;
  const totalExp = tasks.totalUnclaimedExp;
  const claimableDaily = tasks.dailyTasks.filter(t => t.completed && !t.claimed);
  const todoDaily = tasks.dailyTasks.filter(t => !t.completed);
  const pending = tasks.pending;

  // 全部领完 → 庆祝 2 秒后折叠
  useEffect(() => {
    if (totalCount === 0 && celebrate) {
      const t = setTimeout(() => setDismissed(true), 2200);
      return () => clearTimeout(t);
    }
  }, [totalCount, celebrate]);

  if (dismissed) return null;
  // 一开始就没任务也没未完成 → 不显示
  if (totalCount === 0 && todoDaily.length === 0 && !celebrate) return null;

  const handleClaimDaily = async (key: DailyTaskKey, amount: number) => {
    setBusyKey(key);
    const r = await tasks.claimDaily(key);
    setBusyKey(null);
    if (r.ok) {
      toast.success(`+${amount} 经验已入袋`);
      setCelebrate(true);
    } else {
      toast.error('还没完成或已领取');
    }
  };

  const handleClaimEvent = async (id: string, amount: number) => {
    setBusyKey(id);
    const r = await tasks.claimEvent(id);
    setBusyKey(null);
    if (r.ok) {
      toast.success(`+${amount} 经验已入袋`);
      setCelebrate(true);
    } else {
      toast.error('领取失败');
    }
  };

  const handleClaimAll = async () => {
    if (totalCount === 0) return;
    setClaimingAll(true);
    let total = 0;
    // 事件类
    total += await tasks.claimAllPending();
    // 已完成的每日任务
    for (const t of claimableDaily) {
      const r = await tasks.claimDaily(t.key);
      if (r.ok && r.amount) total += r.amount;
    }
    setClaimingAll(false);
    if (total > 0) toast.success(`一键领取 +${total} 经验`);
    setCelebrate(true);
  };

  // 全部领完 → 庆祝态
  if (totalCount === 0 && celebrate) {
    return (
      <div className="mx-2 mb-3 rounded-2xl bg-[hsl(var(--accent)/0.1)] border border-[hsl(var(--accent)/0.28)] p-3 flex items-center gap-2.5 animate-in fade-in-0 slide-in-from-top-1">
        <SpiritMascot size={36} flat />
        <div className="flex-1 text-[13px] text-[hsl(var(--primary-foreground)/0.95)]">
          今天的角标都被你收干净啦，好厉害～ ✨
        </div>
      </div>
    );
  }

  return (
    <div className="mx-2 mb-3 rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden animate-in fade-in-0 slide-in-from-top-1">
      {/* 顶部:BOOMER 主动打招呼 */}
      <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
        <SpiritMascot size={36} flat />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[hsl(var(--primary-foreground))]">
            你今天还有 <span className="text-[hsl(var(--accent))]">{totalCount}</span> 项奖励可以领
            {totalExp > 0 && <span className="text-[hsl(var(--primary-foreground)/0.6)] font-normal">（共 +{totalExp} 经验）</span>}
          </div>
          <div className="text-[11px] text-[hsl(var(--primary-foreground)/0.55)] mt-0.5">
            点右边直接收，或先去完成剩下的
          </div>
        </div>
        {totalCount > 1 && (
          <Button
            size="sm"
            disabled={claimingAll}
            onClick={handleClaimAll}
            className="h-7 min-w-[64px] px-2.5 text-[11px] font-semibold whitespace-nowrap shrink-0 bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:bg-[hsl(var(--accent))]/90"
          >
            {claimingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : `一键领 +${totalExp}`}
          </Button>
        )}
      </div>

      <div className="px-2 pb-2 space-y-1.5">
        {/* 事件奖励 */}
        {pending.map(p => (
          <Row
            key={p.id}
            icon={<Gift className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />}
            title={p.title}
            hint={`奖励 +${p.amount}`}
            action={
              <Button
                size="sm"
                disabled={busyKey === p.id}
                onClick={() => handleClaimEvent(p.id, p.amount)}
                className="h-7 min-w-[64px] px-2.5 text-[11px] font-semibold whitespace-nowrap shrink-0 bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:bg-[hsl(var(--accent))]/90"
              >
                {busyKey === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : `领 +${p.amount}`}
              </Button>
            }
            tone="claim"
          />
        ))}

        {/* 每日 - 可领 */}
        {claimableDaily.map(t => (
          <Row
            key={t.key}
            icon={<Sparkles className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />}
            title={t.label}
            hint={`进度 ${t.progress}/${t.target} · +${t.amount}`}
            action={
              <Button
                size="sm"
                disabled={busyKey === t.key}
                onClick={() => handleClaimDaily(t.key, t.amount)}
                className="h-7 min-w-[64px] px-2.5 text-[11px] font-semibold whitespace-nowrap shrink-0 bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:bg-[hsl(var(--accent))]/90"
              >
                {busyKey === t.key ? <Loader2 className="w-3 h-3 animate-spin" /> : `领 +${t.amount}`}
              </Button>
            }
            tone="claim"
          />
        ))}

        {/* 每日 - 未完成 */}
        {todoDaily.map(t => (
          <Row
            key={t.key}
            icon={
              <span className="w-3.5 h-3.5 rounded-full border border-[hsl(var(--primary-foreground)/0.3)] shrink-0" />
            }
            title={t.label}
            hint={`进度 ${t.progress}/${t.target} · +${t.amount}`}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => onNavigate(TASK_ROUTE[t.key])}
                className="h-7 px-2.5 text-[11px] shrink-0 gap-1 bg-white/5 border-white/15 text-[hsl(var(--primary-foreground)/0.9)] hover:bg-white/10"
              >
                去完成 <ArrowRight className="w-3 h-3" />
              </Button>
            }
            tone="todo"
          />
        ))}

        {/* 已领取的每日任务(可选) - 折叠为一行小提示 */}
        {(() => {
          const done = tasks.dailyTasks.filter(t => t.claimed).length;
          const total = tasks.dailyTasks.length;
          if (done === 0) return null;
          return (
            <div className="flex items-center gap-1.5 px-2 pt-1 text-[10.5px] text-[hsl(var(--primary-foreground)/0.4)]">
              <Check className="w-3 h-3" /> 今日已领 {done}/{total}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function Row({
  icon, title, hint, action, tone,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  action: React.ReactNode;
  tone: 'claim' | 'todo';
}) {
  return (
    <div className={cn(
      'relative flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-lg',
      tone === 'claim'
        ? 'bg-[hsl(var(--accent)/0.1)] border border-[hsl(var(--accent)/0.22)]'
        : 'bg-white/[0.03] border border-white/10',
    )}>
      <span className="shrink-0 flex items-center justify-center">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium text-[hsl(var(--primary-foreground)/0.92)] truncate">{title}</div>
        <div className="text-[10.5px] text-[hsl(var(--primary-foreground)/0.5)] tabular-nums">{hint}</div>
      </div>
      {action}
    </div>
  );
}
