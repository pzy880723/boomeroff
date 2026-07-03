import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';

/**
 * 全局“下拉刷新”。
 * - 仅当 window 滚动到顶部时激活。
 * - 触发时先派发可取消的 `app:refresh` 事件,任何页面可 `e.preventDefault()` 后自行刷新。
 * - 若无人接管,做一次 `location.reload()`(soft 兜底)。
 * - 页面切换时自动重置。
 */
const THRESHOLD = 70;
const MAX_PULL = 110;

export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const active = useRef(false);
  const location = useLocation();

  useEffect(() => { setPull(0); setRefreshing(false); active.current = false; startY.current = null; }, [location.pathname]);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (refreshing) return;
      if ((window.scrollY || document.documentElement.scrollTop) > 0) return;
      const t = e.touches[0];
      if (!t) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-no-pull-refresh]')) return;
      startY.current = t.clientY;
      active.current = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!active.current || startY.current == null) return;
      const t = e.touches[0]; if (!t) return;
      const dy = t.clientY - startY.current;
      if (dy <= 0) { setPull(0); return; }
      // 阻力曲线
      const p = Math.min(MAX_PULL, dy * 0.55);
      setPull(p);
    };
    const trigger = async () => {
      setRefreshing(true);
      setPull(56);
      const ev = new CustomEvent('app:refresh', { cancelable: true });
      const handled = !window.dispatchEvent(ev); // preventDefault 返回 false
      // 给自定义处理者一点时间;否则兜底 reload
      window.setTimeout(() => {
        if (handled) {
          setRefreshing(false);
          setPull(0);
        } else {
          window.location.reload();
        }
      }, handled ? 900 : 250);
    };
    const onEnd = () => {
      if (!active.current) return;
      const p = pull;
      active.current = false;
      startY.current = null;
      if (p >= THRESHOLD && !refreshing) {
        void trigger();
      } else {
        setPull(0);
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [pull, refreshing]);

  if (pull <= 0 && !refreshing) return null;
  const progress = Math.min(pull / THRESHOLD, 1);
  return (
    <div
      className="fixed left-0 right-0 top-0 z-[9998] pointer-events-none flex items-center justify-center safe-top"
      style={{ height: pull, transition: refreshing ? 'height 160ms ease' : undefined }}
      aria-hidden
    >
      <div
        className="flex items-center justify-center rounded-full bg-black/60 backdrop-blur text-white shadow-lg"
        style={{ width: 36, height: 36, opacity: 0.3 + progress * 0.7 }}
      >
        <RefreshCw
          className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
          style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }}
        />
      </div>
    </div>
  );
}
