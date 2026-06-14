import { Component, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  reloading: boolean;
}

const RELOAD_KEY = 'boomer-off:public-error-reload';

function getBuildKey() {
  if (typeof document === 'undefined') return 'noscript';
  const mainScript = Array.from(document.scripts).find((s) =>
    s.src.includes('/assets/index-'),
  );
  return mainScript?.src || window.location.pathname;
}

/**
 * 公开页面专用 ErrorBoundary —— 顾客视角下永远不显示"出错卡片"。
 * - 第一次异常:静默自动 reload,只显示同款暖棕底 + loading。
 * - 同一份 build 已 reload 过仍异常:显示一行极简文案,不带任何按钮。
 */
export class PublicErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): State {
    if (typeof window === 'undefined') return { error, reloading: false };
    const key = `${RELOAD_KEY}:${getBuildKey()}`;
    let reloaded = false;
    try {
      reloaded = !!window.sessionStorage.getItem(key);
    } catch {
      /* noop */
    }
    return { error, reloading: !reloaded };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('[PublicErrorBoundary]', error);
    if (typeof window === 'undefined') return;
    const key = `${RELOAD_KEY}:${getBuildKey()}`;
    try {
      if (!window.sessionStorage.getItem(key)) {
        window.sessionStorage.setItem(key, String(Date.now()));
        window.setTimeout(() => window.location.reload(), 150);
      }
    } catch {
      /* noop */
    }
  }

  render() {
    if (this.state.error) {
      const bg = {
        background:
          'linear-gradient(135deg, #1f1409 0%, #3b2410 38%, #6b3a18 70%, #b48142 100%)',
      } as const;

      if (this.state.reloading) {
        return (
          <div
            className="min-h-screen flex flex-col items-center justify-center gap-3"
            style={bg}
          >
            <Loader2 className="w-6 h-6 animate-spin text-amber-200" />
            <p className="text-[13px] text-[#ffe7bd]/80">正在打开活动…</p>
          </div>
        );
      }

      return (
        <div
          className="min-h-screen flex items-center justify-center p-6"
          style={bg}
        >
          <p className="text-[13px] text-[#ffe7bd]/80 text-center">
            网络繁忙,请稍后再试
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
