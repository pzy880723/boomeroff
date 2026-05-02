// 在微信 X5 / 隐私模式 / 第三方 Cookie 受限环境下，
// 访问 window.localStorage 会同步抛 SecurityError，导致 Supabase 客户端初始化即崩溃 → 白屏。
// 在 App 加载前探测一次，如果不可用就替换成内存版 shim，保证后续代码全部 no-op 不抛错。
//
// 必须在 import supabase client 之前执行。

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear() { store.clear(); },
    getItem(key: string) { return store.has(key) ? store.get(key)! : null; },
    setItem(key: string, value: string) { store.set(key, String(value)); },
    removeItem(key: string) { store.delete(key); },
    key(index: number) { return Array.from(store.keys())[index] ?? null; },
  } as Storage;
}

function probe(name: 'localStorage' | 'sessionStorage'): boolean {
  try {
    const s = (window as any)[name] as Storage | undefined;
    if (!s) return false;
    const k = '__lv_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function installStorageShim() {
  if (typeof window === 'undefined') return;

  if (!probe('localStorage')) {
    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: makeMemoryStorage(),
      });
      // eslint-disable-next-line no-console
      console.warn('[StorageShim] localStorage unavailable, fell back to in-memory store');
    } catch (e) {
      console.error('[StorageShim] failed to install localStorage shim:', e);
    }
  }

  if (!probe('sessionStorage')) {
    try {
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: makeMemoryStorage(),
      });
    } catch {
      /* ignore */
    }
  }
}
