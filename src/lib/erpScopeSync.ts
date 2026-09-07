// Web 侧 ERP 授权范围续租：登录、冷启、回前台时调用，30 秒节流。
// 只做刷新，不做任何权限判断（授权边界仍在 RLS / RPC）。
import { invokeFn } from '@/lib/invokeFn';

export const ERP_SCOPE_THROTTLE_MS = 30_000;

export type ErpSyncStatus = 'synced' | 'pending' | 'unlinked';

export interface ErpScopeSyncResult {
  ok: boolean;
  data: unknown;
  sync: { status: ErpSyncStatus; code: string };
}

let lastRunAt = 0;
let inFlight: Promise<ErpScopeSyncResult | null> | null = null;

export function shouldRunErpScopeSync(now: number, last: number, throttleMs = ERP_SCOPE_THROTTLE_MS): boolean {
  return now - last >= throttleMs;
}

export function resetErpScopeSyncThrottle(): void {
  lastRunAt = 0;
  inFlight = null;
}

export async function refreshErpScope(force = false): Promise<ErpScopeSyncResult | null> {
  if (inFlight) return inFlight;
  const now = Date.now();
  if (!force && !shouldRunErpScopeSync(now, lastRunAt)) return null;
  lastRunAt = now;

  inFlight = invokeFn<ErpScopeSyncResult>('erp-scope-sync', { body: {} })
    .then(({ data, error }) => {
      if (error || !data) return null;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
