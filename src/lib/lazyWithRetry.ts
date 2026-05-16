import { lazy, ComponentType } from 'react';
import { isChunkLoadError } from './chunkLoadRecovery';

/**
 * lazy() 包装：首次加载 chunk 失败时自动重试，避免偶发网络抖动导致
 * Suspense 抛错进入 ErrorBoundary。
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
  delay = 250,
) {
  return lazy(async () => {
    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        return await factory();
      } catch (e) {
        lastErr = e;
        if (!isChunkLoadError(e)) throw e;
        await new Promise((r) => setTimeout(r, delay * (i + 1)));
      }
    }
    throw lastErr;
  });
}
