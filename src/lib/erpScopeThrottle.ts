// 纯逻辑：ERP 授权续租节流（无副作用，便于测试）
export const ERP_SCOPE_THROTTLE_MS = 30_000;

export function shouldRunErpScopeSync(
  now: number,
  last: number,
  throttleMs = ERP_SCOPE_THROTTLE_MS,
): boolean {
  return now - last >= throttleMs;
}
