import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const KEY_PREFIX = 'scroll:';
const getKey = (loc: { pathname: string; search: string }) =>
  `${KEY_PREFIX}${loc.pathname}${loc.search}`;

/**
 * 轻量 ScrollRestoration:
 * - PUSH / REPLACE 导航自动回到顶部。
 * - POP (浏览器返回) 恢复上次滚动位置。
 * - 每次离开路由前把 window.scrollY 写入 sessionStorage。
 */
export function ScrollRestoration() {
  const location = useLocation();
  const navType = useNavigationType();

  // 恢复
  useEffect(() => {
    if (navType === 'POP') {
      try {
        const v = sessionStorage.getItem(getKey(location));
        const y = v ? parseInt(v, 10) : 0;
        // 等下一帧,让页面渲染完再滚
        requestAnimationFrame(() => {
          window.scrollTo(0, Number.isFinite(y) ? y : 0);
        });
      } catch { /* ignore */ }
    } else {
      window.scrollTo(0, 0);
    }
  }, [location, navType]);

  // 记录
  useEffect(() => {
    const save = () => {
      try { sessionStorage.setItem(getKey(location), String(window.scrollY)); } catch { /* ignore */ }
    };
    window.addEventListener('pagehide', save);
    return () => {
      save();
      window.removeEventListener('pagehide', save);
    };
  }, [location]);

  return null;
}
