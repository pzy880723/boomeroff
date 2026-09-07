// Web 侧 ERP 授权范围续租：登录、冷启、回前台、前台 30 秒定时器时调用。
// 只做刷新，不做任何权限判断（授权边界仍在 RLS / RPC）。
import { invokeFn } from '@/lib/invokeFn';
import {
  ERP_SCOPE_RENEW_INTERVAL_MS,
  ERP_SCOPE_THROTTLE_MS,
  isStaleSyncResponse,
  shouldReloadBootstrapAfterSync,
  shouldRunErpScopeSync,
  shouldTrustCachedRole,
  startErpScopeRenewTimer,
} from '@/lib/erpScopeThrottle';

export {
  ERP_SCOPE_RENEW_INTERVAL_MS,
  ERP_SCOPE_THROTTLE_MS,
  isStaleSyncResponse,
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

/** 从 verifier 数据里读出「是否受 ERP 治理」「当前范围是否有效」。 */
export function readErpGovernance(data: unknown): { governed: boolean; scopeActive: boolean } {
  const d = (data ?? {}) as Record<string, unknown>;
  const scopeCtx = (d.scope_context ?? {}) as Record<string, unknown>;
  const governed = d.is_erp_user === true || d.erp_user_id != null;
  const scope = typeof scopeCtx.scope === 'string' ? scopeCtx.scope : 'unconfigured';
  return { governed, scopeActive: scope !== 'unconfigured' };
}

let lastRunAt = 0;
let inFlight: Promise<ErpScopeSyncResult | null> | null = null;

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
