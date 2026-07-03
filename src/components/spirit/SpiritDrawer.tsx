import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SpiritChatPanel } from './SpiritChatPanel';
import { SpiritTaskCard } from './SpiritTaskCard';
import { cn } from '@/lib/utils';
import type { useSpiritChat, SpiritRewardItem } from '@/hooks/useSpiritChat';
import type { useTasks } from '@/hooks/useTasks';

interface Props {
  open: boolean;
  closing: boolean;
  originX: number;
  originY: number;
  onAnimEnd: () => void;
  onClose: () => void;
  chat?: ReturnType<typeof useSpiritChat>;
  tasks?: ReturnType<typeof useTasks>;
}

const ANNOUNCED_KEY = 'spirit_announced_rewards';

function loadAnnounced(): Set<string> {
  try {
    const raw = sessionStorage.getItem(ANNOUNCED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}
function saveAnnounced(set: Set<string>) {
  try { sessionStorage.setItem(ANNOUNCED_KEY, JSON.stringify([...set])); } catch {}
}

export function SpiritDrawer({ open, closing, originX, originY, onAnimEnd, onClose, chat, tasks }: Props) {
  const navigate = useNavigate();
  const announcedRef = useRef<Set<string>>(loadAnnounced());
  const wasOpenRef = useRef(false);

  // 抽屉打开时,若有未播报的可领项,让 BOOMER 主动发一条奖励消息
  useEffect(() => {
    if (!open || !chat || !tasks) return;
    if (wasOpenRef.current) return; // 只在这次"打开"时触发一次
    wasOpenRef.current = true;

    const newItems: SpiritRewardItem[] = [];
    for (const p of tasks.pending) {
      const sig = `p:${p.id}`;
      if (!announcedRef.current.has(sig)) {
        newItems.push({ kind: 'event', id: p.id, title: p.title, amount: p.amount });
        announcedRef.current.add(sig);
      }
    }
    for (const t of tasks.dailyTasks) {
      if (!t.completed || t.claimed) continue;
      const sig = `d:${t.key}`;
      if (!announcedRef.current.has(sig)) {
        newItems.push({ kind: 'daily', id: t.key, title: t.label, amount: t.amount });
        announcedRef.current.add(sig);
      }
    }
    if (newItems.length === 0) return;
    saveAnnounced(announcedRef.current);

    const totalExp = newItems.reduce((s, i) => s + i.amount, 0);
    const content = newItems.length === 1
      ? `🎉 你刚完成了「${newItems[0].title}」,+${newItems[0].amount} 经验已经准备好了,点下面直接收吧~`
      : `🎉 你连着完成了 ${newItems.length} 项任务,共 +${totalExp} 经验待领,一键收下吧~`;

    chat.appendLocal({
      role: 'assistant',
      content,
      meta: { reward: { items: newItems, claimed: false } },
    });
  }, [open, chat, tasks]);

  useEffect(() => {
    if (!open && !closing) wasOpenRef.current = false;
  }, [open, closing]);

  return (
    <div
      onAnimationEnd={onAnimEnd}
      className={cn(
        'dashboard-deep-surface fixed inset-0 z-[60] flex flex-col will-change-transform overflow-hidden',
        open ? 'animate-dashboard-zoom-in' : 'animate-dashboard-zoom-out',
      )}
      style={{
        transformOrigin: `${originX}px ${originY}px`,
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2 pl-11">
          <span className="text-white font-bold tracking-tight">BOOMER</span>
          <span className="text-white/50 text-[11px]">店内小百科</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute left-3 z-20 w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/85 backdrop-blur-sm"
        style={{ top: 'calc(env(safe-area-inset-top) + 10px)' }}
      >
        <X className="w-4 h-4" />
      </button>


      <div className="flex-1 min-h-0">
        <SpiritChatPanel chat={chat} tasks={tasks} />
      </div>
    </div>
  );
}
