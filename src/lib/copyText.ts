/**
 * 必须在用户点击的同一个调用栈内执行。先用同步 fallback，
 * 避免 iOS WebView 在等待视频下载后丢失剪贴板授权。
 */
export function copyTextFromUserAction(text: string): Promise<boolean> {
  if (!text) return Promise.resolve(false);

  let fallbackCopied = false;
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    try { fallbackCopied = document.execCommand('copy'); } catch { /* noop */ }
    textarea.remove();
  }

  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (!clipboard?.writeText) return Promise.resolve(fallbackCopied);
  return clipboard.writeText(text).then(() => true).catch(() => fallbackCopied);
}
