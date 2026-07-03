import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { useTasks } from '@/hooks/useTasks';
import { SpiritMascot, type SpiritState } from '../spirit/SpiritMascot';
import { SpiritDrawer } from '../spirit/SpiritDrawer';

import { useSpiritChat } from '@/hooks/useSpiritChat';
import { cn } from '@/lib/utils';

const SpiritGreetingDialog = lazy(() =>
  import('../spirit/SpiritGreetingDialog').then(m => ({ default: m.SpiritGreetingDialog })),
);

const POS_KEY = 'dashboard_capsule_pos_v2';
const GREETED_KEY = 'spirit_greeted_session';
const BTN = 104;
const EDGE = 8;
const BOTTOM_TAB = 104;
type Side = 'left' | 'right';
interface Pos { side: Side; y: number }

function clampY(y: number): number {
  if (typeof window === 'undefined') return y;
  const vh = window.innerHeight;
  const minY = EDGE + 56;
  const maxY = Math.max(minY, vh - BTN - BOTTOM_TAB - EDGE);
  return Math.min(Math.max(y, minY), maxY);
}

function defaultPos(): Pos {
  if (typeof window === 'undefined') return { side: 'right', y: 200 };
  return { side: 'right', y: clampY(window.innerHeight - BTN - BOTTOM_TAB - EDGE - 40) };
}

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if ((p?.side === 'left' || p?.side === 'right') && typeof p?.y === 'number') {
        return { side: p.side, y: clampY(p.y) };
      }
    }
  } catch {}
  return defaultPos();
}

function getCapsuleX(side: Side): number {
  if (typeof window === 'undefined') return 0;
  return side === 'left' ? EDGE : window.innerWidth - BTN - EDGE;
}

export function FloatingDashboard() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [pos, setPos] = useState<Pos>(() => (typeof window !== 'undefined' ? loadPos() : { side: 'right', y: 0 }));
  const [dragXY, setDragXY] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; oy: number; moved: boolean } | null>(null);
  const [hovering, setHovering] = useState(false);
  const [greetOpen, setGreetOpen] = useState(false);

  const notif = useNotifications();
  const tasks = useTasks();
  const spiritChat = useSpiritChat();


  useEffect(() => {
    const onResize = () => setPos(p => ({ ...p, y: clampY(p.y) }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const closeGreeting = () => {
    setGreetOpen(false);
  };

  const openDrawer = () => {
    setMounted(true);
    setClosing(false);
    requestAnimationFrame(() => setOpen(true));
  };

  const closeDrawer = () => {
    setClosing(true);
    setOpen(false);
  };

  const onAnimEnd = () => {
    if (closing) {
      setMounted(false);
      setClosing(false);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const x = getCapsuleX(pos.side);
    dragRef.current = { startX: e.clientX, startY: e.clientY, oy: pos.y, moved: false };
    setDragXY({ x, y: pos.y });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) dragRef.current.moved = true;
    setDragXY({
      x: Math.max(EDGE, Math.min(window.innerWidth - BTN - EDGE, e.clientX - BTN / 2)),
      y: clampY(dragRef.current.oy + dy),
    });
  };
  const onPointerUp = () => {
    const moved = dragRef.current?.moved;
    dragRef.current = null;
    if (!moved) {
      setDragXY(null);
      openDrawer();
      return;
    }
    const cx = (dragXY?.x ?? getCapsuleX(pos.side)) + BTN / 2;
    const side: Side = cx < window.innerWidth / 2 ? 'left' : 'right';
    const y = clampY(dragXY?.y ?? pos.y);
    const next = { side, y };
    setPos(next);
    setDragXY(null);
    try { localStorage.setItem(POS_KEY, JSON.stringify(next)); } catch {}
  };

  if (!user) return null;

  const dragging = !!dragRef.current || !!dragXY;
  const capsuleX = dragging && dragXY ? dragXY.x : getCapsuleX(pos.side);
  const capsuleY = dragging && dragXY ? dragXY.y : pos.y;
  const claimableCount = tasks.totalUnclaimedCount;
  const hasClaimable = claimableCount > 0;
  const hasOtherUnread = notif.unreadCount > 0;
  const hasAlert = hasClaimable || hasOtherUnread;


  return (
    <>
      <div
        className={cn(
          'fixed z-50 select-none touch-none transition-all',
          dragging ? 'duration-0' : 'duration-300 ease-out',
          (open || closing) && 'opacity-0 pointer-events-none',
        )}
        style={{ left: capsuleX, top: capsuleY, width: BTN, height: BTN }}
      >
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          aria-label="召唤 BOOMER"
          className={cn(
            'relative flex items-center justify-center rounded-full active:scale-95 transition-transform w-full h-full',
            dragging && 'opacity-95 scale-105',
          )}
        >
          <SpiritMascot
            size={BTN}
            state={
              (dragging
                ? 'dragging'
                : hovering
                ? 'hover'
                : hasAlert
                ? 'alert'
                : 'idle') as SpiritState
            }
          />

          {hasClaimable ? (
            <span className="absolute top-1 right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-accent border-2 border-background text-[10px] font-bold text-accent-foreground flex items-center justify-center shadow-sm animate-badge-pop">
              {claimableCount > 9 ? '9+' : claimableCount}
            </span>
          ) : hasOtherUnread ? (
            <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-destructive ring-2 ring-background" />
          ) : null}
        </button>

      </div>

      {mounted && createPortal(
        <SpiritDrawer
          open={open}
          closing={closing}
          originX={getCapsuleX(pos.side) + BTN / 2}
          originY={pos.y + BTN / 2}
          onAnimEnd={onAnimEnd}
          onClose={closeDrawer}
          chat={spiritChat}
          tasks={tasks}
        />,
        document.body,
      )}

      <Suspense fallback={null}>
        {greetOpen && <SpiritGreetingDialog open={greetOpen} onClose={closeGreeting} />}
      </Suspense>
    </>
  );
}
