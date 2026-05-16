import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, RefreshCcw } from 'lucide-react';
import { isChunkLoadError, scheduleChunkReload } from '@/lib/chunkLoadRecovery';

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
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6 bg-background">
          <div className="max-w-sm w-full rounded-2xl border border-border/60 bg-card p-6 shadow-soft text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-display font-semibold">页面出错了</h2>
              <p className="text-sm text-muted-foreground">
                {isRecovering
                  ? '系统正在更新页面资源，马上为您自动刷新。'
                  : '当前环境可能不支持某些浏览器特性，请刷新或换用系统浏览器打开。'}
              </p>
            </div>
            <details className="text-xs text-muted-foreground text-left bg-muted/40 rounded-lg p-2 max-h-32 overflow-auto">
              <summary className="cursor-pointer">错误详情</summary>
              <pre className="whitespace-pre-wrap break-all mt-1">
                {this.state.error.message || String(this.state.error)}
              </pre>
            </details>
            <div className="flex gap-2">
              <Button onClick={this.handleReload} className="flex-1 gap-2">
                <RefreshCcw className={`w-4 h-4 ${isRecovering ? 'animate-spin' : ''}`} />
                {isRecovering ? '正在刷新' : '刷新重试'}
              </Button>
              <Button onClick={this.handleGoHome} variant="outline" className="flex-1">
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
