import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface State { error: Error | null }

/**
 * 局部错误边界:素材库 / 视频详情里的小错不应该把整个 App 卷到根 ErrorBoundary。
 * 这里只显示一个内联提示 + 重试按钮,并把堆栈输出到 console 方便定位。
 */
export class LibraryErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error('[MarketingLibrary] 渲染异常被局部边界接住:', error, info);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto my-8 max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
        <div className="text-sm text-muted-foreground">
          素材库加载时出了点小状况,已经帮你拦住了,刷新一下就好。
        </div>
        <details className="mt-3 rounded-lg bg-muted px-3 py-2 text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer">查看错误信息</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all">{String(this.state.error?.message || this.state.error)}</pre>
        </details>
        <Button onClick={this.reset} className="mt-4 gap-2" size="sm">
          <RefreshCw className="w-4 h-4" />重试
        </Button>
      </div>
    );
  }
}
