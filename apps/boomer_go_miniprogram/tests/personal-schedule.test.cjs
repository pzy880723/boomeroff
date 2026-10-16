const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createApi } = require('../miniprogram/shared/api');
const { createTransport } = require('../miniprogram/shared/transport');

const SELF = '20000000-0000-4000-8000-000000000001';
const PEER = '20000000-0000-4000-8000-000000000002';
const SHOP = '10000000-0000-4000-8000-000000000001';
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const row = (extra = {}) => ({ work_date: '2026-10-16', shop_id: SHOP, shop_name: '历史调店', user_id: SELF, display_name: '本人', shift_code: 'A', shift_name: '早班', start_time: '09:00:00', end_time: '17:00:00', source: 'manual', is_rest: false, is_self: false, ...extra });
const raw = (extra = {}) => ({ date: '2026-10-01', from: '2026-10-01', to: '2026-10-31', scope: 'store', shop_id: null, can_view_shop: true, rows: [row()], conflicts: [], ...extra });

function harness(options = {}) {
  let current = { userId: SELF, shop: null, shops: [], scopeVersion: 3, profile: {}, ...options.user }, revision = 1, freshCalls = 0;
  const calls = [];
  const session = { get: () => current, revision: () => revision, token: () => 'synthetic-token', ensureFresh: async () => { if (options.renew) await options.renew(); }, signOut() { current = null; revision++; } };
  const transport = async (name, body, settings) => {
    calls.push({ name, body: plain(body), settings: settings && plain(settings) });
    if (options.intercept) { const answer = await options.intercept(name, calls.length); if (answer !== undefined) return answer; }
    if (name === 'auth:user') return options.auth === undefined ? { id: SELF, email: 'private@example.invalid' } : options.auth;
    if (name === 'rpc:erp_scope_fresh_v1') { const index = freshCalls++; return options.fresh ? options.fresh[index] : true; }
    if (name === 'rpc:list_shift_schedules_v1') return options.reply === undefined ? raw() : options.reply;
    if (name === 'go-mini-api') return { data: { kept: true } };
    throw new Error('unexpected route: ' + name);
  };
  const api = createApi({ wx: {}, config: {}, session, invoke: transport });
  return { api, calls, session, change(extra = {}) { current = { ...current, ...extra }; revision++; } };
}

test('no-shop mine uses only verified caller, two strict fresh checks and the fixed NULL-shop RPC', async () => {
  const h = harness();
  const result = await h.api.action('schedule', { month: '2026-10', view: 'mine', shop_id: 'guessed-home', user_id: PEER });
  assert.deepEqual(h.calls.map(c => c.name), ['auth:user', 'rpc:erp_scope_fresh_v1', 'rpc:list_shift_schedules_v1', 'rpc:erp_scope_fresh_v1']);
  assert.deepEqual(h.calls[0].settings, { accessToken: 'synthetic-token' });
  assert.deepEqual(h.calls[2].body, { _from: '2026-10-01', _to: '2026-10-31', _shop_id: null });
  assert.equal(result.shop_id, null); assert.equal(result.view, 'mine'); assert.equal(result.can_view_shop, false);
  assert.equal(result.rows[0].shop_id, SHOP, 'own historic transfer must not require current shop membership');
  assert.equal(result.rows[0].is_self, true);
});

test('omitted view defaults to mine and omitted month uses Shanghai month', async () => {
  const month = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);
  const end = new Date(month + '-01T00:00:00Z'); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  const h = harness({ reply: raw({ date: month + '-01', from: month + '-01', to: end.toISOString().slice(0, 10), rows: [] }) });
  assert.equal((await h.api.action('schedule')).month, month);
});

for (const [month, last] of [['2028-02', '29'], ['2027-02', '28'], ['2026-04', '30'], ['2026-12', '31']]) test('full month range: ' + month, async () => {
  const first = month + '-01', to = month + '-' + last;
  const h = harness({ reply: raw({ date: first, from: first, to, rows: [] }) });
  assert.equal((await h.api.action('schedule', { month })).month, month);
  assert.deepEqual(h.calls[2].body, { _from: first, _to: to, _shop_id: null });
});

test('manager raw data is projected to own whitelisted rows/conflicts, with no coworker capability', async () => {
  const value = raw({ rows: [row({ note: 'secret', extra: { phone: 'secret' } }), row({ user_id: PEER, display_name: 'private peer' })], conflicts: [{ work_date: '2026-10-16', user_id: SELF, count: 2, phone: 'secret' }, { work_date: '2026-10-17', user_id: PEER, count: 8 }], private_metadata: 'secret' });
  const original = structuredClone(value), h = harness({ reply: value });
  const result = await h.api.action('schedule', { month: '2026-10' });
  assert.equal(result.rows.length, 1); assert.equal(result.conflicts.length, 1);
  assert.equal(result.can_view_shop, false); assert.equal(result.rows[0].is_self, true);
  assert.deepEqual(Object.keys(result).sort(), ['month', 'view', 'shop_id', 'can_view_shop', 'rows', 'conflicts'].sort());
  assert.equal(result.rows[0].note, undefined); assert.equal(result.rows[0].extra, undefined);
  assert.deepEqual(result.conflicts, [{ work_date: '2026-10-16', user_id: SELF, count: 2 }]);
  assert.ok(!JSON.stringify(result).includes('private peer')); assert.deepEqual(value, original);
});

for (const value of [false, null, 1, 'true', { data: true }]) {
  for (const phase of ['before', 'after']) test('strict fresh ' + phase + ' rejects ' + JSON.stringify(value), async () => {
    const h = harness({ fresh: phase === 'before' ? [value] : [true, value] });
    await assert.rejects(h.api.action('schedule', { month: '2026-10' }), e => e.status === 403 && e.code === 'erp_scope_not_ready');
    assert.equal(h.calls.length, phase === 'before' ? 2 : 4);
    assert.equal(h.calls.filter(c => c.name === 'rpc:list_shift_schedules_v1').length, phase === 'before' ? 0 : 1);
  });
}

for (const auth of [null, {}, { id: PEER }, { user: { id: SELF } }]) test('auth:user must confirm exact uid: ' + JSON.stringify(auth), async () => {
  const h = harness({ auth });
  await assert.rejects(h.api.action('schedule', { month: '2026-10' }), e => e.status === 401);
  assert.equal(h.calls.length, 1);
});

for (const patch of [{ scope: 'unconfigured' }, { scope: null }, { from: '2026-10-02' }, { to: '2026-11-01' }, { date: '2026-10-02' }, { shop_id: SHOP }, { can_view_shop: 'true' }, { rows: null }, { conflicts: {} }]) test('invalid RPC envelope fails closed: ' + JSON.stringify(patch), async () => {
  const h = harness({ reply: raw(patch) });
  await assert.rejects(h.api.action('schedule', { month: '2026-10' }), e => e.code === 'invalid_schedule_response');
});

for (const patch of [{ work_date: '2026-09-30' }, { work_date: '2026-10-32' }, { is_rest: 'true' }, { shop_id: {} }, { start_time: {} }]) test('invalid own row does not become empty success: ' + JSON.stringify(patch), async () => {
  const h = harness({ reply: raw({ rows: [row(patch)] }) });
  await assert.rejects(h.api.action('schedule', { month: '2026-10' }), e => e.code === 'invalid_schedule_response');
});

test('invalid own conflict fails closed', async () => {
  const h = harness({ reply: raw({ conflicts: [{ user_id: SELF, work_date: '2026-10-16', count: '2' }] }) });
  await assert.rejects(h.api.action('schedule', { month: '2026-10' }), e => e.code === 'invalid_schedule_response');
});

for (const patch of [{ rows: [null] }, { rows: [{}] }, { conflicts: [null] }, { conflicts: [{}] }]) test('missing raw record identity cannot masquerade as an empty personal month: ' + JSON.stringify(patch), async () => {
  const h = harness({ reply: raw(patch) });
  await assert.rejects(h.api.action('schedule', { month: '2026-10' }), e => e.code === 'invalid_schedule_response');
});

test('missing caller token rejects before transport instead of falling back to public bearer', async () => {
  const h = harness(); h.session.token = () => null;
  await assert.rejects(h.api.action('schedule', { month: '2026-10' }), e => e.status === 401);
  assert.equal(h.calls.length, 0);
});

test('renewal failure or actor revision change cannot start personal auth/read requests', async () => {
  for (const change of [false, true]) {
    const h = harness(); h.session.ensureFresh = async () => { if (change) h.change(); else throw new Error('renewal failed'); };
    await assert.rejects(h.api.action('schedule', { month: '2026-10' })); assert.equal(h.calls.length, 0);
  }
});

for (const month of ['2026-13', '2026-2', '2026-02-01', null, '0000-01']) test('invalid requested month sends zero requests: ' + month, async () => {
  const h = harness(); await assert.rejects(h.api.action('schedule', { month }), e => e.code === 'invalid_params'); assert.equal(h.calls.length, 0);
});

for (const stage of [1, 2, 3, 4]) for (const change of [{ userId: PEER }, {}, { shop: { id: SHOP } }, { scopeVersion: 4 }]) test('identity/revision change at read stage ' + stage + ': ' + JSON.stringify(change), async () => {
  const gate = deferred(); const h = harness({ intercept: async (_, n) => { if (n === stage) await gate.promise; } });
  const work = h.api.action('schedule', { month: '2026-10' }); await tick(); h.change(change); gate.resolve();
  await assert.rejects(work, e => e.code === 'stale_operation'); assert.equal(h.calls.length, stage);
});

for (const status of [401, 403, 500]) test('RPC errors are safe, not retried and never interpreted as empty: ' + status, async () => {
  const h = harness({ intercept: async name => { if (name === 'rpc:list_shift_schedules_v1') throw Object.assign(new Error('private database text'), { status, code: status === 403 ? '42501' : 'secret' }); } });
  await assert.rejects(h.api.action('schedule', { month: '2026-10' }), e => e.status === status && !e.message.includes('private'));
  assert.equal(h.calls.length, 3);
});

test('selected mine/shop stay on the existing BFF; no-shop shop still refuses before transport', async () => {
  for (const view of ['mine', 'shop']) {
    const h = harness({ user: { shop: { id: SHOP } } });
    assert.deepEqual(await h.api.action('schedule', { month: '2026-10', view }), { kept: true });
    assert.deepEqual(h.calls.map(c => c.name), ['go-mini-api']);
    assert.equal(h.calls[0].body.params.shop_id, SHOP);
  }
  const h = harness(); await assert.rejects(h.api.action('schedule', { month: '2026-10', view: 'shop' }), /门店/); assert.equal(h.calls.length, 0);
});

test('real transport uses only fixed auth/RPC URLs and current bearer, never public/service fallback', async () => {
  const calls = [];
  const wx = { request(o) { calls.push(o); o.success({ statusCode: 200, data: o.url.endsWith('/auth/v1/user') ? { id: SELF } : o.url.endsWith('/erp_scope_fresh_v1') ? true : raw() }); } };
  const transport = createTransport(wx, { supabaseUrl: 'https://offline.invalid', publicKey: 'public-key' }, () => 'synthetic-token');
  const h = harness(); const api = createApi({ wx, config: {}, session: h.session, invoke: transport });
  await api.action('schedule', { month: '2026-10' });
  assert.deepEqual(calls.map(c => c.url), ['https://offline.invalid/auth/v1/user', 'https://offline.invalid/rest/v1/rpc/erp_scope_fresh_v1', 'https://offline.invalid/rest/v1/rpc/list_shift_schedules_v1', 'https://offline.invalid/rest/v1/rpc/erp_scope_fresh_v1']);
  assert.ok(calls.every(c => c.header.Authorization === 'Bearer synthetic-token'));
});

function page(options = {}) {
  const h = harness(options), app = { api: h.api, session: h.session, preview: false, ensureSession: async () => !!h.session.get() };
  let definition, signOuts = 0; const signOut = h.session.signOut; h.session.signOut = () => { signOuts++; signOut(); };
  const wx = { reLaunch() {}, stopPullDownRefresh() {} }, shell = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../miniprogram/shared/page.js'), 'utf8'), { module: shell, wx, getApp: () => app });
  const file = path.resolve(__dirname, '../miniprogram/pages/schedule/index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { wx, getApp: () => app, Page(p) { definition = p; }, require(id) { return id === '../../shared/page' ? shell.exports : require(path.resolve(path.dirname(file), id)); } });
  const view = { ...definition, data: structuredClone(definition.data), setData(patch) { assert.notEqual(this._gone, true); Object.assign(this.data, patch); } };
  return { ...h, view, signOuts: () => signOuts };
}

for (const status of ['rest', 'unscheduled']) test('native no-shop ' + status + ' can read own month without turning every day into rest', async () => {
  const h = page({ user: { bootstrap: { shop_context: { status } } }, reply: raw({ rows: [row({ is_rest: true, source: 'day_off' })] }) });
  await h.view.onLoad({ month: '2026-10' });
  assert.equal(h.view.data.error, ''); assert.equal(h.view.data.items.length, 1); assert.equal(h.view.data.items[0].start, '');
  assert.equal(h.view.data.days.find(d => d.date === '2026-10-16').status, 'rest');
  assert.equal(h.view.data.days.find(d => d.date === '2026-10-17').status, 'unscheduled');
  const before = h.calls.length; await h.view.onViewChange({ currentTarget: { dataset: { view: 'shop' } } });
  assert.equal(h.calls.length, before); assert.equal(h.view.data.canViewShop, false);
});

for (const lifecycle of ['hide', 'unload', 'revision']) test('late no-shop read cannot render after ' + lifecycle, async () => {
  const gate = deferred(), h = page({ intercept: async name => { if (name === 'rpc:list_shift_schedules_v1') await gate.promise; } });
  const work = h.view.onLoad({ month: '2026-10' }); await tick();
  if (lifecycle === 'hide') h.view.onHide(); else if (lifecycle === 'unload') h.view.onUnload(); else h.change();
  gate.resolve(); await work; assert.equal(h.view.data.items.length, 0); assert.equal(h.signOuts(), 0);
});

for (const late of [false, true]) test((late ? 'stale' : 'current') + ' auth 401 follows existing page signout guard', async () => {
  const gate = deferred(), h = page({ intercept: async name => { if (name === 'auth:user') { await gate.promise; throw Object.assign(new Error('private'), { status: 401 }); } } });
  const work = h.view.onLoad({ month: '2026-10' }); await tick(); if (late) h.change({ userId: PEER }); gate.resolve(); await work;
  assert.equal(h.signOuts(), late ? 0 : 1); assert.equal(h.view.data.items.length, 0);
});
