const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Round14 candidate contract; deployed backend alignment and GUI acceptance remain separate.
const root = path.join(__dirname, '../miniprogram');
const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
const SELF = '20000000-0000-4000-8000-000000000001';
const PEER = '20000000-0000-4000-8000-000000000002';
const plain = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const tap = (dataset) => ({ currentTarget: { dataset } });
const employee = (shopId = A) => ({ userId: SELF, scopeVersion: 3, shop: shopId ? { id: shopId, name: '会话店名不可替代班表店名' } : null });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function row(overrides = {}) {
  return Object.assign({
    work_date: '2026-10-16', shop_id: A, shop_name: '合成甲店', user_id: SELF,
    display_name: '合成员工甲', shift_code: 'A', shift_name: '甲店早班',
    start_time: '09:00:00', end_time: '17:00:00', source: 'manual', is_rest: false, is_self: true
  }, overrides);
}

function dto(overrides = {}) {
  return Object.assign({ month: '2026-10', shop_id: A, view: 'mine', can_view_shop: false, rows: [row()], conflicts: [] }, overrides);
}

function legacy(month = '2026-10') {
  return { month, schedules: [{ id: 'synthetic-shift', work_date: month + '-16', shop_id: A, shift_code: 'A' }],
    shift_defs: [{ shop_id: A, code: 'A', name: '合成早班', start_time: '09:00:00', end_time: '17:00:00' }] };
}

// Execute the real page and shared lifecycle shell; only app transport/session/wx are synthetic.
function nativePage(action = async () => dto(), initial = employee()) {
  let definition, current = initial, revision = 1, signOuts = 0;
  const calls = [], patches = [];
  const app = {
    preview: false,
    session: { get: () => current, revision: () => revision, signOut() { signOuts++; current = null; revision++; } },
    api: { async action(name, params) { calls.push({ name, params: plain(params) }); return action(name, params); } },
    ensureSession: async () => !!current
  };
  const wx = { setNavigationBarTitle() {}, stopPullDownRefresh() {}, reLaunch() {}, showToast() {} };
  const shell = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), {
    module: shell, wx, getApp: () => app
  }, { filename: 'shared/page.js' });
  const file = path.join(root, 'pages/schedule/index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { definition = value; }, wx, getApp: () => app, console, Date, setTimeout, clearTimeout,
    require(id) {
      if (id === '../../shared/page') return shell.exports;
      return require(path.resolve(path.dirname(file), id));
    }
  }, { filename: file });
  const page = Object.assign({}, definition, {
    data: structuredClone(definition.data),
    setData(values) { assert.notEqual(this._gone, true, 'unloaded page must not receive setData'); patches.push(plain(values)); Object.assign(this.data, values); }
  });
  return { page, calls, patches, signOuts: () => signOuts, changeIdentity(value = current) { current = value; revision++; } };
}

function switchView(page, view) {
  assert.equal(typeof page.onViewChange, 'function', 'pending contract needs the native read-only view handler');
  return Promise.resolve(page.onViewChange(tap({ view })));
}

function day(page, date) { return page.data.days.find((entry) => entry.date === date); }
function errorShown(page) { assert.match(page.data.error || '', /\S/, 'invalid or failed response must expose a retryable error'); }

test('baseline: existing month calendar still renders every day', async () => {
  const { page } = nativePage(async () => legacy());
  await page.onLoad({ month: '2026-10' });
  assert.equal(page.data.days.filter((entry) => entry.date).length, 31);
});

test('baseline: previous/next month handles year boundary and leap February', async () => {
  const { page } = nativePage(async (_, params) => legacy(params.month));
  await page.onLoad({ month: '2026-12' });
  await page.nextMonth();
  assert.equal(page.data.month, '2027-01');
  await page.previousMonth();
  assert.equal(page.data.month, '2026-12');
  await page.onMonthChange({ detail: { value: '2028-02' } });
  assert.equal(page.data.days.filter((entry) => entry.date).length, 29);
});

test('baseline: selecting a date and returning to whole month retains native filtering', async () => {
  const { page } = nativePage(async () => legacy());
  await page.onLoad({ month: '2026-10' });
  page.selectDay(tap({ date: '2026-10-17' }));
  assert.equal(page.data.visibleItems.length, 0);
  page.showMonth();
  assert.equal(page.data.visibleItems.length, 1);
});

test('pending contract: initial load explicitly requests mine without caller-supplied employee authority', async () => {
  const { page, calls } = nativePage();
  await page.onLoad({ month: '2026-10', view: 'shop', user_id: PEER });
  assert.deepEqual(calls, [{ name: 'schedule', params: { month: '2026-10', view: 'mine' } }]);
  assert.equal(page.data.view, 'mine');
});

test('pending contract: native rows preserve shift name and actual transferred shop', async () => {
  const { page } = nativePage(async () => dto({ rows: [row({ shop_id: B, shop_name: '合成乙店', shift_name: '乙店晚班' })] }));
  await page.onLoad({ month: '2026-10' });
  assert.equal(page.data.items.length, 1, 'raw RPC rows must be rendered');
  assert.equal(page.data.items[0].shop, '合成乙店');
  assert.equal(page.data.items[0].title, '乙店晚班');
  assert.equal(page.data.items[0].shopId, B);
  assert.equal(page.data.items[0].isSelf, true);
  assert.equal(page.data.error, '');
});

test('pending contract: explicit rest has no work time; missing day remains unscheduled', async () => {
  const rest = row({ work_date: '2026-10-17', source: 'day_off', is_rest: true, shift_code: null, shift_name: null, start_time: null, end_time: null });
  const { page } = nativePage(async () => dto({ rows: [row(), rest] }));
  await page.onLoad({ month: '2026-10' });
  assert.equal(page.data.items.length, 2);
  assert.equal(page.data.items[1].isRest, true);
  assert.equal(page.data.items[1].start, '');
  assert.equal(page.data.items[1].end, '');
  assert.equal(day(page, '2026-10-16').status, 'scheduled');
  assert.equal(day(page, '2026-10-17').status, 'rest');
  assert.equal(day(page, '2026-10-18').status, 'unscheduled');
});

test('pending contract: valid empty response is not a load failure or a whole month of rest', async () => {
  const { page } = nativePage(async () => dto({ rows: [] }));
  await page.onLoad({ month: '2026-10' });
  assert.equal(page.data.error, '');
  assert.equal(page.data.items.length, 0);
  assert.ok(page.data.days.filter((entry) => entry.date).every((entry) => entry.status === 'unscheduled'));
});

for (const value of [false, 'true', 1, null, undefined]) {
  test('pending contract: non-true shop permission stays locked: ' + typeof value + ':' + String(value), async () => {
    const { page, calls } = nativePage(async () => dto({ can_view_shop: value }));
    await page.onLoad({ month: '2026-10' });
    assert.equal(page.data.canViewShop, false);
    const before = calls.length;
    await switchView(page, 'shop');
    assert.equal(calls.length, before, 'locked shop view must issue zero requests');
    assert.equal(page.data.view, 'mine');
  });
}

test('pending contract: strict true opens selected-shop read view and permits no mutation action', async () => {
  const { page, calls } = nativePage(async (_, params) => dto({ view: params.view, can_view_shop: true, rows: params.view === 'shop' ? [row({ user_id: PEER, display_name: '合成员工乙', is_self: false })] : [row()] }));
  await page.onLoad({ month: '2026-10' });
  assert.equal(page.data.canViewShop, true);
  await switchView(page, 'shop');
  assert.equal(page.data.view, 'shop');
  assert.equal(calls.at(-1).params.view, 'shop');
  assert.equal(page.data.items[0].userId, PEER);
  assert.equal(page.data.items[0].shopId, A);
  assert.ok(calls.every((call) => call.name === 'schedule'));
  await switchView(page, 'mine');
  assert.equal(page.data.items[0].userId, SELF);
});

test('selected-shop guard: absent selected shop displays a clear error and never picks an arbitrary shop', async () => {
  const { page, calls } = nativePage(async () => dto({ shop_id: null, can_view_shop: true }), employee(null));
  await page.onLoad({ month: '2026-10' });
  assert.equal(page.data.items.length, 0);
  assert.match(page.data.error, /门店/);
  assert.equal(calls.length, 0);
  assert.equal(page.data.canViewShop, false);
  const before = calls.length;
  await switchView(page, 'shop');
  assert.equal(calls.length, before);
  assert.equal(page.data.view, 'mine');
});

test('pending contract: conflicts remain visible instead of trusting deduped rows as conflict-free', async () => {
  const { page } = nativePage(async () => dto({ conflicts: [{ work_date: '2026-10-16', user_id: SELF, count: 2 }] }));
  await page.onLoad({ month: '2026-10' });
  assert.deepEqual(plain(page.data.conflicts), [{ date: '2026-10-16', userId: SELF, count: 2 }]);
});

for (const [label, response] of [
  ['wrong month', dto({ month: '2026-11' })],
  ['foreign self claim', dto({ rows: [row({ user_id: PEER })] })],
  ['coworker in mine', dto({ rows: [row({ user_id: PEER, is_self: false })] })],
  ['outside-month row', dto({ rows: [row({ work_date: '2026-11-01' })] })],
  ['invalid day', dto({ rows: [row({ work_date: '2026-10-32' })] })],
  ['foreign mine conflict', dto({ conflicts: [{ work_date: '2026-10-16', user_id: PEER, count: 2 }] })]
]) {
  test('pending contract: rejects untrusted DTO: ' + label, async () => {
    const { page } = nativePage(async () => response);
    await page.onLoad({ month: '2026-10' });
    errorShown(page);
    assert.equal(page.data.items.length, 0);
    assert.equal(page.data.canViewShop, false);
  });
}

test('pending contract: shop response cannot mix another shop into the selected-store view', async () => {
  const { page } = nativePage(async (_, params) => dto({ view: params.view, can_view_shop: true, rows: params.view === 'shop' ? [row({ shop_id: B, user_id: PEER, is_self: false })] : [row()] }));
  await page.onLoad({ month: '2026-10' });
  await switchView(page, 'shop');
  errorShown(page);
  assert.equal(page.data.items.length, 0);
});

test('pending contract: store context mismatch is rejected even for empty shop rows', async () => {
  const { page } = nativePage(async (_, params) => dto({ view: params.view, can_view_shop: true, shop_id: params.view === 'shop' ? B : A, rows: [] }));
  await page.onLoad({ month: '2026-10' });
  await switchView(page, 'shop');
  errorShown(page);
  assert.equal(page.data.items.length, 0);
});

test('pending contract: permission revocation removes coworkers and resets shop mode', async () => {
  let revoked = false;
  const { page } = nativePage(async (_, params) => dto({ view: params.view, can_view_shop: !revoked, rows: revoked ? [] : [row(params.view === 'shop' ? { user_id: PEER, is_self: false } : {})] }));
  await page.onLoad({ month: '2026-10' });
  await switchView(page, 'shop');
  revoked = true;
  await page.retry();
  assert.equal(page.data.canViewShop, false);
  assert.equal(page.data.view, 'mine');
  assert.ok(page.data.items.every((entry) => entry.userId === SELF));
});

test('pending contract: denied shop read clears old coworkers and remains retryable', async () => {
  let denied = false;
  const { page } = nativePage(async (_, params) => {
    if (denied) throw Object.assign(new Error('当前门店无查看权限'), { status: 403 });
    return dto({ view: params.view, can_view_shop: true, rows: [row(params.view === 'shop' ? { user_id: PEER, is_self: false } : {})] });
  });
  await page.onLoad({ month: '2026-10' });
  await switchView(page, 'shop');
  denied = true;
  await page.retry();
  errorShown(page);
  assert.equal(page.data.items.length, 0);
  assert.equal(page.data.canViewShop, false);
});

test('pending contract: failed read has no fake empty success and retry retains requested month', async () => {
  let failing = true;
  const { page, calls } = nativePage(async () => {
    if (failing) throw new Error('合成网络失败');
    return dto();
  });
  await page.onLoad({ month: '2026-10' });
  errorShown(page);
  assert.equal(page.data.items.length, 0);
  failing = false;
  await page.retry();
  assert.equal(calls.at(-1).params.month, '2026-10');
  assert.equal(calls.at(-1).params.view, 'mine');
  assert.equal(page.data.items.length, 1);
  assert.equal(page.data.error, '');
});

test('pending contract: selecting dates still filters new RPC rows and crosses month correctly', async () => {
  const { page } = nativePage(async (_, params) => dto({ month: params.month, rows: [row({ work_date: params.month + '-16' })] }));
  await page.onLoad({ month: '2026-10' });
  page.selectDay(tap({ date: '2026-10-16' }));
  assert.equal(page.data.visibleItems.length, 1);
  await page.nextMonth();
  assert.equal(page.data.selectedDate, '');
  assert.equal(page.data.items[0].date, '2026-11-16');
  assert.equal(page.data.days.filter((entry) => entry.date).length, 30);
});

test('pending contract: late month response cannot replace the newly chosen month', async () => {
  const old = deferred();
  const { page } = nativePage(async (_, params) => params.month === '2026-10' ? old.promise : dto({ month: params.month, rows: [row({ work_date: '2026-11-16' })] }));
  const pending = page.onLoad({ month: '2026-10' });
  await page.nextMonth();
  old.resolve(dto());
  await pending;
  assert.equal(page.data.month, '2026-11');
  assert.equal(page.data.items[0] && page.data.items[0].date, '2026-11-16');
  assert.equal(page.data.error, '');
});

test('pending contract: late shop read and finally cannot overwrite active mine read', async () => {
  const shop = deferred(), mine = deferred();
  let first = true;
  const { page } = nativePage(async (_, params) => {
    if (first) { first = false; return dto({ can_view_shop: true }); }
    return params.view === 'shop' ? shop.promise : mine.promise;
  });
  await page.onLoad({ month: '2026-10' });
  assert.equal(page.data.canViewShop, true, 'shop read must first be authorized');
  const old = switchView(page, 'shop');
  const current = switchView(page, 'mine');
  try {
    shop.resolve(dto({ can_view_shop: true, rows: [row({ user_id: PEER, is_self: false })] }));
    await old;
    assert.equal(page.data.loading, true, 'old finally must not finish the new read');
    assert.equal(page.data.items.length, 0);
    mine.resolve(dto());
    await current;
    assert.equal(page.data.items[0].userId, SELF);
  } finally {
    shop.resolve(dto());
    mine.resolve(dto());
    await Promise.allSettled([old, current]);
  }
});

test('pending contract: changing selected shop revokes cached permission before new mine response', async () => {
  const old = deferred(), fresh = deferred();
  let calls = 0;
  const harness = nativePage(async () => ++calls === 1 ? dto({ can_view_shop: true }) : calls === 2 ? old.promise : fresh.promise);
  const { page } = harness;
  await page.onLoad({ month: '2026-10' });
  assert.equal(page.data.canViewShop, true, 'old selected shop must first be authorized');
  const pending = switchView(page, 'shop');
  harness.changeIdentity(employee(B));
  const active = page.onShow();
  try {
    assert.equal(page.data.view, 'mine');
    assert.equal(page.data.canViewShop, false);
    assert.equal(page.data.items.length, 0);
    old.resolve(dto({ can_view_shop: true, rows: [row({ user_id: PEER, is_self: false })] }));
    await pending;
    assert.equal(page.data.items.length, 0);
    assert.equal(page.data.loading, true);
    fresh.resolve(dto({ shop_id: B, rows: [row({ shop_id: B, shop_name: '合成乙店' })] }));
    await active;
    assert.equal(page.data.items[0].shopId, B);
  } finally {
    old.resolve(dto());
    fresh.resolve(dto({ shop_id: B, rows: [] }));
    await Promise.allSettled([pending, active]);
  }
});

test('pending contract: same employee relogin revision isolates late success and 401', async () => {
  for (const reject of [false, true]) {
    const old = deferred();
    let first = true;
    const harness = nativePage(async () => { if (first) { first = false; return old.promise; } return dto({ rows: [row({ shift_name: '新会话班次' })] }); });
    const { page } = harness;
    const pending = page.onLoad({ month: '2026-10' });
    harness.changeIdentity();
    await page.onShow();
    if (reject) old.reject(Object.assign(new Error('旧登录失效'), { status: 401 })); else old.resolve(dto());
    await pending;
    assert.equal(page.data.items[0] && page.data.items[0].title, '新会话班次');
    assert.equal(harness.signOuts(), 0);
    assert.equal(page.data.error, '');
  }
});

test('pending contract: unloaded page ignores late success and error without setData', async () => {
  for (const reject of [false, true]) {
    const pending = deferred();
    const { page, patches } = nativePage(async () => pending.promise);
    const loading = page.onLoad({ month: '2026-10' });
    page.onUnload();
    const before = patches.length;
    if (reject) pending.reject(new Error('卸载后失败')); else pending.resolve(dto());
    await loading;
    assert.equal(patches.length, before);
  }
});

test('pending contract: native template binds read-only view, explicit rest and conflicts', () => {
  const source = fs.readFileSync(path.join(root, 'pages/schedule/index.wxml'), 'utf8');
  assert.match(source, /canViewShop/);
  assert.match(source, /bindtap="onViewChange"/);
  assert.match(source, /isRest/);
  assert.match(source, /wx:for="\{\{visibleConflicts\}\}"/);
  assert.doesNotMatch(source, /<web-view|schedule\.write|generate-schedule/);
});

test('v2: a mismatched view receipt cannot display another projection', async () => {
  const { page } = nativePage(async () => dto({ view: 'shop', can_view_shop: true }));
  await page.onLoad({ month: '2026-10' });
  errorShown(page);
  assert.equal(page.data.items.length, 0);
  assert.equal(page.data.canViewShop, false);
});

test('v2: legacy backend DTO never grants shop view even with a forged client flag', async () => {
  const { page, calls } = nativePage(async () => legacy());
  await page.onLoad({ month: '2026-10' });
  assert.equal(page.data.items.length, 1);
  assert.equal(page.data.canViewShop, false);
  page.setData({ canViewShop: true });
  const before = calls.length;
  await switchView(page, 'shop');
  assert.equal(calls.length, before);
  assert.equal(page.data.view, 'mine');
});

test('v2: malformed new rows cannot downgrade to otherwise valid legacy schedules', async () => {
  const { page } = nativePage(async () => Object.assign(legacy(), dto({ rows: null })));
  await page.onLoad({ month: '2026-10' });
  errorShown(page);
  assert.equal(page.data.items.length, 0);
});

for (const count of ['2', null, NaN, 1]) {
  test('v2: conflict count is never coerced or invented: ' + String(count), async () => {
    const { page } = nativePage(async () => dto({ conflicts: [{ work_date: '2026-10-16', user_id: SELF, count }] }));
    await page.onLoad({ month: '2026-10' });
    errorShown(page);
    assert.deepEqual(plain(page.data.conflicts), []);
  });
}

test('v2: non-boolean is_rest cannot become a rest day from source or truthiness', async () => {
  const { page } = nativePage(async () => dto({ rows: [row({ is_rest: 'true', source: 'day_off' })] }));
  await page.onLoad({ month: '2026-10' });
  errorShown(page);
  assert.equal(page.data.items.length, 0);
});

test('v2: RPC rows without ids receive distinct stable display keys', async () => {
  const { page } = nativePage(async () => dto({ rows: [row(), row({ work_date: '2026-10-17' })] }));
  await page.onLoad({ month: '2026-10' });
  assert.equal(page.data.items.length, 2);
  const ids = plain(page.data.items.map((entry) => entry.id));
  assert.equal(new Set(ids).size, 2);
  assert.ok(ids.every((id) => id && id !== 'undefined'));
  await page.retry();
  assert.deepEqual(plain(page.data.items.map((entry) => entry.id)), ids);
});

test('v2: shop failure clears coworkers but retry keeps the requested shop view', async () => {
  let failing = false;
  const { page, calls } = nativePage(async (_, params) => {
    if (failing) throw new Error('合成门店网络失败');
    return dto({ view: params.view, can_view_shop: true, rows: [row(params.view === 'shop' ? { user_id: PEER, is_self: false } : {})] });
  });
  await page.onLoad({ month: '2026-10' });
  await switchView(page, 'shop');
  failing = true;
  await page.retry();
  assert.equal(page.data.view, 'shop');
  assert.equal(page.data.items.length, 0);
  errorShown(page);
  failing = false;
  await page.retry();
  assert.equal(calls.at(-1).params.view, 'shop');
  assert.equal(page.data.items[0].userId, PEER);
});

test('v2: hide invalidates pending reads and hidden retry issues no request', async () => {
  for (const reject of [false, true]) {
    const old = deferred();
    let first = true;
    const { page, calls, patches } = nativePage(async () => {
      if (first) { first = false; return old.promise; }
      return dto();
    });
    const pending = page.onLoad({ month: '2026-10' });
    assert.equal(typeof page.onHide, 'function');
    page.onHide();
    const before = patches.length;
    await page.retry();
    assert.equal(calls.length, 1);
    if (reject) old.reject(new Error('隐藏后失败')); else old.resolve(dto());
    await pending;
    assert.equal(patches.length, before);
    assert.equal(page.data.items.length, 0);
    await page.onShow();
    assert.equal(page.data.items.length, 1);
  }
});

for (const event of ['selectDay', 'showMonth', 'onViewChange']) {
  test('v2: late native ' + event + ' after revision change clears old identity before repaint', async () => {
    const fresh = deferred();
    let first = true;
    const harness = nativePage(async () => { if (first) { first = false; return dto({ can_view_shop: true }); } return fresh.promise; });
    const { page } = harness;
    await page.onLoad({ month: '2026-10' });
    assert.equal(page.data.items.length, 1);
    harness.changeIdentity(employee(B));
    const loading = event === 'selectDay' ? page.selectDay(tap({ date: '2026-10-16' })) : event === 'showMonth' ? page.showMonth() : page.onViewChange(tap({ view: 'shop' }));
    try {
      assert.equal(page.data.items.length, 0);
      assert.equal(page.data.canViewShop, false);
      assert.equal(page.data.view, 'mine');
    } finally {
      fresh.resolve(dto({ shop_id: B, rows: [] }));
      await loading;
    }
  });
}

for (const reject of [false, true]) {
  test('v2: revision change without onShow suppresses old loading finally: ' + reject, async () => {
    const old = deferred();
    const harness = nativePage(async () => old.promise);
    const { page, patches } = harness;
    const pending = page.onLoad({ month: '2026-10' });
    harness.changeIdentity();
    const before = patches.length;
    if (reject) old.reject(Object.assign(new Error('旧会话失败'), { status: 401 })); else old.resolve(dto());
    await pending;
    assert.equal(patches.length, before, 'even an old loading reset belongs to the previous revision');
    assert.equal(harness.signOuts(), 0);
  });
}

for (const [label, identity] of [
  ['identity absent', {}],
  ['explicit own user', { user_id: SELF }],
  ['explicit self boolean', { is_self: true }],
  ['both explicit and consistent', { user_id: SELF, is_self: true }]
]) {
  test('legacy identity: accepts ' + label + ' without granting shop access', async () => {
    const response = legacy();
    Object.assign(response.schedules[0], identity, { note: '本人合成备注' });
    const { page } = nativePage(async () => response);
    await page.onLoad({ month: '2026-10' });
    assert.equal(page.data.error, '');
    assert.equal(page.data.items.length, 1);
    assert.equal(page.data.items[0].userId, SELF);
    assert.equal(page.data.items[0].note, '本人合成备注');
    assert.equal(page.data.canViewShop, false);
  });
}

for (const [label, identity] of [
  ['other user and non-self', { user_id: PEER, is_self: false }],
  ['other user even with self true', { user_id: PEER, is_self: true }],
  ['null user', { user_id: null }],
  ['provided undefined user', { user_id: undefined }],
  ['numeric user', { user_id: 1 }],
  ['explicit non-self', { is_self: false }],
  ['string self', { is_self: 'true' }],
  ['numeric self', { is_self: 1 }],
  ['null self', { is_self: null }],
  ['provided undefined self', { is_self: undefined }]
]) {
  test('legacy identity: rejects the entire response for ' + label, async () => {
    let invalid = false;
    const response = legacy();
    response.schedules.push(Object.assign({}, response.schedules[0], identity, {
      id: 'synthetic-conflicting-identity', work_date: '2026-10-17', note: '不可展示的合成他人备注'
    }));
    const { page } = nativePage(async () => invalid ? response : legacy());
    await page.onLoad({ month: '2026-10' });
    assert.equal(page.data.items.length, 1);
    invalid = true;
    await page.retry();
    errorShown(page);
    assert.equal(page.data.items.length, 0);
    assert.equal(page.data.visibleItems.length, 0);
    assert.equal(page.data.groups.length, 0);
    assert.doesNotMatch(JSON.stringify(page.data), /不可展示的合成他人备注/);
  });
}

for (const [label, conflict] of [
  ['foreign user without a row', { work_date: '2026-10-16', user_id: SELF, count: 2 }],
  ['same user on an unassociated date', { work_date: '2026-10-17', user_id: PEER, count: 2 }],
  ['matching date/user but explicitly another shop', { work_date: '2026-10-16', user_id: PEER, count: 2, shop_id: B }]
]) {
  test('shop conflicts: rejects ' + label + ' before exposing any rows or conflicts', async () => {
    const { page } = nativePage(async (_, params) => params.view === 'mine' ? dto({ can_view_shop: true }) : dto({
      view: 'shop', can_view_shop: true,
      rows: [row({ user_id: PEER, is_self: false })], conflicts: [conflict]
    }));
    await page.onLoad({ month: '2026-10' });
    await switchView(page, 'shop');
    errorShown(page);
    assert.equal(page.data.items.length, 0);
    assert.deepEqual(plain(page.data.conflicts), []);
    assert.deepEqual(plain(page.data.visibleConflicts), []);
    assert.equal(page.data.canViewShop, false);
  });
}

for (const includeShop of [false, true]) {
  test('shop conflicts: associated original server count is retained; explicit shop=' + includeShop, async () => {
    const conflict = { work_date: '2026-10-16', user_id: PEER, count: 4 };
    if (includeShop) conflict.shop_id = A;
    const { page } = nativePage(async (_, params) => params.view === 'mine' ? dto({ can_view_shop: true }) : dto({
      view: 'shop', can_view_shop: true,
      rows: [row({ user_id: PEER, is_self: false })], conflicts: [conflict]
    }));
    await page.onLoad({ month: '2026-10' });
    await switchView(page, 'shop');
    assert.equal(page.data.error, '');
    assert.equal(page.data.items.length, 1);
    assert.deepEqual(plain(page.data.conflicts), [{ date: '2026-10-16', userId: PEER, count: 4 }]);
  });
}
