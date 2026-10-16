const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createApi } = require('../miniprogram/shared/api');

const TODAY = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const TOMORROW = new Date(Date.parse(TODAY + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
const USER = '00000000-0000-4000-8000-000000000001';
const A = { id: '00000000-0000-4000-8000-000000000002', name: '浏览门店 A' };
const B = { id: '00000000-0000-4000-8000-000000000003', name: '实际工作门店 B' };
const row = (extra = {}) => ({ id: 'shift-1', work_date: TODAY, shop_id: B.id, shift_code: 'A', ...extra });
const def = (extra = {}) => ({ code: 'A', name: '早班', start_time: '10:00:00', end_time: '19:00:00', ...extra });
const dto = (extra = {}) => ({ date: TODAY, shifts: [row()], shift_definitions: [def()], shop_context: { date: TODAY, status: 'scheduled' }, checked_today: false, ...extra });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));

function adapter(value, extra = {}) {
  const calls = [];
  let current = { userId: USER, profile: { display_name: '合成员工' }, shop: A, shops: [A, B], scopeVersion: 3, ...extra }, revision = 1;
  const session = { get: () => current, revision: () => revision, ensureFresh: async () => {}, signOut() { current = null; revision++; } };
  const api = createApi({ wx: {}, config: {}, session, invoke: async (name, body) => {
    calls.push({ name, body: structuredClone(body) });
    return { data: body.action === 'dashboard' ? (typeof value === 'function' ? await value() : value) : { date: TODAY, items: [{ id: 'real-task', title: '服务端任务', completed: false, claimed: false }], pending_items: [] } };
  } });
  return { api, session, calls, change(extra) { current = { ...current, ...extra }; revision++; } };
}
async function projected(value, extra) {
  const h = adapter(value, extra), before = structuredClone(value), result = await h.api.action('dashboard');
  assert.deepEqual(value, before, 'projection must not mutate bootstrap fields');
  assert.equal(h.calls.length, 1, 'projection must not make additional requests');
  assert.deepEqual(result.shifts, value.shifts); assert.deepEqual(result.shift_definitions, value.shift_definitions);
  return result;
}

test('actual authorized schedule shop, not selected browsing shop or row-supplied name, labels today shift', async () => {
  const result = await projected(dto({ shifts: [row({ shop_name: '不可信行名称' })] }));
  assert.equal(result.shift.shop_name, B.name); assert.equal(result.shift.shop_id, B.id);
  assert.equal(result.shift_status, 'scheduled'); assert.equal(result.shift.start_time, '10:00:00');
});

test('exact shop definition wins over global, legacy and another shop sharing the code', async () => {
  const result = await projected(dto({ shift_definitions: [def({ shop_id: A.id, name: '错误店', start_time: '01:00' }), def({ shop_id: null, name: '共享' }), def({ name: '旧定义' }), def({ shop_id: B.id, name: 'B 店晚班', start_time: '14:00', end_time: '22:00' })] }));
  assert.equal(result.shift.title, 'B 店晚班'); assert.equal(result.shift.start_time, '14:00');
});

test('explicit global definition wins over legacy when no exact shop definition exists', async () => {
  const result = await projected(dto({ shift_definitions: [def({ name: '旧定义' }), def({ shop_id: A.id, name: '错误店' }), def({ shop_id: null, name: '共享班', start_time: '11:00' })] }));
  assert.equal(result.shift.title, '共享班'); assert.equal(result.shift.start_time, '11:00');
});

for (const scope of ['legacy', 'exact', 'global']) test('ambiguous ' + scope + ' definitions never invent times or fall through to weaker definitions', async () => {
  const scoped = scope === 'legacy' ? {} : { shop_id: scope === 'exact' ? B.id : null };
  const defs = [def(scoped), def({ ...scoped, start_time: '12:00' })];
  if (scope === 'exact') defs.push(def({ shop_id: null }));
  const result = await projected(dto({ shift_definitions: defs }));
  assert.equal(result.shift.start_time, ''); assert.equal(result.shift.end_time, ''); assert.equal(result.shift.title, 'A');
  assert.equal(result.shift.shop_name, B.name); assert.match(result.shift_notice, /班次.*(冲突|不唯一|多条)/);
});

for (const defs of [[], [def({ shop_id: A.id })], [def({ shop_id: undefined })], [def({ start_time: '25:00' })], [def({ end_time: null })]]) test('missing or invalid eligible definition preserves work fact without made-up time: ' + JSON.stringify(defs), async () => {
  const result = await projected(dto({ shift_definitions: defs }));
  assert.equal(result.shift_status, 'scheduled'); assert.equal(result.shift.shop_name, B.name);
  assert.equal(result.shift.start_time, ''); assert.equal(result.shift.end_time, ''); assert.ok(result.shift_notice);
});

for (const extra of [{ user_id: 'other-user' }, { is_self: false }, { shop_id: 'foreign' }, { shop_id: null }, { shift_code: '' }]) test('unverified current-day row is not presented as caller work: ' + JSON.stringify(extra), async () => {
  const result = await projected(dto({ shifts: [row(extra)] }));
  assert.equal(result.shift, null); assert.equal(result.shift_status, 'unavailable'); assert.ok(result.shift_notice);
});

test('two current-day rows show a conflict, rather than silently choosing the first', async () => {
  const result = await projected(dto({ shifts: [row(), row({ id: 'shift-2', shop_id: A.id })] }));
  assert.equal(result.shift, null); assert.equal(result.shift_status, 'conflict'); assert.match(result.shift_notice, /多条|冲突/);
});

test('tomorrow rows do not compete with the one real today row', async () => {
  const result = await projected(dto({ shifts: [row({ work_date: TOMORROW, shop_id: A.id }), row({ user_id: USER, is_self: true })] }));
  assert.equal(result.shift.shop_name, B.name); assert.equal(result.shift_status, 'scheduled');
});

test('stale dashboard date never displays yesterday work or rest as today', async () => {
  for (const status of ['scheduled', 'rest']) {
    const result = await projected(dto({ date: '2000-01-01', shop_context: { date: '2000-01-01', status } }));
    assert.equal(result.shift, null); assert.equal(result.shift_status, 'unavailable'); assert.match(result.shift_notice, /日期|过期/);
  }
});

test('only explicitly dated current server rest is rest; missing records are unscheduled', async () => {
  const rest = await projected(dto({ shifts: [], shop_context: { date: TODAY, status: 'rest' } }));
  assert.equal(rest.shift, null); assert.equal(rest.shift_status, 'rest');
  for (const context of [{ date: TODAY, status: 'unscheduled' }, { date: TODAY }, {}]) {
    const result = await projected(dto({ shifts: [], shop_context: context }));
    assert.equal(result.shift_status, 'unscheduled'); assert.equal(result.shift, null);
  }
  const stale = await projected(dto({ shifts: [], shop_context: { date: '2000-01-01', status: 'rest' } }));
  assert.equal(stale.shift_status, 'unavailable');
});

test('rest conflicting with an actual work row is not silently interpreted as either', async () => {
  const result = await projected(dto({ shop_context: { date: TODAY, status: 'rest' } }));
  assert.equal(result.shift, null); assert.equal(result.shift_status, 'conflict'); assert.ok(result.shift_notice);
});

test('server scheduled context without its current-day work row is incomplete, not unscheduled', async () => {
  const result = await projected(dto({ shifts: [row({ work_date: TOMORROW })] }));
  assert.equal(result.shift, null); assert.equal(result.shift_status, 'unavailable'); assert.match(result.shift_notice, /不完整|缺少|不一致/);
});

test('no verified shop membership cannot borrow selected shop as authorization or a name fallback', async () => {
  const result = await projected(dto(), { shops: [] });
  assert.equal(result.shift, null); assert.equal(result.shift_status, 'unavailable');
});

test('revision change still rejects late dashboard projection', async () => {
  const gate = deferred(), h = adapter(() => gate.promise);
  const work = h.api.action('dashboard'); await tick(); h.change({ shop: B }); gate.resolve(dto());
  await assert.rejects(work, e => e.code === 'stale_operation');
});

function page(value) {
  const h = adapter(value), wx = { reLaunch() {}, stopPullDownRefresh() {} }, app = { api: h.api, session: h.session, preview: false };
  let definition, salesCalls = 0;
  h.api.sales = async () => { salesCalls++; return { revenue: null, complete: false }; };
  const shared = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../miniprogram/shared/page.js'), 'utf8'), { module: shared, wx, getApp: () => app });
  const file = path.resolve(__dirname, '../miniprogram/pages/workbench/index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require(id) { return id === '../../shared/page' ? shared.exports : require(path.resolve(path.dirname(file), id)); }, Page(p) { definition = p; }, wx, getApp: () => app });
  const view = { ...definition, data: structuredClone(definition.data), setData(patch) { Object.assign(this.data, patch); } };
  return { ...h, view, salesCalls: () => salesCalls };
}

test('workbench uses actual API projection, shows working shop and keeps browsing header independent', async () => {
  const h = page(dto()); await h.view.onLoad({});
  assert.equal(h.view.data.shopName, A.name); assert.equal(h.view.data.shift.shop, B.name);
  assert.equal(h.view.data.shiftStatus, 'scheduled'); assert.equal(h.view.data.agenda[0].id, 'real-task');
  assert.equal(h.salesCalls(), 1); assert.deepEqual(h.calls.map(c => c.body.action), ['dashboard', 'tasks']);
});

test('workbench real rest/unscheduled/conflict/config states do not block tasks or sales', async () => {
  for (const value of [dto({ shifts: [], shop_context: { date: TODAY, status: 'rest' } }), dto({ shifts: [], shop_context: { date: TODAY, status: 'unscheduled' } }), dto({ shifts: [row(), row()] }), dto({ shift_definitions: [] })]) {
    const h = page(value); await h.view.onLoad({});
    assert.ok(h.view.data.shiftStatus); assert.equal(h.view.data.error, ''); assert.equal(h.view.data.agenda.length, 1); assert.equal(h.salesCalls(), 1);
    if (value.shifts.length > 1 || !value.shift_definitions.length) assert.ok(h.view.data.shiftNotice);
  }
});

test('workbench refresh clears previous shift status, notice and actual store before next dashboard settles', async () => {
  let next = dto({ shift_definitions: [] }); const h = page(() => next); await h.view.onLoad({});
  assert.ok(h.view.data.shiftNotice); const gate = deferred(); next = gate.promise; const work = h.view.retry();
  assert.equal(h.view.data.shift, null); assert.equal(h.view.data.shiftNotice, ''); assert.equal(h.view.data.shiftStatus, '');
  gate.resolve(dto({ shifts: [], shop_context: { date: TODAY, status: 'unscheduled' } })); await work;
  assert.equal(h.view.data.shiftStatus, 'unscheduled'); assert.equal(h.salesCalls(), 2);
});

test('native card binds actual shift shop, explicit rest and informative notice without inferring rest', () => {
  const wxml = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/workbench/index.wxml'), 'utf8');
  assert.match(wxml, /\{\{shift\.shop\}\}/); assert.match(wxml, /shiftStatus === 'rest'/); assert.match(wxml, /\{\{shiftNotice\}\}/);
  for (const m of wxml.matchAll(/\bwx:(?:if|elif)="([^"]*)"/g)) assert.match(m[1], /^\{\{[\s\S]+\}\}$/);
});
