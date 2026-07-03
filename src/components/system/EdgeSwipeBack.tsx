import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * 全局“边缘右滑返回”手势。
 * - 从屏幕左边缘 24px 内按下,水平右滑 > 80px(且水平位移 > 垂直位移)触发 history.back()。
 * - 同时在 web 与 Capacitor 原生 webview 里都可用。
 * - 顶层路由('/', '/u', '/messages') 不触发返回。
 */
const EDGE_PX = 24;
const TRIGGER_PX = 80;
const MAX_INDICATOR = 120;

const ROOT_ROUTES = new Set(['/', '/u', '/messages', '/library', '/scan', '/community', '/me']);

export function EdgeSwipeBack() {
  const navigate = useNavigate();
  const location = useLocation();
  const [dx, setDx] = useState(0);
  const active = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startT = useRef(0);

  useEffect(() => {
    const canGoBack = () => !ROOT_ROUTES.has(location.pathname);

    const onStart = (e: TouchEvent) => {
      if (!canGoBack()) return;
      const t = e.touches[0];
      if (!t || t.clientX > EDGE_PX) return;
      // 忽略在可横向滑动容器里的手势(轮播/横向列表)
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-no-swipe-back]')) return;
      active.current = true;
      startX.current = t.clientX;
      startY.current = t.clientY;
      startT.current = performance.now();
    };
    const onMove = (e: TouchEvent) => {
      if (!active.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dxNow = t.clientX - startX.current;
      const dyNow = Math.abs(t.clientY - startY.current);
      if (dxNow < 0 || dyNow > Math.abs(dxNow)) { active.current = false; setDx(0); return; }
      setDx(Math.min(dxNow, MAX_INDICATOR));
    };
    const onEnd = () => {
      if (!active.current) { setDx(0); return; }
      const finalDx = dx;
      const dt = performance.now() - startT.current;
      active.current = false;
      setDx(0);
      if (finalDx > TRIGGER_PX || (finalDx > 40 && dt < 300)) {
        // 有历史就 back,否则 fallback 到首页
        if (window.history.length > 1) navigate(-1);
        else navigate('/');
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
  }, [location.pathname, navigate, dx]);

  if (dx <= 4) return null;
  const progress = Math.min(dx / TRIGGER_PX, 1);
  return (
    <div
      className="fixed top-1/2 -translate-y-1/2 z-[9999] pointer-events-none flex items-center justify-center rounded-full bg-black/55 backdrop-blur text-white"
      style={{
        left: 8,
        width: 40,
        height: 40,
        transform: `translate(${dx * 0.4}px, -50%) scale(${0.7 + progress * 0.4})`,
        opacity: 0.4 + progress * 0.6,
        transition: 'opacity 80ms linear',
      }}
      aria-hidden
    >
      <ChevronLeft className="w-5 h-5" />
    </div>
  );
}
