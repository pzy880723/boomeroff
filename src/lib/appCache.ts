const CACHE_PREFIX = 'boomer-go-cache:v1';

interface CacheEntry<T> {
  savedAt: number;
  value: T;
}

function storageKey(scope: string, userId: string): string {
  return `${CACHE_PREFIX}:${scope}:${userId}`;
}

export function readUserCache<T>(scope: string, userId: string): T | null {
  try {
    const raw = localStorage.getItem(storageKey(scope, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    return parsed?.value ?? null;
  } catch {
    return null;
  }
}

export function writeUserCache<T>(scope: string, userId: string, value: T): void {
  try {
    const entry: CacheEntry<T> = { savedAt: Date.now(), value };
    localStorage.setItem(storageKey(scope, userId), JSON.stringify(entry));
  } catch {
    // Storage may be unavailable or full. Fresh network data still works.
  }
}

export function clearUserCache(scope: string, userId: string): void {
  try {
    localStorage.removeItem(storageKey(scope, userId));
  } catch {
    // Ignore storage failures.
  }
}

export function runAfterFirstPaint(task: () => void, timeout = 700): () => void {
  let idleId: number | null = null;
  const timerId = window.setTimeout(() => {
    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(task, { timeout: 1000 });
      return;
    }
    task();
  }, timeout);

  return () => {
    window.clearTimeout(timerId);
    if (idleId !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(idleId);
    }
  };
}
