import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Gift, Sparkles, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
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

const DISMISS_KEY = 'spirit_reward_popover_dismissed_sig';

interface Props {
  tasks: ReturnType<typeof useTasks>;
  capsuleSide: 'left' | 'right';
  capsuleY: number;
  hidden?: boolean; // 抽屉打开时隐藏
  onOpenTask: (path: string) => void;
}

/** 主动弹出的可领奖励浮层，独立于抽屉存在 */
export function SpiritRewardPopover({ tasks, capsuleSide, capsuleY, hidden, onOpenTask }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [dismissedSig, setDismissedSig] = useState<string | null>(() => {
    try { return sessionStorage.getItem(DISMISS_KEY); } catch { return null; }
  });
  const [visible, setVisible] = useState(false);

  const claimableDaily = tasks.dailyTasks.filter(t => t.completed && !t.claimed);
  const pending = tasks.pending;
  const totalCount = tasks.totalUnclaimedCount;
  const totalExp = tasks.totalUnclaimedExp;

  // 当前可领项的签名：变化就重弹
  const sig = useMemo(() => {
    const ids = [...pending.map(p => `p:${p.id}`), ...claimableDaily.map(d => `d:${d.key}`)];
    return ids.sort().join('|');
  }, [pending, claimableDaily]);

  // 有新签名或从 0 变>0 时延迟弹出
  useEffect(() => {
    if (hidden) return;
    if (totalCount === 0) { setVisible(false); return; }
    if (sig === dismissedSig) { setVisible(false); return; }
    const t = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(t);
  }, [sig, dismissedSig, totalCount, hidden]);

  const handleClose = () => {
    setVisible(false);
    setExpanded(false);
    try { sessionStorage.setItem(DISMISS_KEY, sig); } catch {}
    setDismissedSig(sig);
  };

  const handleClaimAll = async () => {
    if (totalCount === 0 || claimingAll) return;
    setClaimingAll(true);
    let total = 0;
    total += await tasks.claimAllPending();
    for (const t of claimableDaily) {
      const r = await tasks.claimDaily(t.key);
      if (r.ok && r.amount) total += r.amount;
    }
    setClaimingAll(false);
    if (total > 0) toast.success(`一键领取 +${total} 经验 ✨`);
    setCelebrate(true);
    setTimeout(() => { setVisible(false); setCelebrate(false); }, 1400);
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

  if (hidden || !visible || totalCount === 0) return null;

  const positionStyle: React.CSSProperties = {
    position: 'fixed',
    top: Math.max(80, capsuleY - 16),
    ...(capsuleSide === 'right'
      ? { right: 12 }
      : { left: 12 }),
    zIndex: 55,
    maxWidth: 300,
    width: 'calc(100vw - 24px)',
  };

  const arrowSideClass = capsuleSide === 'right' ? 'right-6' : 'left-6';

  return createPortal(
    <div
      style={positionStyle}
      className={cn(
        'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-300',
        celebrate && 'animate-pulse',
      )}
      role="dialog"
      aria-label="可领取的经验奖励"
    >
      <div className="relative rounded-2xl bg-[hsl(222_20%_12%)] border border-[hsl(var(--accent)/0.35)] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] overflow-hidden">
        {/* 指向胶囊的小三角 */}
        <span
          className={cn(
            'absolute -bottom-1.5 w-3 h-3 rotate-45 bg-[hsl(222_20%_12%)] border-r border-b border-[hsl(var(--accent)/0.35)]',
            arrowSideClass,
          )}
        />

        {/* 头部 */}
        <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
          <SpiritMascot size={40} flat />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white leading-snug">
              你有 <span className="text-[hsl(var(--accent))]">{totalCount}</span> 项奖励可领
              {totalExp > 0 && (
                <span className="text-white/60 font-normal ml-1">（+{totalExp} 经验）</span>
              )}
            </div>
            <div className="text-[11px] text-white/55 mt-0.5">点一键领取，或展开查看每项</div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="关闭"
            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/70"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 主操作 */}
        <div className="px-3 pb-3 flex items-center gap-2">
          <Button
            onClick={handleClaimAll}
            disabled={claimingAll}
            className="flex-1 h-9 text-[13px] font-semibold bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/90 text-[hsl(var(--accent-foreground))] shadow-sm"
          >
            {claimingAll ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />领取中…</>
            ) : (
              <>一键领取 +{totalExp}</>
            )}
          </Button>
          {(pending.length + claimableDaily.length) > 1 && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="shrink-0 h-9 px-2 rounded-md flex items-center gap-0.5 bg-white/5 hover:bg-white/10 text-white/75 text-[11px]"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* 展开列表 */}
        {expanded && (
          <div className="px-2 pb-2 space-y-1.5 max-h-64 overflow-y-auto border-t border-white/5 pt-2 animate-in fade-in-0 duration-200">
            {pending.map(p => (
              <RewardRow
                key={p.id}
                icon={<Gift className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />}
                title={p.title}
                hint={`奖励 +${p.amount}`}
                busy={busyKey === p.id}
                actionLabel={`领 +${p.amount}`}
                onAction={() => claimOne('event', p.id, p.amount)}
              />
            ))}
            {claimableDaily.map(t => (
              <RewardRow
                key={t.key}
                icon={<Sparkles className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />}
                title={t.label}
                hint={`进度 ${t.progress}/${t.target} · +${t.amount}`}
                busy={busyKey === t.key}
                actionLabel={`领 +${t.amount}`}
                onAction={() => claimOne('daily', t.key, t.amount)}
              />
            ))}
            {tasks.dailyTasks.filter(t => !t.completed).map(t => (
              <RewardRow
                key={t.key}
                muted
                icon={<span className="w-3.5 h-3.5 rounded-full border border-white/25 shrink-0" />}
                title={t.label}
                hint={`进度 ${t.progress}/${t.target} · +${t.amount}`}
                actionLabel="去完成"
                actionIcon={<ArrowRight className="w-3 h-3" />}
                onAction={() => { handleClose(); onOpenTask(TASK_ROUTE[t.key]); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function RewardRow({
  icon, title, hint, busy, actionLabel, actionIcon, onAction, muted,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  busy?: boolean;
  actionLabel: string;
  actionIcon?: React.ReactNode;
  onAction: () => void;
  muted?: boolean;
}) {
  return (
    <div className={cn(
      'flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-lg',
      muted ? 'bg-white/[0.03] border border-white/10'
            : 'bg-[hsl(var(--accent)/0.1)] border border-[hsl(var(--accent)/0.25)]',
    )}>
      <span className="shrink-0 flex items-center justify-center">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium text-white/92 truncate">{title}</div>
        <div className="text-[10.5px] text-white/50 tabular-nums">{hint}</div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onAction}
        className={cn(
          'shrink-0 min-w-[60px] h-7 px-2.5 rounded-md text-[11px] font-semibold whitespace-nowrap inline-flex items-center justify-center gap-1 transition-colors',
          muted
            ? 'bg-white/8 border border-white/15 text-white/85 hover:bg-white/15'
            : 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:bg-[hsl(var(--accent))]/90',
          busy && 'opacity-70 cursor-wait',
        )}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : (
          <>{actionLabel}{actionIcon}</>
        )}
      </button>
    </div>
  );
}
