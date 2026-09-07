import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { PermissionsProvider, usePermissions } from '../src/hooks/usePermissions';
import { resetErpScopeSyncThrottle } from '../src/lib/erpScopeSync';
import { writeUserCache } from '../src/lib/appCache';

const api = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), invoke: vi.fn(), getSession: vi.fn(),
  listener: null as null | ((event: string, session: unknown) => void),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: api.rpc, from: api.from,
  auth: {
    getSession: api.getSession,
    onAuthStateChange: (cb: typeof api.listener) => {
      api.listener = cb;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    signOut: vi.fn(async () => ({ error: null })),
  },
} }));
vi.mock('@/lib/invokeFn', () => ({ invokeFn: api.invoke }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const session = (id = 'u1') => ({ user: { id }, access_token: `token-${id}` });
const bootstrap = (source = 'erp', scope = 'hq', permission = 'role.manage') => ({
  date: '2026-09-08',
  user_role: { source, role: 'admin', role_code: 'super_admin', role_codes: ['super_admin'], suspended: false },
  permissions: [permission],
  shop_context: { scope, date: '2026-09-08', authorized_shops: [] },
  profile: null, staff_profile: null, shifts: [], shift_definitions: [],
  checked_today: false, activity: null, okrs: [], encouragement: null,
});
const sync = (status = 'synced', id = 'u1', governed = true, scope = 'hq') => ({
  data: { ok: true, data: {
    authenticated: true, user_id: id, is_erp_user: governed,
    erp_user_id: governed ? 'erp-1' : null,
    scope_context: { erp_governed: governed, scope },
  }, sync: { status, scope_version: 3, lease_renewed: status === 'synced' || status === 'ack_pending' } },
  error: null,
});
let current: ReturnType<typeof useAuth>;
let permissions: ReturnType<typeof usePermissions>;
function Probe() {
  current = useAuth();
  permissions = usePermissions();
  return <span>{current.roleCode}:{[...permissions.permissions].join(',')}</span>;
}
async function settle() { await act(async () => { await Promise.resolve(); }); }
async function mount() {
  render(<AuthProvider><PermissionsProvider><Probe /></PermissionsProvider></AuthProvider>);
  await settle();
}
async function renew() {
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
}
function expectDenied() {
  expect(current.role).toBeNull();
  expect(current.roleCode).toBeNull();
  expect(current.bootstrap?.permissions).toEqual([]);
  expect([...permissions.permissions]).toEqual([]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T03:00:00Z'));
  vi.clearAllMocks();
  resetErpScopeSyncThrottle();
  localStorage.clear();
  api.getSession.mockResolvedValue({ data: { session: session() } });
  api.rpc.mockResolvedValue({ data: bootstrap(), error: null });
  api.invoke.mockResolvedValue(sync());
  api.from.mockImplementation(() => {
    throw new Error('ERP authorization must not fall back to legacy role tables');
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('real AuthProvider / PermissionsProvider ERP renewal', () => {
  for (const failed of [null, sync('pending'), sync('unlinked')]) {
    it(`clears published admin and permissions on ${failed?.data.sync.status ?? 'network failure'}`, async () => {
      await mount();
      expect(current.role).toBe('admin');
      expect(permissions.can('role.manage')).toBe(true);
      api.invoke.mockResolvedValueOnce(failed ?? { data: null, error: { message: 'offline' } });
      await renew();
      expectDenied();
      expect(api.from).not.toHaveBeenCalled();
      await act(async () => { await current.refreshBootstrap(); });
      expectDenied();
    });
  }

  it('learns governance from bootstrap source and never exposes cached ERP admin before renewal', async () => {
    writeUserCache('app-bootstrap', 'u1', bootstrap());
    const pull = deferred<ReturnType<typeof sync>>();
    api.invoke.mockReturnValue(pull.promise);
    await mount();
    expectDenied();
    pull.resolve({ data: null, error: { message: 'offline' } } as never);
    await settle();
    expectDenied();
  });

  it('never restores stale bootstrap admin after a trusted sync reports unconfigured scope', async () => {
    await mount();
    api.invoke.mockResolvedValueOnce(sync('ack_pending', 'u1', true, 'unconfigured'));
    api.rpc.mockResolvedValue({ data: bootstrap('erp', 'unconfigured'), error: null });
    await renew();
    expectDenied();
  });

  it('rejects bootstrap stale scope even when sync verifier still says active', async () => {
    api.rpc.mockResolvedValue({ data: bootstrap('erp', 'unconfigured'), error: null });
    await mount();
    expectDenied();
  });

  it('preserves a verified never-governed legacy user on unlinked and on network failure', async () => {
    api.rpc.mockResolvedValue({ data: bootstrap('legacy'), error: null });
    api.invoke.mockResolvedValue(sync('unlinked', 'u1', false, 'unconfigured'));
    await mount();
    expect(current.role).toBe('admin');
    expect(permissions.can('role.manage')).toBe(true);
    api.invoke.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await renew();
    expect(current.role).toBe('admin');
    expect(permissions.can('role.manage')).toBe(true);
  });

  it('does not infer legacy from unknown network failure and a failed bootstrap', async () => {
    api.rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    api.invoke.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await mount();
    expectDenied();
    expect(api.from).not.toHaveBeenCalled();
  });

  it('retains the legacy table fallback only after an authenticated unlinked proof', async () => {
    api.rpc.mockResolvedValue({ data: null, error: new Error('bootstrap unavailable') });
    api.invoke.mockResolvedValue(sync('unlinked', 'u1', false, 'unconfigured'));
    api.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => table === 'user_roles'
      ? { maybeSingle: async () => ({ data: { role: 'admin', role_code: 'super_admin', suspended: false }, error: null }) }
      : Promise.resolve({ data: [{ permission_key: 'legacy.manage' }] }),
    }) }));
    await mount();
    expect(current.role).toBe('admin');
    expect(permissions.can('legacy.manage')).toBe(true);
  });

  it('remembers ERP governance after cache invalidation and a new app mount', async () => {
    await mount();
    api.invoke.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await renew();
    expectDenied();
    cleanup();
    api.rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    api.from.mockClear();
    await mount();
    expectDenied();
    expect(api.from).not.toHaveBeenCalled();
  });

  it('discards a late bootstrap after failure clears scope', async () => {
    await mount();
    const late = deferred<{ data: ReturnType<typeof bootstrap>; error: null }>();
    api.rpc.mockReturnValueOnce(late.promise);
    let refresh!: Promise<void>;
    act(() => { refresh = current.refreshBootstrap(); });
    api.invoke.mockResolvedValueOnce(sync('pending'));
    vi.setSystemTime(Date.now() + 30_000);
    act(() => { window.dispatchEvent(new Event('focus')); });
    await settle();
    late.resolve({ data: bootstrap(), error: null });
    await act(async () => { await refresh; });
    expectDenied();
  });

  it('rejects mismatched response user_id instead of accepting the call-site identity', async () => {
    await mount();
    api.invoke.mockResolvedValueOnce(sync('synced', 'other-user'));
    await renew();
    expectDenied();
  });

  for (const [label, mutate] of [
    ['ok false', (value: ReturnType<typeof sync>) => { value.data.ok = false; }],
    ['unauthenticated', (value: ReturnType<typeof sync>) => { value.data.data.authenticated = false; }],
    ['lease not renewed', (value: ReturnType<typeof sync>) => { value.data.sync.lease_renewed = false; }],
    ['negative version', (value: ReturnType<typeof sync>) => { value.data.sync.scope_version = -1; }],
    ['missing sync', (value: ReturnType<typeof sync>) => { delete (value.data as { sync?: unknown }).sync; }],
  ] as const) {
    it(`fails closed for malformed sync: ${label}`, async () => {
      await mount();
      const response = sync();
      mutate(response);
      api.invoke.mockResolvedValueOnce(response);
      await renew();
      expectDenied();
    });
  }

  it('accepts valid ack_pending and recovers after a failed renewal', async () => {
    await mount();
    api.invoke.mockResolvedValueOnce(sync('pending'));
    await renew();
    expectDenied();
    api.invoke.mockResolvedValueOnce(sync('ack_pending'));
    api.rpc.mockResolvedValue({ data: bootstrap('erp', 'hq', 'shop.read'), error: null });
    await renew();
    expect(current.bootstrap?.permissions).toEqual(['shop.read']);
    expect([...permissions.permissions]).toEqual(['shop.read']);
  });

  it('does not let a prior user bootstrap or sync overwrite the new user', async () => {
    await mount();
    const old = deferred<{ data: ReturnType<typeof bootstrap>; error: null }>();
    api.rpc.mockReturnValueOnce(old.promise);
    let oldRefresh!: Promise<void>;
    act(() => { oldRefresh = current.refreshBootstrap(); });
    api.rpc.mockResolvedValue({ data: bootstrap('legacy', 'hq', 'shop.read'), error: null });
    api.invoke.mockResolvedValue(sync('unlinked', 'u2', false, 'unconfigured'));
    act(() => { api.listener!('SIGNED_IN', session('u2')); });
    await settle();
    old.resolve({ data: bootstrap(), error: null });
    await act(async () => { await oldRefresh; });
    expect(current.user?.id).toBe('u2');
    expect([...permissions.permissions]).toEqual(['shop.read']);
  });
});
