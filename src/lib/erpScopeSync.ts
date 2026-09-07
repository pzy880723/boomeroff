// Web 侧 ERP 授权范围续租：登录、冷启、回前台、前台 30 秒定时器时调用。
// 校验续租结果并驱动 UI fail-closed；真正授权边界仍在 RLS / RPC。
import { invokeFn } from '@/lib/invokeFn';
import {
  decideErpSyncOutcome,
  ERP_SCOPE_RENEW_INTERVAL_MS,
  ERP_SCOPE_THROTTLE_MS,
  isStaleSyncResponse,
  readErpGovernance,
  shouldReloadBootstrapAfterSync,
  shouldRunErpScopeSync,
  shouldTrustCachedRole,
  startErpScopeRenewTimer,
} from '@/lib/erpScopeThrottle';

export {
  decideErpSyncOutcome,
  ERP_SCOPE_RENEW_INTERVAL_MS,
  ERP_SCOPE_THROTTLE_MS,
  isStaleSyncResponse,
  readErpGovernance,
  shouldReloadBootstrapAfterSync,
  shouldRunErpScopeSync,
  shouldTrustCachedRole,
  startErpScopeRenewTimer,
};

export type ErpSyncStatus = 'synced' | 'ack_pending' | 'pending' | 'unlinked';

export interface ErpScopeSyncResult {
  ok: boolean;
  data: unknown;
  sync: {
    status: ErpSyncStatus;
    code: string;
    scope_version?: number | null;
    lease_renewed?: boolean;
    ack?: { ok: boolean; code: string };
  };
}

let lastRunAt = 0;
let inFlight: Promise<ErpScopeSyncResult | null> | null = null;
let activeUserId: string | null = null;
let generation = 0;

export function resetErpScopeSyncThrottle(): void {
  lastRunAt = 0;
  inFlight = null;
  activeUserId = null;
  generation += 1;
}

export function refreshErpScope(force = false, userId: string | null = null): Promise<ErpScopeSyncResult | null | undefined> {
  if (activeUserId !== userId) {
    resetErpScopeSyncThrottle();
    activeUserId = userId;
  }
  if (inFlight) return inFlight;
  const now = Date.now();
  // Skipped work must not look like a failed request and revoke a healthy lease.
  if (!force && !shouldRunErpScopeSync(now, lastRunAt)) return Promise.resolve(undefined);
  lastRunAt = now;
  const requestGeneration = generation;
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, 20_000);
  });

  const operation = invokeFn<ErpScopeSyncResult>('erp-scope-sync', { body: {}, signal: controller.signal })
    .then(({ data, error }) => {
      if (requestGeneration !== generation || error || !data) return null;
      return data;
    });
  const promise = Promise.race([operation, timeout])
    .catch(() => null)
    .finally(() => {
      clearTimeout(timeoutId);
      if (inFlight === promise) inFlight = null;
    });
  inFlight = promise;
  return promise;
}
