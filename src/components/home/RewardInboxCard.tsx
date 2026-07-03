import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Loader2, ArrowRight, Gift, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SpiritMascot } from '@/components/spirit/SpiritMascot';
import { useTasks, type DailyTaskKey } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const TASK_ROUTE: Record<DailyTaskKey, string> = {
  daily_first_scan: '/scan',
  daily_3_scans: '/scan',
  daily_quiz: '/library',
  daily_post: '/community',
};

/**
 * 首页「奖励待领取」入口卡:
 * - 默认收起,仅显示 BOOMER + 一行文案 + 展开箭头。
 * - 展开后显示待领奖励 + 未完成任务清单;可直接领取或跳去完成。
 */
export function RewardInboxCard() {
  const tasks = useTasks();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);

  const totalCount = tasks.totalUnclaimedCount;
  const totalExp = tasks.totalUnclaimedExp;
  const claimableDaily = tasks.dailyTasks.filter(t => t.completed && !t.claimed);
  const todoDaily = tasks.dailyTasks.filter(t => !t.completed);
  const pending = tasks.pending;

  // 完全无任务(全部已领 + 无未完成) → 不显示
  if (totalCount === 0 && todoDaily.length === 0) return null;

  const headline = totalCount > 0
    ? <>你有 <span className="text-primary font-bold">{totalCount}</span> 项奖励待领取</>
    : <>你今天还有 <span className="text-primary font-bold">{todoDaily.length}</span> 项奖励可以领</>;

  const subline = totalCount > 0
    ? `共 +${totalExp} 经验 · 点右侧展开领取`
    : '点右边直接收，或先去完成剩下的';

  const handleClaimAll = async () => {
    if (totalCount === 0 || claimingAll) return;
    setClaimingAll(true);
    let total = await tasks.claimAllPending();
    for (const t of claimableDaily) {
      const r = await tasks.claimDaily(t.key);
      if (r.ok && r.amount) total += r.amount;
    }
    setClaimingAll(false);
    if (total > 0) toast.success(`一键领取 +${total} 经验 ✨`);
  };

  const claimOne = async (kind: 'event' | 'daily', id: string, amount: number) => {
    setBusyKey(id);
    const r = kind === 'event'
      ? await tasks.claimEvent(id)
      : await tasks.claimDaily(id as DailyTaskKey);
    setBusyKey(null);
    if (r.ok) toast.success(`+${amount} 经验已入袋`);
    else toast.error('领取失败');
  };

  return (
    <Card
      className={cn(
        'overflow-hidden border-border/60 transition-colors',
        totalCount > 0 && 'border-primary/30 bg-primary/[0.03]',
      )}
    >
      {/* 收起态头部 - 整行可点击展开 */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-muted/50 transition-colors"
      >
        <SpiritMascot size={40} flat />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-foreground leading-snug">
            {headline}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {subline}
          </div>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* 展开态 */}
      {expanded && (
        <div className="border-t border-border/60 px-3 pt-3 pb-3 space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          {totalCount > 0 && (
            <Button
              onClick={handleClaimAll}
              disabled={claimingAll}
              className="w-full h-9 text-sm font-semibold"
            >
              {claimingAll ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />领取中…</>
              ) : (
                <>一键领取 +{totalExp} 经验</>
              )}
            </Button>
          )}

          {pending.map(p => (
            <RewardRow
              key={p.id}
              tone="claim"
              icon={<Gift className="w-3.5 h-3.5 text-primary" />}
              title={p.title}
              hint={`奖励 +${p.amount}`}
              actionLabel={busyKey === p.id ? '…' : `领 +${p.amount}`}
              busy={busyKey === p.id}
              onAction={() => claimOne('event', p.id, p.amount)}
            />
          ))}
          {claimableDaily.map(t => (
            <RewardRow
              key={t.key}
              tone="claim"
              icon={<Sparkles className="w-3.5 h-3.5 text-primary" />}
              title={t.label}
              hint={`已完成 · +${t.amount}`}
              actionLabel={busyKey === t.key ? '…' : `领 +${t.amount}`}
              busy={busyKey === t.key}
              onAction={() => claimOne('daily', t.key, t.amount)}
            />
          ))}
          {todoDaily.map(t => (
            <RewardRow
              key={t.key}
              tone="todo"
              icon={<span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/40 shrink-0" />}
              title={t.label}
              hint={`进度 ${t.progress}/${t.target} · +${t.amount}`}
              actionLabel="去完成"
              actionIcon={<ArrowRight className="w-3 h-3" />}
              onAction={() => navigate(TASK_ROUTE[t.key])}
            />
          ))}

          {(() => {
            const done = tasks.dailyTasks.filter(t => t.claimed).length;
            const all = tasks.dailyTasks.length;
            if (done === 0) return null;
            return (
              <div className="flex items-center gap-1.5 pt-1 text-[10.5px] text-muted-foreground">
                <Check className="w-3 h-3" /> 今日已领 {done}/{all}
              </div>
            );
          })()}
        </div>
      )}
    </Card>
  );
}

function RewardRow({
  icon, title, hint, actionLabel, actionIcon, busy, onAction, tone,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  actionLabel: string;
  actionIcon?: React.ReactNode;
  busy?: boolean;
  onAction: () => void;
  tone: 'claim' | 'todo';
}) {
  return (
    <div className={cn(
      'flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-lg',
      tone === 'claim'
        ? 'bg-primary/[0.06] border border-primary/20'
        : 'bg-muted/40 border border-border/60',
    )}>
      <span className="shrink-0 flex items-center justify-center">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium text-foreground truncate">{title}</div>
        <div className="text-[10.5px] text-muted-foreground tabular-nums">{hint}</div>
      </div>
      <Button
        size="sm"
        variant={tone === 'claim' ? 'default' : 'outline'}
        disabled={busy}
        onClick={onAction}
        className="h-7 min-w-[64px] px-2.5 text-[11px] font-semibold whitespace-nowrap shrink-0 gap-1"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : (<>{actionLabel}{actionIcon}</>)}
      </Button>
    </div>
  );
}
