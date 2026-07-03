import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SpiritChatPanel } from './SpiritChatPanel';
import { SpiritTaskCard } from './SpiritTaskCard';
import { cn } from '@/lib/utils';
import type { useSpiritChat } from '@/hooks/useSpiritChat';
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

/**
 * BOOMER 抽屉 — 只保留对话面板。
 * 仪表盘已迁至首页 /home,这里不再有 Tab 切换。
 */
export function SpiritDrawer({ open, closing, originX, originY, onAnimEnd, onClose, chat }: Props) {
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
      {/* 顶部品牌栏 */}
      <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2 pl-11">
          <span className="text-white font-bold tracking-tight">BOOMER</span>
          <span className="text-white/50 text-[11px]">店内小百科</span>
        </div>
      </div>

      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute left-3 z-20 w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/85 backdrop-blur-sm"
        style={{ top: 'calc(env(safe-area-inset-top) + 10px)' }}
      >
        <X className="w-4 h-4" />
      </button>

      {/* 对话面板 */}
      <div className="flex-1 min-h-0">
        <SpiritChatPanel chat={chat} />
      </div>
    </div>
  );
}
