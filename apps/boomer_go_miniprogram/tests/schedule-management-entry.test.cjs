const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../miniprogram');
const SHOP = '00000000-0000-4000-8000-000000000101';
const OTHER = '00000000-0000-4000-8000-000000000102';
const USER = '00000000-0000-4000-8000-000000000103';
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function employee(shop = SHOP) {
  return { userId: USER, scopeVersion: 3, shop: shop ? { id: shop, name: '合成当前店' } : null, shops: [{ id: SHOP }],
    bootstrap: { staff_profile: { shop_id: SHOP } }, permissions: ['schedule.write'], role: 'super_admin' };
}
function month(params = {}, extra = {}) {
  return { month: params.month || '2026-10', view: params.view || 'mine', shop_id: SHOP, can_view_shop: false, rows: [], conflicts: [], ...extra };
}
function capabilities(extra = {}) {
  return { shop_id: SHOP, can_view: true, can_arrange: true,
    implemented_operations: ['create', 'update', 'delete'], server_time: '2026-10-16T04:00:00Z',
    existing_permissions: { shift_write: false, dayoff_write: false, swap: true, clear_week: true, ai_schedule: true }, ...extra };
}
function harness(options = {}) {
  let definition, current = options.user === undefined ? employee() : options.user, revision = 1, signOuts = 0;
  const calls = [], patches = [], navigations = [], relaunches = [];
  const app = { preview: !!options.preview,
    session: { get: () => current, revision: () => revision, signOut() { signOuts++; current = null; revision++; } },
    ensureSession: async () => !!current,
    api: { action(name, params) {
      calls.push({ name, params: plain(params) });
      if (options.action) return options.action(name, params);
      if (name === 'schedule') return Promise.resolve(month(params));
      if (name === 'schedule-manage-capabilities') return Promise.resolve(capabilities());
      throw new Error('Unexpected synthetic action: ' + name);
    } }
  };
  const wx = { stopPullDownRefresh() {}, reLaunch(value) { relaunches.push(value); },
    navigateTo(value) { navigations.push(value.url); }, switchTab() {} };
  const shell = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module: shell, wx, getApp: () => app });
  const file = path.join(root, 'pages/schedule/index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { definition = value; }, wx, getApp: () => app, Date,
    require(id) { return id === '../../shared/page' ? shell.exports : require(path.resolve(path.dirname(file), id)); }
  }, { filename: file });
  const page = Object.assign({}, definition, { data: structuredClone(definition.data),
    setData(value) { assert.notEqual(this._gone, true, 'unloaded page must not render'); patches.push(plain(value)); Object.assign(this.data, value); } });
  return { page, calls, patches, navigations, relaunches, signOuts: () => signOuts,
    load: () => page.onLoad({ month: '2026-10' }),
    change(value = current) { current = value; revision++; },
    capCalls: () => calls.filter(c => c.name === 'schedule-manage-capabilities') };
}
function open(page) { assert.equal(typeof page.openManagementEntry, 'function'); return page.openManagementEntry({ currentTarget: { dataset: { shop_id: OTHER, can_arrange: true } } }); }

test('personal month starts first, paints and settles while capabilities remain unresolved', async () => {
  const cap = deferred();
  const h = harness({ action: (name, params) => name === 'schedule' ? Promise.resolve(month(params)) : cap.promise });
  let settled = false;
  const read = h.load().then(() => { settled = true; });
  await tick();
  try {
    assert.equal(h.calls[0].name, 'schedule'); assert.equal(h.capCalls().length, 1);
    assert.equal(settled, true); assert.equal(h.page.data.loading, false); assert.equal(h.page.data.days.filter(d => d.date).length, 31);
    assert.equal(h.page.data.managementEntryVisible, false);
  } finally { cap.resolve(capabilities()); await read; await tick(); }
});

test('capabilities also start before a pending personal month resolves', async () => {
  const read = deferred();
  const h = harness({ action: name => name === 'schedule' ? read.promise : Promise.resolve(capabilities()) });
  const loading = h.load(); await tick();
  try { assert.equal(h.capCalls().length, 1); assert.equal(h.page.data.managementEntryVisible, true); }
  finally { read.resolve(month()); await loading; }
});

test('initial onLoad/onShow deduplicates the active capability flight', async () => {
  const cap = deferred();
  const h = harness({ action: (name, params) => name === 'schedule' ? Promise.resolve(month(params)) : cap.promise });
  const read = h.load(); await h.page.onShow(); await read;
  try { assert.equal(h.capCalls().length, 1); }
  finally { cap.resolve(capabilities()); await tick(); }
});

for (const [view, arrange, label] of [[true, true, '管理'], [true, false, '只读'], [false, true, ''], [false, false, '']]) {
  test('independent server view=' + view + ' arrange=' + arrange + ' controls entry and label', async () => {
    const h = harness({ action: (name, params) => Promise.resolve(name === 'schedule' ? month(params, { can_view_shop: true }) : capabilities({ can_view: view, can_arrange: arrange })) });
    await h.load(); await tick();
    assert.equal(h.page.data.managementEntryVisible, view);
    if (view) { assert.match(h.page.data.managementEntryLabel, new RegExp(label)); open(h.page); assert.deepEqual(h.navigations, ['/pages/schedule-manage/index']); }
    else { open(h.page); assert.deepEqual(h.navigations, []); }
  });
}

for (const status of ['rest', 'unscheduled']) test('no selected shop ' + status + ' makes zero management calls without home fallback', async () => {
  const user = employee(null); user.bootstrap.shop_context = { status, effective_shop: null };
  const h = harness({ user, action: (name, params) => Promise.resolve(month(params, { shop_id: null })) });
  await h.load(); await h.page.onShow(); await tick();
  assert.equal(h.capCalls().length, 0); assert.equal(h.page.data.loading, false); assert.equal(h.page.data.error, '');
  assert.equal(h.page.data.managementEntryVisible, false); open(h.page); assert.equal(h.navigations.length, 0);
});

test('missing employee session makes zero management calls', async () => {
  const h = harness({ user: null }); await h.load(); await tick();
  assert.equal(h.capCalls().length, 0); assert.equal(h.page.data.managementEntryVisible, false);
});

const invalid = [
  ['string view', { can_view: 'true' }], ['numeric view', { can_view: 1 }], ['missing view', { can_view: undefined }],
  ['string arrange', { can_arrange: 'false' }], ['null arrange', { can_arrange: null }], ['missing arrange', { can_arrange: undefined }],
  ['foreign shop', { shop_id: OTHER }], ['null shop', { shop_id: null }],
  ['missing operations', { implemented_operations: undefined }], ['partial operations', { implemented_operations: ['create', 'update'] }],
  ['duplicate operation', { implemented_operations: ['create', 'create', 'delete'] }], ['extra operation', { implemented_operations: ['create', 'update', 'delete', 'clear'] }],
  ['invalid time', { server_time: 'not-a-time' }], ['missing time', { server_time: undefined }]
];
for (const [label, extra] of invalid) test('malformed capability ' + label + ' hides entry without corrupting month', async () => {
  const h = harness({ action: (name, params) => Promise.resolve(name === 'schedule' ? month(params, { can_view_shop: true }) : capabilities(extra)) });
  await h.load(); await tick();
  assert.equal(h.page.data.managementEntryVisible, false); assert.equal(h.page.data.canViewShop, true);
  assert.equal(h.page.data.error, ''); assert.equal(h.page.data.loading, false); open(h.page); assert.equal(h.navigations.length, 0);
});

for (const status of [403, 500, undefined]) test('capability failure ' + status + ' neither replaces successful month nor its loading state', async () => {
  const h = harness({ action: (name, params) => name === 'schedule' ? Promise.resolve(month(params)) : Promise.reject(Object.assign(new Error('private cap error'), { status })) });
  await h.load(); await tick();
  assert.equal(h.page.data.managementEntryVisible, false); assert.equal(h.page.data.error, ''); assert.equal(h.page.data.loading, false);
  assert.doesNotMatch(JSON.stringify(h.page.data), /private cap error/); assert.equal(h.signOuts(), 0);
});

test('capability success or failure cannot replace the personal month error', async () => {
  for (const failing of [false, true]) {
    const h = harness({ action: name => name === 'schedule' ? Promise.reject(new Error('personal month failure')) : failing ? Promise.reject(new Error('private cap failure')) : Promise.resolve(capabilities()) });
    await h.load(); await tick(); assert.equal(h.page.data.error, 'personal month failure'); assert.equal(h.page.data.loading, false);
  }
});

for (const lifecycle of ['onHide', 'onUnload']) test(lifecycle + ' immediately clears a validated entry without later rendering', async () => {
  const h = harness(); await h.load(); await tick(); assert.equal(h.page.data.managementEntryVisible, true);
  h.page[lifecycle](); assert.equal(h.page.data.managementEntryVisible, false); assert.equal(h.page.data.managementEntryLabel, '');
  const patches = h.patches.length; open(h.page); await h.page.retry();
  assert.equal(h.navigations.length, 0); assert.equal(h.patches.length, patches);
});

for (const change of ['onHide', 'onUnload', 'identity', 'revision', 'shop', 'no-shop']) {
  test('late capabilities after ' + change + ' cannot expose or authorize the old entry', async () => {
    const cap = deferred(); const h = harness({ action: (name, params) => name === 'schedule' ? Promise.resolve(month(params)) : cap.promise });
    await h.load();
    if (change === 'identity') h.change({ ...employee(), userId: OTHER });
    else if (change === 'revision') h.change();
    else if (change === 'shop') h.change(employee(OTHER));
    else if (change === 'no-shop') h.change(employee(null));
    else h.page[change]();
    const patches = h.patches.length; cap.resolve(capabilities()); await tick();
    assert.equal(h.page.data.managementEntryVisible, false); assert.equal(h.patches.length, patches);
    open(h.page); assert.equal(h.navigations.length, 0);
  });
}

for (const change of ['identity', 'revision', 'shop', 'no-shop']) test('direct click after ' + change + ' rejects and clears prior validated capability', async () => {
  const h = harness(); await h.load(); await tick();
  if (change === 'identity') h.change({ ...employee(), userId: OTHER });
  else if (change === 'revision') h.change();
  else h.change(employee(change === 'shop' ? OTHER : null));
  open(h.page); assert.equal(h.navigations.length, 0); assert.equal(h.page.data.managementEntryVisible, false);
});

test('forged display state and can_view_shop never create a private capability', async () => {
  const h = harness({ action: (name, params) => Promise.resolve(name === 'schedule' ? month(params, { can_view_shop: true }) : capabilities({ can_view: false })) });
  await h.load(); await tick(); h.page.setData({ managementEntryVisible: true, managementEntryLabel: '管理排班', canViewShop: true });
  open(h.page); assert.equal(h.navigations.length, 0); assert.equal(h.page.data.managementEntryVisible, false);
});

test('show after hide can start a fresh cap flight without waiting for the old one', async () => {
  const old = deferred(); let caps = 0;
  const h = harness({ action: (name, params) => name === 'schedule' ? Promise.resolve(month(params)) : ++caps === 1 ? old.promise : Promise.resolve(capabilities({ can_arrange: false })) });
  await h.load(); h.page.onHide(); await h.page.onShow(); await tick();
  assert.equal(h.capCalls().length, 2); assert.match(h.page.data.managementEntryLabel, /只读/);
  old.resolve(capabilities()); await tick(); assert.match(h.page.data.managementEntryLabel, /只读/);
});

test('current capability 401 uses shared run logout without replacing month error', async () => {
  const cap = deferred(); const h = harness({ action: (name, params) => name === 'schedule' ? Promise.resolve(month(params)) : cap.promise });
  await h.load(); cap.reject(Object.assign(new Error('private auth failure'), { status: 401, requestRevision: 1 })); await tick();
  assert.equal(h.signOuts(), 1); assert.equal(h.relaunches.length, 1); assert.equal(h.page.data.managementEntryVisible, false); assert.equal(h.page.data.error, '');
});

for (const change of ['onHide', 'onUnload', 'identity', 'revision', 'shop']) test('late capability 401 after ' + change + ' never logs out a current identity', async () => {
  const cap = deferred(); const h = harness({ action: (name, params) => name === 'schedule' ? Promise.resolve(month(params)) : cap.promise });
  await h.load();
  if (change === 'identity') h.change({ ...employee(), userId: OTHER });
  else if (change === 'revision') h.change();
  else if (change === 'shop') h.change(employee(OTHER));
  else h.page[change]();
  const patches = h.patches.length; cap.reject(Object.assign(new Error('private old auth'), { status: 401, requestRevision: 1 })); await tick();
  assert.equal(h.signOuts(), 0); assert.equal(h.relaunches.length, 0); assert.equal(h.patches.length, patches);
});

test('mismatching requestRevision 401 cannot log out or replace current month error', async () => {
  const h = harness({ action: (name, params) => name === 'schedule' ? Promise.resolve(month(params)) : Promise.reject(Object.assign(new Error('old request'), { status: 401, requestRevision: 0 })) });
  await h.load(); await tick(); assert.equal(h.signOuts(), 0); assert.equal(h.page.data.error, ''); assert.equal(h.page.data.managementEntryVisible, false);
});

test('entry sends only the selected session shop and native navigation never trusts event parameters', async () => {
  const h = harness(); await h.load(); await tick();
  assert.deepEqual(h.capCalls(), [{ name: 'schedule-manage-capabilities', params: { shop_id: SHOP } }]);
  open(h.page); assert.deepEqual(h.navigations, ['/pages/schedule-manage/index']);
});

test('native secondary entry uses a dynamic guard and an existing-style accessible button', () => {
  const wxml = fs.readFileSync(path.join(root, 'pages/schedule/index.wxml'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'pages/schedule/index.wxss'), 'utf8');
  assert.match(wxml, /wx:if="\{\{managementEntryVisible\}\}"/);
  assert.match(wxml, /bindtap="openManagementEntry"/); assert.match(wxml, /\{\{managementEntryLabel\}\}/);
  assert.match(css, /\.management-entry-action[^}]*min-height:\s*(?:88|100)rpx/);
  for (const match of wxml.matchAll(/wx:(?:if|elif)="([^"]*)"/g)) assert.match(match[1], /^\{\{[\s\S]*\}\}$/);
});
