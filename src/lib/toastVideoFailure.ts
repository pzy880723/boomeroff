// 提交渲染时如果立刻报错(在 catch 里),不要直接 toast.error(raw),
// 用这个 helper 弹一张"人话卡":标题 + 一句话 + 一键修复按钮。
import { toast } from 'sonner';
import { classifyVideoFailure, type VideoFix, type VideoFailure } from '@/lib/videoFailure';

interface Opts {
  /** 用户点了某个修复按钮要做的事。返回 Promise 时按钮显示 busy。 */
  onApplyFix?: (fix: VideoFix, failure: VideoFailure) => void | Promise<void>;
  /** 用户点了"去活体认证"时调,通常拉起 IdentityVerifyDialog */
  onVerifyIdentity?: () => void;
  /** 用户点了"去充值"时调 */
  onTopup?: () => void;
  duration?: number;
}

export function toastVideoFailure(rawError: unknown, opts: Opts = {}) {
  const raw = typeof rawError === 'string'
    ? rawError
    : (rawError as any)?.message || (rawError as any)?.error?.message || String(rawError || '');
  const failure = classifyVideoFailure(raw);

  // 最多 2 个主操作按钮,避免 toast 太挤。先挑 verify_identity / topup 这种"跳走"型,再挑第一个修复。
  const priorityKinds = ['soft_pass_face', 'verify_identity', 'topup', 'rewrite_safe_prompt', 'switch_model', 'lower_resolution', 'retry', 'retry_later'];
  const sorted = [...failure.fixes].sort(
    (a, b) => priorityKinds.indexOf(a.kind) - priorityKinds.indexOf(b.kind)
  );
  const primary = sorted[0];

  const handle = (fix: VideoFix) => {
    if (fix.kind === 'verify_identity') {
      opts.onVerifyIdentity?.();
      return;
    }
    if (fix.kind === 'topup') {
      opts.onTopup?.();
      window.open('https://console.volcengine.com/finance/account', '_blank');
      return;
    }
    opts.onApplyFix?.(fix, failure);
  };

  toast.error(failure.title, {
    description: failure.detail,
    duration: opts.duration ?? 12_000,
    action: primary
      ? { label: primary.label, onClick: () => handle(primary) }
      : undefined,
  });
}
