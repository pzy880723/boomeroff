const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../miniprogram');
const SHOP = '10000000-0000-4000-8000-000000000001';
const OTHER_SHOP = '10000000-0000-4000-8000-000000000002';
const USER = '20000000-0000-4000-8000-000000000001';
const ACT = '30000000-0000-4000-8000-000000000031';
const ID = n => '40000000-0000-4000-8000-' + String(n).padStart(12, '0');
const plain = value => JSON.parse(JSON.stringify(value));
const tap = data => ({ currentTarget: { dataset: data } });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function detail(shop = SHOP) {
  return { item: { id: ACT, shop_id: shop, name: '合成员工活动', description: '完整活动说明\n第二段真实说明', status: 'paused', platform: 'xiaohongshu',
    starts_at: '2026-10-16T01:00:00Z', ends_at: '2026-10-31T12:00:00Z', created_at: '2026-10-15T00:00:00Z',
    max_applications: 20, requires_review: true, min_followers: 0, form_fields: [{ key: 'profile', label: '主页截图', type: 'image' }],
    share_token: 'unnecessary-share-capability', form_data: { secret: 'raw-answer-must-not-store' } } };
}
function caps(shop = SHOP, overrides = {}) { return { shop_id: shop, can_manage: true, can_confirm_publish: true, can_upload_evidence: false, ...overrides }; }
function application(n = 1, confirmed = false) {
  return { id: ID(n), activity_id: ACT, activity_name: '合成员工活动', status: 'approved', created_at: '2026-10-16T02:00:00Z',
    applicant_name_masked: '张*', applicant_phone_tail: '1234', publish_confirmed: confirmed, publish_confirmed_at: confirmed ? '2026-10-16T03:00:00Z' : null,
    has_publish_url: true, publish_screenshot_count: 2, applicant_name: 'raw-name-must-not-store', applicant_phone: 'raw-phone-must-not-store', answers: 'raw-answer-must-not-store' };
}
function applications(params, items = [application()], more = false, cursor = null) {
  return { shop_id: params.shop_id, activity_id: ACT, publish_confirmed: params.publish_confirmed === undefined ? null : params.publish_confirmed,
    items, next_cursor: cursor, has_more: more, order: 'desc' };
}
function fixture(handlers = {}, options = {}) {
  const file = path.join(root, 'pages/activity/index.js');
  assert.ok(fs.existsSync(file), 'native activity page must exist');
  let definition, revision = 1, current = options.noUser ? null : options.current || { userId: USER, shop: options.noShop ? null : { id: SHOP }, scopeVersion: 3 };
  const calls = [], patches = [], navigations = [], redirects = [];
  const session = { get: () => current, revision: () => revision, signOut() { revision++; current = null; } };
  const api = { async action(name, params) {
    calls.push([name, plain(params)]);
    if (handlers[name]) return handlers[name](params);
    if (name === 'activity-detail') return detail(params.shop_id);
    if (name === 'activity-capabilities') return caps(params.shop_id);
    if (name === 'activity-applications') return applications(params, params.publish_confirmed === true ? [] : [application()]);
    assert.fail('unexpected or mutating action ' + name);
  } };
  const wx = { setNavigationBarTitle() {}, stopPullDownRefresh() {}, reLaunch(value) { redirects.push(value.url); }, navigateTo(value) { navigations.push(value.url); } };
  const app = { session, api, preview: !!options.preview, enablePreview() { this.preview = true; }, ensureSession: async () => !!current };
  const context = vm.createContext({ wx, getApp: () => app, Page: value => { definition = value; }, console });
  const shell = vm.runInContext('(function(module){' + fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8') + ';return module.exports;})({exports:{}})', context);
  const local = createRequire(file);
  context.require = name => name === '../../shared/page' ? shell : local(name);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  const p = { ...definition, data: plain(definition.data), setData(value) {
    assert.notEqual(this._gone, true, 'unloaded page must not receive setData');
    patches.push(plain(value)); Object.assign(this.data, value);
  } };
  return { p, calls, patches, navigations, redirects,
    change(kind) { revision++; if (kind === 'shop') current = { ...current, shop: { id: OTHER_SHOP } }; if (kind === 'user') current = { ...current, userId: ID(99) }; if (kind === 'scope') current = { ...current, scopeVersion: 4 }; },
    async open() { const first = p.onLoad({ id: options.id === undefined ? ACT : options.id }); const second = p.onShow(); await Promise.all([first, second]); }
  };
}

test('basic detail, capabilities and masked list load once; paused is not a manage ban', async () => {
  const f = fixture(); await f.open();
  assert.deepEqual(f.calls.map(x => x[0]), ['activity-detail', 'activity-capabilities', 'activity-applications']);
  assert.deepEqual(f.calls[2][1], { shop_id: SHOP, activity_id: ACT, limit: 20 });
  assert.equal(f.p.data.activity.name, '合成员工活动');
  assert.match(f.p.data.activity.description, /第二段真实说明/);
  assert.match(f.p.data.activity.startsAt, /2026-10-16 09:00/);
  assert.equal(f.p.data.canManage, true);
  assert.equal(f.p.data.applications[0].publishConfirmed, false);
  assert.match(f.p.data.applications[0].statusLabel, /通过/);
  assert.doesNotMatch(JSON.stringify(f.p), /raw-name-must-not-store|raw-phone-must-not-store|raw-answer-must-not-store|unnecessary-share-capability/);
});

for (const value of [false, 'true', 1, null, undefined]) {
  test('capability strictly gates the list: ' + typeof value + ':' + value, async () => {
    const f = fixture({ 'activity-capabilities': params => caps(params.shop_id, { can_manage: value }) }); await f.open();
    assert.equal(f.p.data.activity.id, ACT);
    assert.equal(f.p.data.canManage, false);
    assert.equal(f.calls.filter(x => x[0] === 'activity-applications').length, 0);
    if (value === false) assert.equal(f.p.data.capabilitiesLoaded, true); else assert.ok(f.p.data.capabilitiesError);
    f.p.setData({ canManage: true }); await f.p.onFilterChange(tap({ filter: 'confirmed' }));
    assert.equal(f.calls.filter(x => x[0] === 'activity-applications').length, 0);
  });
}

for (const options of [{ id: '' }, { id: 'not-uuid' }, { noShop: true }, { noUser: true }]) {
  test('invalid entry has zero requests: ' + JSON.stringify(options), async () => {
    const f = fixture({}, options); await f.open(); await f.p.loadMoreApplications();
    assert.equal(f.calls.length, 0); assert.ok(f.p.data.basicError);
  });
}

for (const mismatch of ['id', 'shop_id']) {
  test('basic ' + mismatch + ' mismatch cannot expose details or start applications', async () => {
    const f = fixture({ 'activity-detail': () => ({ item: { ...detail().item, [mismatch]: ID(99) } }) }); await f.open();
    assert.equal(f.p.data.activity, null); assert.ok(f.p.data.basicError);
    assert.equal(f.calls.filter(x => x[0] === 'activity-applications').length, 0);
  });
}

test('capability failure is independent and retry does not refetch basic detail', async () => {
  let fail = true;
  const f = fixture({ 'activity-capabilities': params => { if (fail) throw new Error('权限服务暂不可用'); return caps(params.shop_id); } });
  await f.open(); assert.equal(f.p.data.activity.id, ACT); assert.ok(f.p.data.capabilitiesError);
  fail = false; await f.p.retryCapabilities();
  assert.equal(f.p.data.applications.length, 1);
  assert.equal(f.calls.filter(x => x[0] === 'activity-detail').length, 1);
});

test('basic failure does not hide capability failure and basic retry can recover', async () => {
  let fail = true;
  const f = fixture({ 'activity-detail': params => { if (fail) throw new Error('活动读取失败'); return detail(params.shop_id); } });
  await f.open(); assert.ok(f.p.data.basicError); assert.equal(f.p.data.canManage, true);
  assert.equal(f.calls.filter(x => x[0] === 'activity-applications').length, 0);
  fail = false; await f.p.retryBasic(); assert.equal(f.p.data.applications.length, 1);
});

for (const last of ['activity-detail', 'activity-capabilities']) {
  test('basic and capability loaders finish independently of the application list: ' + last, async () => {
    const gate = deferred(), list = deferred(), started = deferred();
    const f = fixture({
      [last]: () => gate.promise,
      'activity-applications': () => { started.resolve(); return list.promise; }
    });
    const opening = f.open();
    gate.resolve(last === 'activity-detail' ? detail() : caps());
    await started.promise;
    try {
      assert.equal(f.p.data.basicLoading, false);
      assert.equal(f.p.data.capabilitiesLoading, false);
      assert.equal(f.p.data.applicationsLoading, true);
      assert.equal(f.p.data.activity.id, ACT);
    } finally { list.resolve(applications({ shop_id: SHOP })); await opening; }
  });
}

for (const patch of [{ shop_id: OTHER_SHOP }, { can_confirm_publish: 'true' }, { can_upload_evidence: 'true' }]) {
  test('mismatched capability contract cannot start application reads: ' + JSON.stringify(patch), async () => {
    const f = fixture({ 'activity-capabilities': () => caps(SHOP, patch) }); await f.open();
    assert.equal(f.p.data.activity.id, ACT); assert.equal(f.p.data.canManage, false);
    assert.ok(f.p.data.capabilitiesError);
    assert.equal(f.calls.filter(x => x[0] === 'activity-applications').length, 0);
  });
}

test('the activity list remains usable when the backend enables native evidence upload', async () => {
  const f = fixture({ 'activity-capabilities': () => caps(SHOP, { can_upload_evidence: true,
    upload_policy: { max_bytes: 10485760, max_pending: 9, intent_ttl_seconds: 600, formats: ['jpg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'] } }) });
  await f.open();
  assert.equal(f.p.data.capabilitiesError, ''); assert.equal(f.p.data.canManage, true);
  assert.equal(f.p.data.canUploadEvidence, true); assert.equal(f.p.data.applications.length, 1);
});

test('all/unconfirmed/confirmed use publish booleans, never approval status filters', async () => {
  const f = fixture(); await f.open();
  await f.p.onFilterChange(tap({ filter: 'unconfirmed' }));
  assert.equal(f.calls.at(-1)[1].publish_confirmed, false);
  assert.match(f.p.data.applications[0].statusLabel, /通过/);
  await f.p.onFilterChange(tap({ filter: 'confirmed' }));
  assert.equal(f.calls.at(-1)[1].publish_confirmed, true);
  assert.equal(f.p.data.applications.length, 0); assert.equal(f.p.data.applicationsLoaded, true);
  await f.p.onFilterChange(tap({ filter: 'all' }));
  assert.equal(Object.hasOwn(f.calls.at(-1)[1], 'publish_confirmed'), false);
  assert.ok(f.calls.every(x => !Object.hasOwn(x[1], 'status')));
});

test('cursor pages deduplicate ids; failed next page preserves rows and retries the same cursor', async () => {
  let fail = true;
  const f = fixture({ 'activity-applications': params => {
    if (!params.cursor) return applications(params, [application(1), application(2)], true, 'opaque-next');
    if (fail) throw new Error('续页失败');
    return applications(params, [application(2), application(3)]);
  } }); await f.open(); await f.p.loadMoreApplications();
  assert.deepEqual(plain(f.p.data.applications.map(x => x.id)), [ID(1), ID(2)]);
  assert.equal(f.p.data.nextCursor, 'opaque-next'); assert.ok(f.p.data.applicationsError);
  fail = false; await f.p.retryApplications();
  assert.deepEqual(plain(f.p.data.applications.map(x => x.id)), [ID(1), ID(2), ID(3)]);
  assert.deepEqual(f.calls.filter(x => x[0] === 'activity-applications').map(x => x[1].cursor || null), [null, 'opaque-next', 'opaque-next']);
});

test('empty has_more page follows the backend cursor and paging is single-flight', async () => {
  const pending = deferred(); let count = 0;
  const f = fixture({ 'activity-applications': params => ++count === 1 ? applications(params, [], true, 'empty-next') : pending.promise });
  await f.open(); const next = f.p.loadMoreApplications(); await f.p.loadMoreApplications(); assert.equal(count, 2);
  pending.resolve(applications({ shop_id: SHOP }, [application(1)])); await next;
  assert.equal(f.p.data.applications.length, 1); assert.equal(f.p.data.hasMore, false);
});

test('filter switch invalidates old page success/error and finally without mixing rows', async () => {
  for (const reject of [false, true]) {
    const old = deferred();
    const f = fixture({ 'activity-applications': params => params.cursor ? old.promise : applications(params, params.publish_confirmed ? [] : [application()], params.publish_confirmed === undefined, params.publish_confirmed === undefined ? 'old-next' : null) });
    await f.open(); const page = f.p.loadMoreApplications();
    await f.p.onFilterChange(tap({ filter: 'confirmed' }));
    if (reject) old.reject(new Error('旧筛选失败')); else old.resolve(applications({ shop_id: SHOP }, [application(2)]));
    await page; assert.equal(f.p.data.filter, 'confirmed'); assert.equal(f.p.data.applications.length, 0);
    assert.equal(f.p.data.applicationsError, ''); assert.equal(f.p.data.applicationsLoading, false);
  }
});

for (const [name, patch] of [
  ['other shop', { shop_id: OTHER_SHOP }], ['other activity', { activity_id: ID(99) }],
  ['wrong filter', { publish_confirmed: true }], ['wrong order', { order: 'asc' }],
  ['unusable cursor', { has_more: true, next_cursor: null }], ['wrong child', { items: [{ ...application(2), activity_id: ID(99) }] }],
  ['invented screenshot count', { items: [{ ...application(2), publish_screenshot_count: '2' }] }]
]) {
  test('malformed next page preserves loaded rows: ' + name, async () => {
    const f = fixture({ 'activity-applications': params => !params.cursor ? applications(params, [application()], true, 'kept') : { ...applications(params), ...patch } });
    await f.open(); await f.p.loadMoreApplications();
    assert.deepEqual(plain(f.p.data.applications.map(x => x.id)), [ID(1)]);
    assert.equal(f.p.data.nextCursor, 'kept'); assert.ok(f.p.data.applicationsError);
  });
}

test('navigation accepts only an actually loaded application in the current authorized scope', async () => {
  const f = fixture(); await f.open();
  f.p.openApplication(tap({ id: ID(99) })); assert.equal(f.navigations.length, 0);
  f.p.openApplication(tap({ id: ID(1) }));
  assert.deepEqual(f.navigations, ['/pages/application/index?id=' + ID(1) + '&activityId=' + ACT]);
  f.change('revision'); f.p.openApplication(tap({ id: ID(1) })); assert.equal(f.navigations.length, 1);
  assert.equal(f.p.data.applications.length, 0);
});

for (const kind of ['user', 'shop', 'scope', 'revision']) {
  test('old read/401 is isolated after ' + kind + ' changes', async () => {
    const old = deferred(); let first = true;
    const f = fixture({ 'activity-capabilities': params => { if (first) { first = false; return old.promise; } return caps(params.shop_id, { can_manage: false }); } });
    const initial = f.p.onLoad({ id: ACT }); f.change(kind); await f.p.onShow();
    old.reject(Object.assign(new Error('旧身份401'), { status: 401 })); await initial;
    assert.equal(f.redirects.length, 0); assert.equal(f.p.data.canManage, false);
    assert.equal(f.p.data.applications.length, 0); assert.equal(f.p.data.capabilitiesError, '');
  });
}

test('hide clears masked applications/capabilities and stale callbacks; show performs fresh reads', async () => {
  const pending = deferred(); let count = 0;
  const f = fixture({ 'activity-applications': params => ++count === 1 ? applications(params, [application()], true, 'next') : count === 2 ? pending.promise : applications(params) });
  await f.open(); const more = f.p.loadMoreApplications(); f.p.onHide();
  assert.equal(f.p.data.applications.length, 0); assert.equal(f.p.data.canManage, false);
  const before = f.patches.length, calls = f.calls.length;
  await f.p.retryApplications(); pending.resolve(applications({ shop_id: SHOP }, [application(2)])); await more;
  assert.equal(f.patches.length, before); assert.equal(f.calls.length, calls);
  await f.p.onShow(); assert.equal(f.p.data.applications.length, 1);
});

test('unload ignores late success/error without setData', async () => {
  for (const reject of [false, true]) {
    const pending = deferred(); const f = fixture({ 'activity-detail': () => pending.promise });
    const loading = f.p.onLoad({ id: ACT }); f.p.onUnload(); const before = f.patches.length;
    if (reject) pending.reject(new Error('卸载后失败')); else pending.resolve(detail());
    await loading; assert.equal(f.patches.length, before);
  }
});

for (const status of [403, 404]) {
  test('current application ' + status + ' removes loaded applicants and requires fresh capabilities', async () => {
    let fail = true;
    const f = fixture({ 'activity-applications': params => {
      if (params.cursor && fail) throw Object.assign(new Error('申请资料不可访问'), { status });
      return applications(params, [application()], true, 'next');
    } });
    await f.open(); await f.p.loadMoreApplications();
    assert.equal(f.p.data.applications.length, 0); assert.equal(f.p.data.canManage, false);
    assert.ok(f.p.data.capabilitiesError); assert.equal(f.p.data.activity.id, ACT);
    f.p.openApplication(tap({ id: ID(1) })); assert.equal(f.navigations.length, 0);
    const reads = f.calls.length; await f.p.retryApplications(); assert.equal(f.calls.length, reads);
    fail = false; await f.p.retryCapabilities();
    assert.equal(f.p.data.canManage, true); assert.equal(f.p.data.applications.length, 1);
    assert.equal(f.calls.at(-1)[1].cursor, undefined);
  });
}

test('current application 401 clears private state and uses the real shared login handler', async () => {
  const f = fixture({ 'activity-applications': params => {
    if (params.cursor) throw Object.assign(new Error('登录已失效'), { status: 401 });
    return applications(params, [application()], true, 'next');
  } });
  await f.open(); await f.p.loadMoreApplications();
  assert.equal(f.p.data.applications.length, 0); assert.equal(f.p.data.canManage, false);
  assert.equal(f.p.data.activity, null); assert.equal(f.p.session.get(), null);
  assert.deepEqual(f.redirects, ['/pages/login/index']);
});

for (const kind of ['shop', 'revision']) {
  test('late application success/401 cannot replace the new scope after ' + kind, async () => {
    for (const reject of [false, true]) {
      const pending = deferred();
      const f = fixture({ 'activity-applications': params => params.cursor ? pending.promise : applications(params, [application()], true, 'next') });
      await f.open(); const more = f.p.loadMoreApplications();
      f.change(kind); await f.p.onShow(); const before = f.patches.length;
      if (reject) pending.reject(Object.assign(new Error('旧申请401'), { status: 401 }));
      else pending.resolve(applications({ shop_id: SHOP }, [application(2)]));
      await more;
      assert.equal(f.patches.length, before); assert.equal(f.redirects.length, 0);
      assert.deepEqual(plain(f.p.data.applications.map(row => row.id)), [ID(1)]);
      assert.equal(f.p.data.applicationsError, '');
    }
  });
}

test('actual shared preview UUID and DTO render all three filters without production calls', async () => {
  const preview = require('../miniprogram/shared/preview').createPreview({});
  const id = '00000000-0000-4000-8000-000000000031';
  const applicationId = '00000000-0000-4000-8000-000000000032';
  const names = ['activity-detail', 'activity-capabilities', 'activity-applications'];
  const f = fixture(Object.fromEntries(names.map(name => [name, params => preview.api.action(name, params)])),
    { preview: true, id, current: preview.session.get() });
  await f.open();
  assert.equal(f.p.data.preview, true); assert.equal(f.p.data.basicError, ''); assert.equal(f.p.data.capabilitiesError, '');
  assert.equal(f.p.data.applicationsError, ''); assert.equal(f.p.data.activity.id, id);
  assert.match(f.p.data.activity.description, /只读示例/);
  assert.equal(f.p.data.applications[0].id, applicationId);
  assert.equal(f.p.data.applications[0].phoneTail, '1234'); assert.equal(f.p.data.applications[0].publishConfirmed, false);
  await f.p.onFilterChange(tap({ filter: 'confirmed' }));
  assert.equal(f.p.data.applications.length, 0); assert.equal(f.p.data.applicationsLoaded, true);
  await f.p.onFilterChange(tap({ filter: 'unconfirmed' }));
  assert.equal(f.p.data.applications[0].id, applicationId);
  f.p.openApplication(tap({ id: applicationId }));
  assert.deepEqual(f.navigations, ['/pages/application/index?id=' + applicationId + '&activityId=' + id]);
  assert.ok(f.calls.every(([name, params]) => names.includes(name) && params.shop_id === preview.session.get().shop.id));
});

test('explicit preview remains a read-only fixture flow, never a local persistence fallback', async () => {
  const f = fixture({}, { preview: true }); await f.open(); f.p.openApplication(tap({ id: ID(1) }));
  assert.equal(f.p.data.preview, true);
  assert.ok(f.calls.every(x => ['activity-detail', 'activity-capabilities', 'activity-applications'].includes(x[0])));
  const source = fs.readFileSync(path.join(root, 'pages/activity/index.wxml'), 'utf8');
  assert.match(source, /只读.*示例/); assert.match(source, /非真实员工权限/);
  assert.doesNotMatch(source, /<web-view|form_data|answers|applicant_phone\}\}|applicant_name\}\}/);
  assert.doesNotMatch(source, /wx:if="(?!\{\{)|\{\{[^}]*&amp;/);
  for (const ext of ['js', 'json', 'wxml', 'wxss']) assert.ok(fs.existsSync(path.join(root, 'pages/activity/index.' + ext)));
});

test('approval and publication have separate native rows with readable scrollable layout', () => {
  const source = fs.readFileSync(path.join(root, 'pages/activity/index.wxml'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'pages/activity/index.wxss'), 'utf8');
  assert.match(source, /<view class="approval-status">[\s\S]*?审核：[\s\S]*?<\/view>\s*<view class="publication-status">/);
  assert.match(source, /查看申请详情/);
  assert.match(styles, /\.activity-page\s*\{[^}]*font-size:\s*32rpx/);
  assert.match(styles, /\.button-secondary\s*\{[^}]*min-height:\s*88rpx/);
  assert.doesNotMatch(styles, /overflow:\s*hidden|height:\s*(?:844px|100vh)/);
});
