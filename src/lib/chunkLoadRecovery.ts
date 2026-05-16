const CHUNK_RELOAD_PREFIX = 'boomer-off:chunk-reload';

const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'error loading dynamically imported module',
  'Loading chunk',
  'ChunkLoadError',
];

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
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