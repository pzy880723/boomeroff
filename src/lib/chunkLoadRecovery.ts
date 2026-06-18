const CHUNK_RELOAD_PREFIX = 'boomer-off:chunk-reload';

const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'error loading dynamically imported module',
  'Loading chunk',
  'ChunkLoadError',
  // 旧 chunk 引用了已被新构建移除/重命名的模块 → lazy() 拿到 undefined
  "Cannot read properties of undefined (reading 'default')",
  'Cannot read property \'default\' of undefined',
  'undefined is not an object (evaluating',
];

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const stack = error instanceof Error ? (error.stack ?? '') : '';
  if (CHUNK_ERROR_PATTERNS.some((p) => message.includes(p))) return true;
  // 兜底:错误栈在 Lazy 内 + 是 default 解析失败,基本可断定为旧 chunk
  if (stack.includes('Lazy') && message.includes('default')) return true;
  return false;
}

function getCurrentBuildKey() {
  const mainScript = Array.from(document.scripts).find((script) =>
    script.src.includes('/assets/index-'),
  );
  return mainScript?.src || `${window.location.origin}${window.location.pathname}`;
}

export function scheduleChunkReload(): boolean {
  if (typeof window === 'undefined') return false;

  const key = `${CHUNK_RELOAD_PREFIX}:${getCurrentBuildKey()}`;
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return false;
  }

  window.setTimeout(() => window.location.reload(), 200);
  return true;
}

export function installChunkLoadRecovery() {
  if (typeof window === 'undefined') return;

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    scheduleChunkReload();
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (!isChunkLoadError(event.reason)) return;
    if (scheduleChunkReload()) event.preventDefault();
  });
}