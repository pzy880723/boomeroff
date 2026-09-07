// 前台 30 秒续租定时器 + 同步->bootstrap 顺序 + 迟到响应保护
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideErpSyncOutcome,
  ERP_SCOPE_RENEW_INTERVAL_MS,
  isStaleSyncResponse,
  readErpGovernance,
  shouldReloadBootstrapAfterSync,
  shouldRunErpScopeSync,
  shouldTrustCachedRole,
  startErpScopeRenewTimer,
} from '../src/lib/erpScopeThrottle';

// ---- 假定时器 ----
function fakeClock() {
  let now = 0;
  const jobs: Array<{ cb: () => void; ms: number; next: number; id: number }> = [];
  let seq = 0;
  return {
    setIntervalFn(cb: () => void, ms: number) {
      const id = ++seq;
      jobs.push({ cb, ms, next: now + ms, id });
      return id;
    },
    clearIntervalFn(handle: unknown) {
      const i = jobs.findIndex((j) => j.id === handle);
      if (i >= 0) jobs.splice(i, 1);
    },
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = jobs.filter((j) => j.next <= target).sort((a, b) => a.next - b.next)[0];
        if (!due) break;
        now = due.next;
        due.next += due.ms;
        due.cb();
      }
      now = target;
    },
    get pending() {
      return jobs.length;
    },
    now: () => now,
  };
}

test('前台+已登录：每 30 秒触发一次续租', () => {
  const clock = fakeClock();
  let runs = 0;
  const dispose = startErpScopeRenewTimer({
    intervalMs: ERP_SCOPE_RENEW_INTERVAL_MS,
    isVisible: () => true,
    isLoggedIn: () => true,
    run: () => { runs += 1; },
    setIntervalFn: clock.setIntervalFn,
    clearIntervalFn: clock.clearIntervalFn,
  });
  clock.advance(29_000);
  assert.equal(runs, 0, '不足 30 秒不触发');
  clock.advance(1_000);
  assert.equal(runs, 1);
  clock.advance(90_000);
  assert.equal(runs, 4, '一直前台会持续续租，不会因为无 focus 事件而过期');
  dispose();
  clock.advance(120_000);
  assert.equal(runs, 4, 'dispose 后不再触发');
  assert.equal(clock.pending, 0, '定时器已清除');
});

test('后台不触发，回到前台后恢复；登出后不触发', () => {
  const clock = fakeClock();
  let visible = false;
  let loggedIn = true;
  let runs = 0;
  const dispose = startErpScopeRenewTimer({
    isVisible: () => visible,
    isLoggedIn: () => loggedIn,
    run: () => { runs += 1; },
    setIntervalFn: clock.setIntervalFn,
    clearIntervalFn: clock.clearIntervalFn,
  });
  clock.advance(120_000);
  assert.equal(runs, 0, '后台不续租');
  visible = true;
  clock.advance(30_000);
  assert.equal(runs, 1);
  loggedIn = false;
  clock.advance(120_000);
  assert.equal(runs, 1, '登出后不再续租');
  dispose();
});

test('dispose 后即使定时器回调被强行调用也不执行', () => {
  const clock = fakeClock();
  let runs = 0;
  let captured: (() => void) | null = null;
  const dispose = startErpScopeRenewTimer({
    isVisible: () => true,
    isLoggedIn: () => true,
    run: () => { runs += 1; },
    setIntervalFn: (cb, ms) => { captured = cb; return clock.setIntervalFn(cb, ms); },
    clearIntervalFn: clock.clearIntervalFn,
  });
  dispose();
  captured?.();
  assert.equal(runs, 0);
});

test('30 秒节流：定时器 + focus 同时触发只会跑一次网络请求', () => {
  let last = 0;
  const calls: number[] = [];
  const attempt = (now: number) => {
    if (!shouldRunErpScopeSync(now, last)) return false;
    last = now;
    calls.push(now);
    return true;
  };
  assert.equal(attempt(30_000), true);
  assert.equal(attempt(30_100), false, '同一窗口内 focus 被去重');
  assert.equal(attempt(59_000), false);
  assert.equal(attempt(60_000), true);
  assert.deepEqual(calls, [30_000, 60_000]);
});

// ---- 同步 -> bootstrap 顺序 ----
const activeScope = {
  is_erp_user: true,
  erp_user_id: 'e-1',
  scope_context: { scope: 'hq' },
};
const revokedScope = {
  is_erp_user: true,
  erp_user_id: null,
  scope_context: { scope: 'unconfigured', reason: 'mapping_revoked' },
};

test('synced 与 ack_pending 都要重拉 bootstrap；pending/unlinked 不重拉', () => {
  assert.equal(shouldReloadBootstrapAfterSync('synced'), true);
  assert.equal(shouldReloadBootstrapAfterSync('ack_pending'), true);
  assert.equal(shouldReloadBootstrapAfterSync('pending'), false);
  assert.equal(shouldReloadBootstrapAfterSync('unlinked'), false);
  assert.equal(shouldReloadBootstrapAfterSync(undefined), false);
});

test('可信同步后按新授权重拉 bootstrap（顺序：sync -> bootstrap）', async () => {
  const order: string[] = [];
  const run = async (userId: string) => {
    order.push('sync:start');
    const result = { data: activeScope, sync: { status: 'synced' } };
    order.push('sync:done');
    const outcome = decideErpSyncOutcome(userId, userId, result);
    if (outcome.reloadBootstrap) order.push('bootstrap:reload');
    return outcome;
  };
  const outcome = await run('u1');
  assert.deepEqual(order, ['sync:start', 'sync:done', 'bootstrap:reload']);
  assert.equal(outcome.governed, true);
  assert.equal(outcome.scopeActive, true);
  assert.equal(outcome.clearCachedRole, false);
});

test('ack_pending：新权限已生效，仍要重拉 bootstrap', () => {
  const outcome = decideErpSyncOutcome('u1', 'u1', {
    data: activeScope,
    sync: { status: 'ack_pending' },
  });
  assert.equal(outcome.discard, false);
  assert.equal(outcome.reloadBootstrap, true);
});

test('迟到响应：账号已切换 / 已登出，绝不套用到新账号', () => {
  const late = { data: activeScope, sync: { status: 'synced' } };
  assert.equal(decideErpSyncOutcome('u1', 'u2', late).discard, true);
  assert.equal(decideErpSyncOutcome('u1', null, late).discard, true);
  assert.equal(decideErpSyncOutcome('u1', 'u1', late).discard, false);
  assert.equal(isStaleSyncResponse(null, 'u1'), true);
});

test('网络失败（result 为空）：不改治理标记、不重拉、不续租', () => {
  const outcome = decideErpSyncOutcome('u1', 'u1', null);
  assert.deepEqual(outcome, {
    discard: true, governed: false, scopeActive: true,
    clearCachedRole: false, reloadBootstrap: false,
  });
});

test('受治理账号被撤销：清缓存旧角色并重拉，绝不沿用旧 admin', () => {
  const outcome = decideErpSyncOutcome('u1', 'u1', {
    data: revokedScope,
    sync: { status: 'pending', code: 'erp_unreachable' },
  });
  assert.equal(outcome.governed, true);
  assert.equal(outcome.scopeActive, false);
  assert.equal(outcome.clearCachedRole, true);
  assert.equal(outcome.reloadBootstrap, true);
  assert.equal(shouldTrustCachedRole(outcome.governed, outcome.scopeActive), false);
});

test('未被 ERP 治理的旧账号（11 名未绑定）：不清角色、不扩权、维持原有过渡权限', () => {
  const legacy = {
    is_erp_user: false,
    erp_user_id: null,
    scope_context: { scope: 'unconfigured', reason: 'no_erp_mapping' },
  };
  const outcome = decideErpSyncOutcome('u1', 'u1', { data: legacy, sync: { status: 'unlinked', code: 'no_erp_mapping' } });
  assert.equal(outcome.governed, false);
  assert.equal(outcome.clearCachedRole, false);
  assert.equal(outcome.reloadBootstrap, false, 'unlinked 不重拉，也不改动旧账号权限');
  assert.equal(shouldTrustCachedRole(outcome.governed, outcome.scopeActive), true);
});

test('readErpGovernance 识别治理来源', () => {
  assert.deepEqual(readErpGovernance({ is_erp_user: false, erp_user_id: 'e-1', scope_context: { scope: 'shop' } }), { governed: true, scopeActive: true });
  assert.deepEqual(readErpGovernance({ is_erp_user: true, erp_user_id: null, scope_context: {} }), { governed: true, scopeActive: false });
  assert.deepEqual(readErpGovernance(null), { governed: false, scopeActive: false });
});
