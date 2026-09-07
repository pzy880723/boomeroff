import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { refreshErpScope, resetErpScopeSyncThrottle } from '../src/lib/erpScopeSync';

const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/invokeFn', () => ({ invokeFn: api.invoke }));
function pending() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => { resetErpScopeSyncThrottle(); api.invoke.mockReset().mockResolvedValue({ data: null, error: null }); });
afterEach(() => { vi.useRealTimers(); });

it('an old finally after reset cannot clear the new in-flight request', async () => {
  const old = pending();
  const newer = pending();
  api.invoke.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
  const first = refreshErpScope(true);
  resetErpScopeSyncThrottle();
  const second = refreshErpScope(true);
  old.resolve({ data: null, error: null });
  await first;
  const third = refreshErpScope(true);
  expect(api.invoke).toHaveBeenCalledTimes(2);
  newer.resolve({ data: null, error: null });
  await Promise.all([second, third]);
});

it('bounds a hung request and aborts it so fail-closed state can be published', async () => {
  vi.useFakeTimers();
  const hung = pending();
  api.invoke.mockReturnValueOnce(hung.promise);
  let settled = false;
  const request = refreshErpScope(true).then((result) => { settled = true; return result; });
  await vi.advanceTimersByTimeAsync(20_000);
  expect(settled).toBe(true);
  expect(await request).toBeNull();
  expect(api.invoke.mock.calls[0][1].signal.aborted).toBe(true);
});

it('does not reuse an in-flight request across users even without an explicit reset', async () => {
  const old = pending();
  api.invoke.mockReturnValueOnce(old.promise);
  const first = refreshErpScope(true, 'u1');
  await refreshErpScope(true, 'u2');
  expect(api.invoke).toHaveBeenCalledTimes(2);
  old.resolve({ data: { ok: true }, error: null });
  expect(await first).toBeNull();
});

it('distinguishes a throttled no-op from a failed request', async () => {
  await refreshErpScope(true, 'u1');
  expect(await refreshErpScope(false, 'u1')).toBeUndefined();
  expect(api.invoke).toHaveBeenCalledTimes(1);
});
