// 视频渲染失败时的"人话卡片":显示中文标题 + 解释 + 一键修复按钮。
// 父组件通过 onApplyFix(fix) 接收用户选择的修复动作。
import { AlertTriangle, Wand2, RefreshCw, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { classifyVideoFailure, type VideoFix, type VideoFailure } from '@/lib/videoFailure';

interface Props {
  error: string | null | undefined;
  /** 父组件接收某个修复并执行(可能是改 state + 重新提交) */
  onApplyFix?: (fix: VideoFix, failure: VideoFailure) => void | Promise<void>;
  /** 是否允许重渲(在素材库详情里通常 false,只能删除) */
  allowRetry?: boolean;
  /** 紧凑模式(给小卡片用) */
  compact?: boolean;
  /** 正在重新提交中 */
  busy?: boolean;
}

export function VideoFailureCard({ error, onApplyFix, allowRetry = true, compact, busy }: Props) {
  const failure = classifyVideoFailure(error);
  const [showRaw, setShowRaw] = useState(false);

  const visibleFixes = allowRetry ? failure.fixes : failure.fixes.filter((f) => f.kind === 'delete');

  return (
    <div className={`rounded-lg border border-destructive/40 bg-destructive/5 ${compact ? 'p-2.5' : 'p-3'} space-y-2.5`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-destructive leading-snug">{failure.title}</div>
          <p className="text-[11px] text-foreground/80 leading-relaxed mt-1 break-words">{failure.detail}</p>
        </div>
      </div>

      {visibleFixes.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1">
            <Wand2 className="w-3 h-3" />建议这样改
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleFixes.map((fix) => (
              <Button
                key={fix.id}
                size="sm"
                variant={fix.kind === 'delete' ? 'outline' : 'default'}
                className={`h-7 text-[11px] px-2.5 ${fix.kind === 'delete' ? 'text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive' : ''}`}
                disabled={busy}
                onClick={() => onApplyFix?.(fix, failure)}
              >
                {busy && fix.reRender ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}
                {fix.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {failure.raw && (
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${showRaw ? 'rotate-180' : ''}`} />
          查看技术细节
        </button>
      )}
      {showRaw && (
        <pre className="text-[10px] font-mono leading-snug text-muted-foreground bg-background/60 rounded px-2 py-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-words">
          {failure.raw}
        </pre>
      )}
    </div>
  );
}
