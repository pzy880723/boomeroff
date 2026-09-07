// 纯逻辑：ERP 授权续租节流 / 前台定时器 / 迟到响应判定（无副作用，便于测试）
export const ERP_SCOPE_THROTTLE_MS = 30_000;
export const ERP_SCOPE_RENEW_INTERVAL_MS = 30_000;

export function shouldRunErpScopeSync(
  now: number,
  last: number,
  throttleMs = ERP_SCOPE_THROTTLE_MS,
): boolean {
  return now - last >= throttleMs;
}

/** 只有可信同步（已写镜像/已续租）才值得重新拉 bootstrap；pending/unlinked 不重拉。 */
export function shouldReloadBootstrapAfterSync(status: string | null | undefined): boolean {
  return status === 'synced' || status === 'ack_pending';
}

/** 迟到响应保护：发起时的账号与当前账号不一致就必须丢弃。 */
export function isStaleSyncResponse(
  requestUserId: string | null,
  activeUserId: string | null,
): boolean {
  return !requestUserId || requestUserId !== activeUserId;
}

/** 受 ERP 治理的账号，失效/撤销/同步失败时不得回退到缓存里的旧角色。 */
export function shouldTrustCachedRole(
  erpGoverned: boolean,
  scopeActive: boolean,
): boolean {
  return !erpGoverned || scopeActive;
}

export interface ErpRenewTimerOptions {
  intervalMs?: number;
  isVisible: () => boolean;
  isLoggedIn: () => boolean;
  run: () => void;
  setIntervalFn?: (cb: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

/**
 * 仅「前台 + 已登录」时每 intervalMs 触发一次续租；返回 dispose。
 * 真正的去重仍由 refreshErpScope 的 30 秒节流 + in-flight 复用兜底。
 */
export function startErpScopeRenewTimer(opts: ErpRenewTimerOptions): () => void {
  const {
    intervalMs = ERP_SCOPE_RENEW_INTERVAL_MS,
    isVisible,
    isLoggedIn,
    run,
    setIntervalFn = (cb, ms) => setInterval(cb, ms),
    clearIntervalFn = (h) => clearInterval(h as ReturnType<typeof setInterval>),
  } = opts;

  let disposed = false;
  const handle = setIntervalFn(() => {
    if (disposed) return;
    if (!isLoggedIn()) return;
    if (!isVisible()) return;
    run();
  }, intervalMs);

  return () => {
    if (disposed) return;
    disposed = true;
    clearIntervalFn(handle);
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

export interface ErpSyncOutcome {
  discard: boolean;
  governed: boolean;
  scopeActive: boolean;
  clearCachedRole: boolean;
  reloadBootstrap: boolean;
}

/** 同步结果 -> 本地动作决策（纯函数，便于测试迟到响应 / 撤销 / ack_pending 顺序）。 */
export function decideErpSyncOutcome(
  requestUserId: string | null,
  activeUserId: string | null,
  result: { data?: unknown; sync?: { status?: string } } | null,
): ErpSyncOutcome {
  if (!result || isStaleSyncResponse(requestUserId, activeUserId)) {
    return { discard: true, governed: false, scopeActive: true, clearCachedRole: false, reloadBootstrap: false };
  }
  const { governed, scopeActive } = readErpGovernance(result.data);
  const revoked = governed && !scopeActive;
  return {
    discard: false,
    governed,
    scopeActive,
    clearCachedRole: revoked,
    reloadBootstrap: shouldReloadBootstrapAfterSync(result.sync?.status) || revoked,
  };
}
