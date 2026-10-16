const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('../miniprogram/shared/api');
const { createTransport } = require('../miniprogram/shared/transport');

const USER = '00000000-0000-4000-8000-000000000001';
const PEER = '00000000-0000-4000-8000-000000000002';
const OLD_SHOP = '00000000-0000-4000-8000-000000000003';
function fixture(options = {}) {
  const calls = [];
  let freshnessReads = 0;
  const raw = { date: '2028-02-01', from: '2028-02-01', to: '2028-02-29', scope: 'store', can_view_shop: true, shop_id: null,
    rows: [
      { work_date: '2028-02-29', shop_id: OLD_SHOP, shop_name: '本人历史调店', user_id: USER, display_name: '本人', shift_code: 'A', shift_name: '早班', start_time: '10:00', end_time: '18:00', source: 'manual', is_rest: false, is_self: true, unlisted: 'do-not-copy' },
      { work_date: '2028-02-29', shop_id: '00000000-0000-4000-8000-000000000004', shop_name: '不应展示的店', user_id: PEER, display_name: 'private-peer-name', is_rest: false, is_self: false }
    ], conflicts: [{ work_date: '2028-02-29', user_id: USER, count: 2 }, { work_date: '2028-02-29', user_id: PEER, count: 3 }] };
  const wx = { request(request) {
    const url = new URL(request.url);
    calls.push({ path: url.pathname, method: request.method, body: request.data, header: request.header });
    if (url.pathname === '/auth/v1/user') return request.success({ statusCode: 200, data: { id: options.wrongActor ? PEER : USER } });
    if (url.pathname === '/rest/v1/rpc/erp_scope_fresh_v1') return request.success({ statusCode: 200, data: !(options.staleAfter && ++freshnessReads > 1) });
    if (url.pathname === '/rest/v1/rpc/list_shift_schedules_v1') return request.success({ statusCode: 200, data: raw });
    throw new Error('Unexpected network endpoint: ' + url.pathname);
  } };
  const session = { get: () => ({ userId: USER, shop: null, shops: [], scopeVersion: 3, isHeadquarters: false }), token: () => 'caller-token', revision: () => 1, ensureFresh: async () => {} };
  const config = { supabaseUrl: 'https://example.test', publicKey: 'public-test' };
  return { calls, api: createApi({ wx, config, session, invoke: createTransport(wx, config, session.token) }) };
}

test('no-shop personal month uses real transport caller JWT and exact NULL-shop RPC, with no coworker projection', async () => {
  const h = fixture();
  const result = await h.api.action('schedule', { month: '2028-02', view: 'mine', shop_id: 'forged', user_id: PEER });
  assert.equal(result.shop_id, null); assert.equal(result.view, 'mine'); assert.equal(result.month, '2028-02');
  assert.equal(result.can_view_shop, false); assert.equal(result.rows.length, 1); assert.equal(result.rows[0].user_id, USER);
  assert.equal(result.rows[0].shop_id, OLD_SHOP); assert.equal(result.rows[0].unlisted, undefined);
  assert.equal(result.conflicts.length, 1); assert.equal(result.conflicts[0].user_id, USER);
  assert.doesNotMatch(JSON.stringify(result), /private-peer-name|do-not-copy|不应展示的店/);
  const read = h.calls.find(call => call.path.endsWith('/list_shift_schedules_v1'));
  assert.deepEqual(read.body, { _from: '2028-02-01', _to: '2028-02-29', _shop_id: null });
  assert.equal(read.method, 'POST');
  assert.ok(h.calls.some(call => call.path === '/auth/v1/user' && call.method === 'GET'));
  assert.equal(h.calls.filter(call => call.path.endsWith('/erp_scope_fresh_v1')).length, 2);
  assert.ok(h.calls.every(call => call.header.Authorization === 'Bearer caller-token' && call.header.apikey === 'public-test'));
});

test('real-transport post-read stale scope does not resolve into an empty or populated personal calendar', async () => {
  const h = fixture({ staleAfter: true });
  await assert.rejects(h.api.action('schedule', { month: '2028-02', view: 'mine' }));
  assert.equal(h.calls.filter(call => call.path.endsWith('/list_shift_schedules_v1')).length, 1);
});

test('real-transport actor mismatch blocks schedule access before any schedule RPC', async () => {
  const h = fixture({ wrongActor: true });
  await assert.rejects(h.api.action('schedule', { month: '2028-02', view: 'mine' }));
  assert.equal(h.calls.filter(call => call.path.endsWith('/list_shift_schedules_v1')).length, 0);
  assert.equal(h.calls.filter(call => call.path === '/auth/v1/user').length, 1);
});
