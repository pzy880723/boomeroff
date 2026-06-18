import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCcw } from 'lucide-react';
import { isChunkLoadError, scheduleChunkReload } from '@/lib/chunkLoadRecovery';
import boomerScratch from '@/assets/boomer/boomer-scratch.png';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** 可选：标签，便于在日志里区分位置 */
  scope?: string;
}

interface State {
  error: Error | null;
  recovering: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, recovering: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, recovering: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    if (isChunkLoadError(error)) {
      scheduleChunkReload();
    }

    console.error(
      `[ErrorBoundary${this.props.scope ? `:${this.props.scope}` : ''}]`,
      error,
      '\ncomponentStack:',
      info?.componentStack || '(no stack)',
    );
  }

  handleReload = () => {
    try {
      // 清掉可能损坏的 session 缓存再刷新
      window.location.reload();
    } catch {
      /* noop */
    }
  };

  handleGoHome = () => {
    try {
      window.location.assign('/scan');
    } catch {
      /* noop */
    }
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      const isRecovering = this.state.recovering;

      // chunk 失败的自动恢复路径——只显示安静的 loading，避免红色"出错"惊吓用户
      if (isRecovering) {
        return (
          <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 bg-background">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">正在加载新版页面…</p>
          </div>
        );
      }

      return (
        <div className="min-h-[70vh] flex items-center justify-center p-6 bg-gradient-to-b from-amber-50/40 via-background to-background">
          <div className="max-w-sm w-full rounded-3xl border border-border/60 bg-card/90 backdrop-blur p-6 shadow-soft text-center space-y-5">
            <div className="relative mx-auto w-36 h-36 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-amber-100/60 blur-2xl" />
              <img
                src={boomerScratch}
                alt="BOOMER 挠头"
                className="relative w-32 h-32 object-contain animate-[float_3s_ease-in-out_infinite] drop-shadow-md"
              />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-display font-semibold">BOOMER 也懵了…</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                页面好像卡住了，要不咱们刷一下，或者回家重新出发？
              </p>
            </div>
            <details className="text-xs text-muted-foreground text-left bg-muted/40 rounded-xl px-3 py-2 max-h-32 overflow-auto">
              <summary className="cursor-pointer select-none">悄悄看看错误详情</summary>
              <pre className="whitespace-pre-wrap break-all mt-2 leading-relaxed">
                {this.state.error.message || String(this.state.error)}
              </pre>
            </details>
            <div className="flex gap-2">
              <Button onClick={this.handleReload} className="flex-1 gap-2 rounded-full">
                <RefreshCcw className="w-4 h-4" />
                刷新重试
              </Button>
              <Button onClick={this.handleGoHome} variant="outline" className="flex-1 rounded-full">
                返回首页
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              微信内打开请点右上角「···」选择「在浏览器中打开」
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
