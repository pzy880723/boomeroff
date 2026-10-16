const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../miniprogram/pages/store-kb-categories');
const SHOP = '00000000-0000-4000-8000-000000000001', USER = '00000000-0000-4000-8000-000000000002', ID = '00000000-0000-4000-8000-000000000003', OTHER = '00000000-0000-4000-8000-000000000004';
const V1 = '1'.repeat(64), V2 = '2'.repeat(64), NOW = '2026-10-16T09:20:00+08:00';
const ABORT_PAIRS = [[400, 'invalid_params'], [404, 'not_found'], [409, 'version_conflict'], [409, 'category_reference_conflict'], [422, 'name_too_long'], [422, 'invalid_sort_order']];
const limits = { name_chars: 200, sort_min: -2147483648, sort_max: 2147483647 };
const row = extra => ({ id: ID, shop_id: SHOP, type: 'sop', name: '开店', sort_order: -7, version: V1, ...extra });
const list = (p = {}, extra) => ({ shop_id: SHOP, type: p.type || 'sop', items: [row({ type: p.type || 'sop' }), row({ id: OTHER, shop_id: null, type: p.type || 'sop', name: '共享分类', sort_order: 9 })], can_manage: true, limits, page: p.page || 0, page_size: p.page_size || 20, has_more: false, as_of: NOW, ...extra });
const detail = (p = {}, extra) => ({ shop_id: SHOP, type: p.type || 'sop', category: row({ id: p.id || ID, type: p.type || 'sop', ...(p.id === OTHER ? { shop_id: null, name: '共享分类', sort_order: 9 } : {}) }), can_manage: p.id !== OTHER, limits, as_of: NOW, ...extra });
const receipt = (p, extra) => ({ shop_id: p.shop_id, type: p.type, request_id: p.request_id, operation: p.operation, actor_id: USER, category_id: p.category_id || ID, version: V2, deleted: p.operation === 'delete', recorded_at: NOW, replay: false, ...extra });
const readback = p => detail({ id: p.category_id || ID, type: p.type }, { category: row({ id: p.category_id || ID, type: p.type, name: p.name, sort_order: p.sort_order, version: V2 }) });
const status = (p, r = null) => ({ shop_id: p.shop_id, type: p.type, request_id: p.request_id, operation: p.operation, requested_category_id: p.category_id || null, state: r ? 'succeeded' : 'not_found', receipt: r });
const ev = value => ({ detail: { value } }), event = id => ({ currentTarget: { dataset: { id } } });
const error = (status, code) => Object.assign(Error(code), { status, code });
const tick = () => new Promise(r => setImmediate(r));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function model() { assert.ok(fs.existsSync(path.join(root, 'model.js')), 'category model must exist'); return require(path.join(root, 'model')); }
function harness(handler, options = {}) {
  const filename = path.join(root, 'index.js'); assert.ok(fs.existsSync(filename), 'native category page must exist');
  const env = options.env || { revision: 1, current: options.current === undefined ? { userId: USER, shop: { id: SHOP, name: '授权门店' }, scopeVersion: 1 } : options.current };
  const calls = [], modals = [];
  const wx = { showModal(o) { modals.push(o); if (!options.manualModal) o.success({ confirm: true }); }, reLaunch(o) { wx.login = o.url; } };
  const session = env.session || (env.session = { get: () => env.current, revision: () => env.revision, signOut() { env.current = null; env.revision++; } });
  const app = env.app || (env.app = { session, preview: !!options.preview, ensureSession: async () => !!env.current });
  app.api = { async action(a, p) { calls.push({ action: a, params: structuredClone(p) }); return handler(a, p); } };
  let spec;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { require(id) {
    if (id === '../../shared/page') { const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.resolve(root, '../../shared/page.js'), 'utf8'), { module: m, getApp: () => app, wx }); return m.exports; }
    return require(path.resolve(root, id));
  }, Page(x) { spec = x; }, wx, getApp: () => app });
  const page = { ...spec, data: structuredClone(spec.data), setData(x) { Object.assign(this.data, x); } };
  return { page, calls, modals, env, app, wx, async start(query = { type: 'sop' }) { await page.onLoad(query); await page.onShow(); }, change(kind) { env.revision++; if (kind === 'user') env.current = { ...env.current, userId: OTHER }; if (kind === 'shop') env.current = { ...env.current, shop: { id: OTHER } }; if (kind === 'scope') env.current = { ...env.current, scopeVersion: 2 }; } };
}
async function loaded(handler, options, query) { const h = harness(handler || (async (a, p) => a === 'kb-category-list' ? list(p) : detail(p)), options); await h.start(query); return h; }
async function editing(handler, options, create = false) { const h = await loaded(handler, options); if (create) await h.page.create(); else await h.page.open(event(ID)); return h; }
const writes = h => h.calls.filter(x => x.action === 'kb-category-write');

test('invalid type or missing verified user/shop makes zero category API calls', async () => {
  for (const query of [{}, { type: 'training' }]) { const h = harness(async () => { throw Error('no calls'); }); await h.start(query); assert.equal(h.calls.length, 0); assert.ok(h.page.data.error); }
  for (const current of [null, { userId: USER, shop: null }, { userId: USER, shop: { id: 'bad' } }]) { const h = await loaded(undefined, { current }); assert.equal(h.calls.length, 0); }
});

test('category authority is independent of entrywrite; readers still see categories but cannot create or mutate', async () => {
  const h = await loaded(); assert.equal(h.page.data.canCreate, true); assert.equal(h.calls.some(x => x.action === 'kb-capabilities'), false); await h.page.create(); assert.equal(h.page.data.editorVisible, true);
  const reader = await loaded(async (a, p) => a === 'kb-category-list' ? list(p, { can_manage: false, can_write: true }) : detail(p, { can_manage: false }));
  assert.equal(reader.page.data.items.length, 2); assert.equal(reader.page.data.canCreate, false); await reader.page.create(); assert.equal(reader.page.data.editorVisible, false);
  await reader.page.open(event(ID)); assert.equal(reader.page.data.editable, false); await reader.page.save(); await reader.page.remove(); assert.equal(writes(reader).length, 0);
});

test('list and detail enforce exact scope/type/limits/versions/numeric sort and boolean permissions', async () => {
  for (const patch of [{ shop_id: OTHER }, { type: 'qa' }, { can_manage: 'true' }, { limits: { ...limits, sort_min: 0 } }, { page: 1 }, { has_more: undefined }, { as_of: 'bad' }, { items: [row({ shop_id: OTHER })] }, { items: [row({ type: 'qa' })] }, { items: [row({ version: 'bad' })] }, { items: [row({ sort_order: 1.2 })] }]) {
    const h = await loaded(async (a, p) => list(p, patch)); assert.equal(h.page.data.items.length, 0); assert.equal(h.page.data.canCreate, false); assert.ok(h.page.data.error);
  }
  for (const patch of [{ category: row({ id: OTHER }) }, { category: row({ shop_id: OTHER }) }, { can_manage: 1 }, { category: row({ version: 'bad' }) }]) {
    const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : detail(p, patch)); assert.equal(h.page.data.canSave, false); assert.ok(h.page.data.error);
  }
});

test('shared rows remain read-only even with contradictory detail permission and retain original numeric sort', async () => {
  const h = await loaded(async (a, p) => a === 'kb-category-list' ? list(p) : detail(p, { can_manage: true })); await h.page.open(event(OTHER));
  assert.equal(h.page.data.scopeLabel, '共享 · 只读'); assert.equal(h.page.data.sortText, '9'); assert.equal(h.page.data.editable, false); assert.equal(h.page.data.canDelete, false);
  h.page.onName(ev('不应改共享')); await h.page.save(); await h.page.remove(); assert.equal(h.page.data.name, '共享分类'); assert.equal(writes(h).length, 0);
});

test('real server pagination dedupes without client reorder, keeps has_more and retries the same failed page', async () => {
  let fail = true; const h = await loaded(async (a, p) => { if (p.page === 1 && fail) throw Error('断网'); return list(p, { has_more: p.page < 2 }); });
  assert.equal(h.page.data.items[0].sort_order, -7); await h.page.loadMore(); assert.equal(h.page.data.items.length, 2); assert.equal(h.page.data.hasMore, true);
  fail = false; await h.page.loadMore(); assert.equal(h.calls.at(-1).params.page, 1); assert.equal(h.page.data.items.length, 2); assert.equal(h.page.data.hasMore, true);
  await h.page.loadMore(); assert.equal(h.calls.at(-1).params.page, 2); assert.equal(h.page.data.hasMore, false); assert.equal(h.page.data.total, undefined);
});

test('name/codepoint and strict PostgreSQL integer validation never truncates or turns invalid input into zero', () => {
  const m = model(); assert.deepEqual(m.normalize(' 分类 ', '-2147483648'), { name: '分类', sort_order: -2147483648 }); assert.equal(m.normalize('😀'.repeat(200), '2147483647').sort_order, 2147483647);
  for (const [name, sort] of [[' ', '0'], ['😀'.repeat(201), '0'], ['分类', ''], ['分类', 'bad'], ['分类', '1.5'], ['分类', '1e3'], ['分类', '2147483648'], ['分类', '-2147483649']]) assert.throws(() => m.normalize(name, sort));
});

test('oversize existing names remain intact and user sort/name failures keep the complete draft without writing', async () => {
  const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : detail(p, { category: row({ name: '名'.repeat(201) }) }));
  assert.equal(h.page.data.name.length, 201); assert.equal(h.page.data.canSave, false); h.page.onSort(ev('1.5')); await h.page.save(); assert.equal(h.page.data.sortText, '1.5'); assert.equal(writes(h).length, 0);
});

test('create/update use explicit modal and whitelisted frozen payload then metadata receipt plus exact readback', async () => {
  for (const create of [true, false]) {
    let sent; const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : a === 'kb-category-write' ? (sent = p, receipt(p)) : sent ? readback(sent) : detail(p), undefined, create);
    h.page.onName(ev(' 新名称 ')); h.page.onSort(ev('-100')); await h.page.save();
    assert.equal(sent.operation, create ? 'create' : 'update'); assert.equal(sent.name, '新名称'); assert.equal(sent.sort_order, -100); assert.equal(sent.expected_version, create ? undefined : V1);
    assert.deepEqual(Object.keys(sent).sort(), ['shop_id', 'type', 'request_id', 'operation', 'name', 'sort_order', ...(create ? [] : ['category_id', 'expected_version'])].sort());
    assert.equal(h.page.data.saved, true); assert.equal(h.page.data.editorVisible, false); assert.equal(Object.keys(h.app._kbCategoryPending).length, 0); assert.equal(h.modals.length, 1);
    await h.page.save(); h.page.onHide(); await h.page.onShow(); await h.page.save(); assert.equal(writes(h).length, 1);
  }
});

test('delete confirmation describes uncategorized entries; only receipt and exact scoped not_found prove deletion', async () => {
  for (const result of ['gone', '403', 'other404', 'timeout', 'exists']) {
    let sent; const h = await editing(async (a, p) => { if (a === 'kb-category-list') return list(p); if (a === 'kb-category-write') { sent = p; return receipt(p); } if (!sent) return detail(p); if (result === 'gone') throw error(404, 'not_found'); if (result === '403') throw error(403, 'forbidden'); if (result === 'other404') throw error(404, 'other'); if (result === 'timeout') throw Error('timeout'); return detail(p); });
    await h.page.remove(); assert.equal(sent.operation, 'delete'); assert.equal(sent.name, undefined); assert.match(h.modals[0].content, /未分类/); assert.equal(h.page.data.saved, result === 'gone');
    assert.equal(Object.keys(h.app._kbCategoryPending).length, result === 'gone' ? 0 : 1); await h.page.save(); assert.equal(writes(h).length, 1);
  }
});

test('receipt metadata mismatch and content/version readback mismatch never claim success or resend', async () => {
  for (const patch of [{ actor_id: OTHER }, { shop_id: OTHER }, { type: 'qa' }, { request_id: OTHER }, { category_id: OTHER }, { version: 'bad' }, { operation: 'delete' }, { deleted: true }, { recorded_at: 'bad' }, { replay: 'false' }]) {
    const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : a === 'kb-category-write' ? receipt(p, patch) : detail(p)); await h.page.save(); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.receiptConfirmed, false); assert.equal(h.page.data.pending, true);
  }
  for (const field of ['name', 'sort_order', 'version']) {
    let sent; const h = await editing(async (a, p) => { if (a === 'kb-category-list') return list(p); if (a === 'kb-category-write') { sent = p; return receipt(p); } if (!sent) return detail(p); const d = readback(sent); d.category[field] = field === 'name' ? '不同名称' : field === 'version' ? V1 : 999; return d; });
    await h.page.save(); assert.equal(h.page.data.receiptConfirmed, true); assert.equal(h.page.data.saved, false); assert.ok(h.page.data.readbackError); await h.page.retryReadback(); await h.page.save(); assert.equal(writes(h).length, 1);
  }
});

test('modal cancellation/edit/hidden/unload/identity changes prevent all category mutations', async () => {
  for (const kind of ['cancel', 'name', 'sort', 'hide', 'unload', 'revision', 'user', 'shop', 'scope']) {
    const h = await editing(undefined, { manualModal: true }); const work = h.page.save(); assert.equal(h.modals.length, 1);
    if (kind === 'name') h.page.onName(ev('后改')); else if (kind === 'sort') h.page.onSort(ev('8')); else if (kind === 'hide') h.page.onHide(); else if (kind === 'unload') h.page.onUnload(); else if (kind !== 'cancel') h.change(kind);
    h.modals[0].success({ confirm: kind !== 'cancel' }); await work; assert.equal(writes(h).length, 0, kind);
  }
});

test('same-page unsent draft survives hide, newer version conflicts preserve draft until explicit latest adoption', async () => {
  let changed = false; const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : detail(p, { category: row({ version: changed ? V2 : V1 }) }));
  h.page.onName(ev('未保存名称')); h.page.onSort(ev('44')); h.page.onHide(); assert.equal(h.page.data.name, ''); await h.page.onShow(); assert.equal(h.page.data.name, '未保存名称');
  changed = true; await h.page.refresh(); assert.equal(h.page.data.conflict, true); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.name, '未保存名称');
  await h.page.reloadLatest(); assert.equal(h.page.data.name, '开店'); assert.equal(h.page.data.sortText, '-7'); assert.equal(h.page.data.conflict, false); assert.equal(writes(h).length, 0);
});

async function unknown(options, create = false, remove = false) { const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : a === 'kb-category-write' ? Promise.reject(Error('超时')) : detail(p), options, create); h.page.onName(ev('冻结名称')); h.page.onSort(ev('55')); await (remove ? h.page.remove() : h.page.save()); return h; }

test('unknown App RAM survives unload and reentry only exposes pending after fresh category authority, including removed/off-page resources', async () => {
  for (const create of [true, false]) {
    const first = await unknown(undefined, create); const p = writes(first)[0].params; first.page.onUnload(); const gate = deferred();
    const next = harness(async (a, params) => a === 'kb-category-list' ? gate.promise : detail(params), { env: first.env }); const work = next.start(); await tick(); assert.equal(next.page.data.pendingRequests.length, 0); gate.resolve(list({}, { items: [] })); await work;
    assert.equal(next.page.data.pendingRequests.length, 1); assert.equal(next.page.data.name, ''); await next.page.resume({ currentTarget: { dataset: { index: 0 } } });
    assert.equal(next.page.data.pending, true); assert.equal(next.page.data.name, '冻结名称'); assert.equal(next.page.data.canSave, false); assert.equal(writes(next).length, 0);
    assert.deepEqual(structuredClone(Object.values(next.app._kbCategoryPending)[0].payload), p); assert.equal(Object.values(next.app._kbCategoryPending)[0].unknown, true);
  }
});

test('status not_found does not release; exact same-key retry requires another explicit confirmation', async () => {
  let sent, count = 0; const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : a === 'kb-category-write' ? ++count === 1 ? (sent = structuredClone(p), Promise.reject(Error('超时'))) : receipt(p) : a === 'kb-category-write-status' ? status(p) : count > 1 ? readback(sent) : detail(p));
  await h.page.save(); await h.page.retrySame(); assert.equal(count, 1); await h.page.reconcile(); assert.equal(h.page.data.pending, true); assert.match(h.page.data.notice, /不代表/); assert.equal(count, 1);
  await h.page.retrySame(); assert.equal(count, 2); assert.deepEqual(writes(h)[1].params, sent); assert.equal(h.page.data.saved, true);
});

test('status validates exact requested category and receipt, and request_id_conflict never permits same-key retry', async () => {
  for (const patch of [{ shop_id: OTHER }, { type: 'qa' }, { requested_category_id: OTHER }, { request_id: OTHER }, { operation: 'delete' }]) {
    let sent; const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : a === 'kb-category-write' ? (sent = p, Promise.reject(Error('超时'))) : a === 'kb-category-write-status' ? { ...status(p, receipt(sent)), ...patch } : detail(p)); await h.page.save(); await h.page.reconcile(); assert.equal(h.page.data.receiptConfirmed, false); assert.equal(h.page.data.saved, false);
  }
  const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : a === 'kb-category-write' ? Promise.reject(error(409, 'request_id_conflict')) : a === 'kb-category-write-status' ? status(p) : detail(p)); await h.page.save(); await h.page.reconcile(); await h.page.retrySame(); assert.equal(writes(h).length, 1);
});

test('delete receipt recovers through status even when category detail is already missing', async () => {
  const first = await unknown(undefined, false, true), p = writes(first)[0].params; first.page.onUnload();
  const h = await loaded(async (a, q) => a === 'kb-category-list' ? list(q, { items: [] }) : a === 'kb-category-write-status' ? status(q, receipt(p)) : Promise.reject(error(404, 'not_found')), { env: first.env });
  await h.page.resume({ currentTarget: { dataset: { index: 0 } } }); assert.equal(h.page.data.pending, true); assert.equal(h.page.data.saved, false); await h.page.reconcile(); assert.equal(h.page.data.saved, true); assert.equal(Object.keys(h.app._kbCategoryPending).length, 0);
});

test('403 hides private state but keeps unknown RAM; different account/shop/type never sees another intent', async () => {
  const first = await unknown(); first.page.api.action = async () => { throw error(403, 'forbidden'); }; await first.page.reconcile(); assert.equal(first.page.data.name, ''); assert.equal(Object.keys(first.app._kbCategoryPending).length, 1);
  for (const kind of ['user', 'shop', 'type']) {
    const h = await unknown(); h.page.onUnload(); if (kind !== 'type') h.change(kind);
    const x = await loaded(async (a, p) => list(p, { shop_id: p.shop_id, items: [] }), { env: h.env }, { type: kind === 'type' ? 'qa' : 'sop' }); assert.equal(x.page.data.pendingRequests.length, 0);
  }
});

test('non-abort failures and mismatched status/code pairs retain the original category intent', async () => {
  for (const e of [error(400, 'not_found'), error(404, 'version_conflict'), error(422, 'invalid_params'), error(409, 'request_id_conflict'), error(500, 'db_error')]) {
    const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : a === 'kb-category-write' ? Promise.reject(e) : detail(p)); await h.page.save(); assert.equal(h.page.data.pending, true); assert.equal(Object.keys(h.app._kbCategoryPending).length, 1); assert.equal(h.page.data.name, '开店');
  }
});

test('singleflight and late writes/401 reads cannot paint hidden or changed-scope UI or sign out a new session', async () => {
  const gate = deferred(); const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : a === 'kb-category-write' ? gate.promise : detail(p)); const work = h.page.save(); await tick(); await h.page.save(); assert.equal(writes(h).length, 1); h.page.onHide(); gate.resolve(receipt(writes(h)[0].params)); await work;
  assert.equal(h.page.data.name, ''); assert.equal(h.page.data.saved, false); assert.equal(Object.values(h.app._kbCategoryPending)[0].unknown, true);
  for (const kind of ['hide', 'unload', 'revision', 'user', 'shop', 'scope']) {
    const pending = deferred(); const x = harness(async () => pending.promise); const starting = x.start(); await tick(); if (kind === 'hide') x.page.onHide(); else if (kind === 'unload') x.page.onUnload(); else x.change(kind); pending.reject(error(401, 'old')); await starting;
    assert.equal(x.page.data.items.length, 0); assert.ok(x.env.current); assert.equal(x.wx.login, undefined);
  }
});

test('preview can inspect local inline fields but all write/status direct handlers remain unavailable', async () => {
  const h = await editing(undefined, { preview: true }); h.page.onName(ev('示例编辑')); assert.equal(h.page.data.name, '示例编辑'); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, false);
  await h.page.save(); await h.page.remove(); await h.page.reconcile(); await h.page.retrySame(); assert.equal(h.calls.some(x => /write/.test(x.action)), false); assert.equal(h.page.data.saved, false);
});

test('one native route, reader category link, unlimited fields and real disabled/modal/retry states are wired', () => {
  const app = JSON.parse(fs.readFileSync(path.resolve(root, '../../app.json'), 'utf8')); assert.equal(app.pages.filter(x => x === 'pages/store-kb-categories/index').length, 1); assert.equal(app.tabBar.list.length, 5);
  const wxml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8'); for (const handler of ['create', 'open', 'save', 'remove', 'cancel', 'loadMore', 'retry', 'reconcile', 'retrySame']) assert.match(wxml, new RegExp('bindtap="' + handler + '"'));
  assert.ok((wxml.match(/maxlength="-1"/g) || []).length >= 2); assert.match(wxml, /disabled="\{\{!canSave/); assert.match(wxml, /disabled="\{\{!canDelete/); assert.doesNotMatch(wxml, /web-view|&amp;&amp;/);
  for (const m of wxml.matchAll(/\bwx:(?:if|elif)\s*=\s*(["'])([\s\S]*?)\1/g)) assert.match(m[2].trim(), /^\{\{[\s\S]+\}\}$/);
  const source = fs.readFileSync(path.resolve(root, '../store-kb/index.js'), 'utf8'), read = fs.readFileSync(path.resolve(root, '../store-kb/index.wxml'), 'utf8'); assert.match(source, /\/pages\/store-kb-categories\/index\?type=/); assert.match(read, /bindtap="openCategories"/);
});

test('latest local detail denial overrides a prior manageable list and cannot query or retry an old pending write', async () => {
  const first = await unknown(); first.page.onUnload();
  const h = await loaded(async (a, p) => a === 'kb-category-list' ? list(p) : a === 'kb-category-detail' ? detail(p, { can_manage: false }) : Promise.reject(Error('no status/write allowed')), { env: first.env });
  await h.page.resume({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(h.page.data.canManage, false); assert.equal(h.page.data.canCreate, false); assert.equal(h.page.data.pendingRequests.length, 0); assert.equal(h.page.data.canSave, false);
  await h.page.reconcile(); await h.page.retrySame(); assert.equal(h.calls.some(x => x.action === 'kb-category-write-status' || x.action === 'kb-category-write'), false); assert.equal(Object.keys(h.app._kbCategoryPending).length, 1);
});

test('direct stale create/open taps cannot silently reset a visible unsent inline draft', async () => {
  for (const create of [false, true]) {
    const h = await editing(undefined, undefined, create); h.page.onName(ev('不要丢弃的草稿')); h.page.onSort(ev('123'));
    const calls = h.calls.length; await h.page.create(); await h.page.open(event(ID));
    assert.equal(h.page.data.name, '不要丢弃的草稿'); assert.equal(h.page.data.sortText, '123'); assert.equal(h.calls.length, calls);
    h.page.cancel(); assert.equal(h.page.data.editorVisible, false);
  }
});

test('same-account new revision clears unsent draft but restores only pending metadata after a fresh list capability', async () => {
  const h = await unknown(); h.change('revision'); const gate = deferred(); h.page.api.action = async (a, p) => a === 'kb-category-list' ? gate.promise : detail(p);
  const reload = h.page.refresh(); await tick(); assert.equal(h.page.data.name, ''); assert.equal(h.page.data.pendingRequests.length, 0);
  gate.resolve(list()); await reload; assert.equal(h.page.data.name, ''); assert.equal(h.page.data.pendingRequests.length, 1); assert.equal(h.page.data.editorVisible, false);
});

test('closing an unknown inline intent permits another resource without erasing the old request slot', async () => {
  const h = await unknown(); const frozen = writes(h)[0].params; h.page.cancel(); assert.equal(h.page.data.pendingRequests.length, 1);
  await h.page.create(); h.page.onName(ev('第二分类草稿')); assert.equal(h.page.data.name, '第二分类草稿'); assert.equal(h.page.data.pending, false);
  assert.equal(Object.keys(h.app._kbCategoryPending).length, 1); assert.deepEqual(structuredClone(Object.values(h.app._kbCategoryPending)[0].payload), frozen);
});

test('main preview DTOs provide native SOP/QA own/shared controls without hardcoded IDs or any writes/status', async () => {
  const preview = require('../miniprogram/shared/preview').createPreview();
  for (const type of ['sop', 'qa']) {
    const h = await loaded((a, p) => preview.api.action(a, p), { preview: true, current: preview.session.get() }, { type });
    const own = h.page.data.items.find(x => x.shop_id !== null), shared = h.page.data.items.find(x => x.shop_id === null);
    assert.ok(own); assert.ok(shared); assert.equal(h.page.data.canCreate, true);
    await h.page.open(event(own.id)); assert.equal(h.page.data.editable, true); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, false); h.page.onName(ev('只在内存编辑的示例')); await h.page.save(); await h.page.remove(); h.page.cancel();
    await h.page.open(event(shared.id)); assert.equal(h.page.data.editable, false); assert.equal(h.page.data.scopeLabel, '共享 · 只读'); h.page.cancel();
    await h.page.create(); assert.equal(h.page.data.editorVisible, true); assert.equal(h.page.data.editable, true); assert.equal(h.page.data.canSave, false);
    await h.page.reconcile(); await h.page.retrySame(); assert.equal(h.calls.some(x => /write/.test(x.action)), false);
  }
});

async function confirmedWithFailedReadback(operation) {
  let sent, readable = false;
  const handler = async (a, p) => {
    if (a === 'kb-category-list') return list(p);
    if (a === 'kb-category-write') { sent = structuredClone(p); return receipt(p); }
    if (!sent) return detail(p);
    if (!readable) throw Error('已确认回执，详情暂不可读');
    if (operation === 'delete') throw error(404, 'not_found');
    return readback(sent);
  };
  const h = await editing(handler, undefined, operation === 'create'); h.page.onName(ev('恢复已核验名称')); h.page.onSort(ev('-2'));
  await (operation === 'delete' ? h.page.remove() : h.page.save());
  assert.equal(h.page.data.receiptConfirmed, true); assert.equal(h.page.data.saved, false); assert.ok(Object.values(h.app._kbCategoryPending)[0].receipt);
  return { h, handler, allowRead() { readable = true; } };
}

test('confirmed receipt recovery through same-page hide/show finishes loading after proven readback success', async () => {
  for (const operation of ['create', 'update', 'delete']) {
    const { h, allowRead } = await confirmedWithFailedReadback(operation); h.page.onHide(); allowRead(); await h.page.onShow();
    assert.equal(h.page.data.saved, true, operation); assert.equal(h.page.data.loading, false, operation); assert.equal(h.page.data.editorVisible, false); assert.equal(h.page.data.pending, false);
    assert.equal(h.page.data.pendingRequests.length, 0); assert.equal(Object.keys(h.app._kbCategoryPending).length, 0); assert.equal(h.page.data.canCreate, true);
    assert.equal(writes(h).length, 1); assert.equal(h.calls.some(x => x.action === 'kb-category-write-status'), false);
  }
});

test('confirmed receipt recovery through unload/new-page resume finishes loading without resending', async () => {
  for (const operation of ['create', 'update', 'delete']) {
    const { h, handler, allowRead } = await confirmedWithFailedReadback(operation); h.page.onUnload(); allowRead();
    const next = await loaded(handler, { env: h.env }); assert.equal(next.page.data.pendingRequests.length, 1); await next.page.resume({ currentTarget: { dataset: { index: 0 } } });
    assert.equal(next.page.data.saved, true, operation); assert.equal(next.page.data.loading, false, operation); assert.equal(next.page.data.editorVisible, false); assert.equal(next.page.data.pending, false);
    assert.equal(next.page.data.pendingRequests.length, 0); assert.equal(Object.keys(next.app._kbCategoryPending).length, 0); assert.equal(next.page.data.canCreate, true);
    assert.equal(writes(h).length, 1); assert.equal(writes(next).length, 0); assert.equal(next.calls.some(x => x.action === 'kb-category-write-status'), false);
  }
});

test('category abort recognizer accepts exactly the six verified numeric status/code pairs', () => {
  const m = model(); assert.equal(typeof m.transactionAborted, 'function');
  for (const [http, code] of ABORT_PAIRS) {
    assert.equal(m.transactionAborted(error(http, code)), true, http + ' ' + code);
    for (const wrong of [401, 403, 500, String(http)]) assert.equal(m.transactionAborted(error(wrong, code)), false);
    assert.equal(m.transactionAborted(error(http, code + '_extra')), false);
  }
  for (const e of [null, {}, Error('transport'), error(409, 'request_id_conflict'), error(400, 'name_too_long'), error(422, 'category_reference_conflict'), error(422, 'invalid_category'), error(422, 'invalid_tags'), error(500, 'db_error')]) assert.equal(m.transactionAborted(e), false);
});

test('first definite create/update/delete abort releases only the exact RAM slot and preserves draft/resource until fresh reads', async () => {
  for (const operation of ['create', 'update', 'delete']) for (const [http, code] of ABORT_PAIRS) {
    let sent, count = 0;
    const h = await editing(async (a, p) => {
      if (a === 'kb-category-list') return list(p);
      if (a === 'kb-category-write') { sent = p; if (++count === 1) throw error(http, code); return receipt(p); }
      if (count > 1) { if (operation === 'delete') throw error(404, 'not_found'); return readback(sent); }
      return detail(p);
    }, undefined, operation === 'create');
    h.page.onName(ev(' 保留未保存分类 ')); h.page.onSort(ev('-2')); model().ram(h.app).unrelated = { marker: 'unrelated' }; const resource = h.page._resource;
    await (operation === 'delete' ? h.page.remove() : h.page.save()); const first = writes(h)[0].params;
    assert.equal(h.page.data.pending, false, operation + ' ' + code); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.receiptConfirmed, false);
    assert.equal(h.page._resource, resource); assert.equal(h.page.data.name, ' 保留未保存分类 '); assert.equal(h.page.data.sortText, '-2'); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, false); assert.equal(h.page.data.canCreate, false);
    assert.match(h.page.data.notice, /草稿/); assert.deepEqual(Object.keys(h.app._kbCategoryPending), ['unrelated']); await h.page.save(); await h.page.remove(); assert.equal(count, 1);
    await h.page.refresh(); assert.equal(h.page.data.name, ' 保留未保存分类 '); assert.equal(count, 1);
    if (code === 'version_conflict') { assert.equal(h.page.data.conflict, true); await h.page.reloadLatest(); if (operation === 'create') h.page.onName(ev('明确重读后新建')); }
    await (operation === 'delete' ? h.page.remove() : h.page.save()); assert.equal(count, 2); assert.notEqual(sent.request_id, first.request_id); assert.equal(h.page.data.saved, true); assert.deepEqual(Object.keys(h.app._kbCategoryPending), ['unrelated']);
  }
});

test('version conflict latch survives render/refresh/show and clears only after confirmed successful latest adoption', async () => {
  let failRead = false;
  const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : a === 'kb-category-write' ? Promise.reject(error(409, 'version_conflict')) : failRead ? Promise.reject(Error('detail read failed')) : detail(p), { manualModal: true });
  h.page.onName(ev('版本冲突保稿')); h.page.onSort(ev('42')); const work = h.page.save(); h.modals.at(-1).success({ confirm: true }); await work;
  assert.equal(h.page.data.conflict, true); assert.equal(h.page._writeConflict, true); h.page.render(); await h.page.refresh(); h.page.onSort(ev('43')); assert.equal(h.page.data.conflict, true); assert.equal(h.page.data.canSave, false);
  h.page.onHide(); await h.page.onShow(); assert.equal(h.page.data.conflict, true); assert.equal(h.page.data.name, '版本冲突保稿');
  const canceled = h.page.reloadLatest(); h.modals.at(-1).success({ confirm: false }); await canceled; assert.equal(h.page.data.name, '版本冲突保稿'); assert.equal(h.page.data.conflict, true);
  failRead = true; const failed = h.page.reloadLatest(); h.modals.at(-1).success({ confirm: true }); await failed; assert.equal(h.page.data.name, '版本冲突保稿'); assert.equal(h.page.data.conflict, true); assert.equal(h.page.data.canSave, false);
  failRead = false; const adopt = h.page.reloadLatest(); h.modals.at(-1).success({ confirm: true }); await adopt;
  assert.equal(h.page.data.name, '开店'); assert.equal(h.page.data.sortText, '-7'); assert.equal(h.page.data.conflict, false); assert.equal(h.page._writeConflict, false); assert.equal(h.page.data.canSave, true); assert.equal(writes(h).length, 1);
});

test('definite abort requires a complete explicit refresh, not a failed detail reload or pagination, to restore mutation authority', async () => {
  for (const operation of ['update', 'delete']) {
    let aborted = false, failDetail = true;
    const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p, { has_more: true }) : a === 'kb-category-write' ? (aborted = true, Promise.reject(operation === 'delete' ? error(409, 'category_reference_conflict') : error(422, 'invalid_sort_order'))) : aborted && failDetail ? Promise.reject(error(500, 'db_error')) : detail(p));
    h.page.onName(ev('保稿等待完整重读')); h.page.onSort(ev('-2'));
    await (operation === 'delete' ? h.page.remove() : h.page.save());
    const before = h.calls.length; await h.page.loadMore(); assert.equal(h.calls.length, before);
    await h.page.refresh(); h.page.render();
    assert.equal(h.page._authorized, true); assert.equal(h.page._detailManage, true);
    assert.equal(h.page._needsRefresh, true); assert.equal(h.page.data.loading, false);
    assert.equal(h.page.data.canSave, false, operation); assert.equal(h.page.data.canDelete, false, operation);
    await h.page.save(); await h.page.remove(); assert.equal(writes(h).length, 1);
    assert.equal(h.page.data.name, '保稿等待完整重读'); assert.equal(h.page.data.sortText, '-2'); assert.equal(h.page._resource, ID);
    assert.equal(Object.keys(h.app._kbCategoryPending).length, 0); assert.equal(h.page.data.saved, false);
    failDetail = false; await h.page.refresh();
    assert.equal(h.page._needsRefresh, false); assert.equal(h.page.data.canSave, true); assert.equal(h.page.data.canDelete, true);
    assert.equal(h.page.data.name, '保稿等待完整重读'); assert.equal(h.page.data.sortText, '-2'); assert.equal(writes(h).length, 1);
  }
});

test('historical unknown and RAM-restored category retries keep the exact payload for all six later abort pairs', async () => {
  for (const restore of [false, true]) for (const [http, code] of ABORT_PAIRS) {
    const first = await unknown(), original = writes(first)[0].params;
    const handler = async (a, p) => a === 'kb-category-list' ? list(p) : a === 'kb-category-write-status' ? status(p) : a === 'kb-category-write' ? Promise.reject(error(http, code)) : detail(p);
    let h = first;
    if (restore) { first.page.onUnload(); h = await loaded(handler, { env: first.env }); await h.page.resume({ currentTarget: { dataset: { index: 0 } } }); }
    else h.page.api.action = async (a, p) => { h.calls.push({ action: a, params: structuredClone(p) }); return handler(a, p); };
    await h.page.reconcile(); await h.page.retrySame(); assert.equal(h.page.data.pending, true); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.name, '冻结名称'); assert.equal(h.page.data.sortText, '55');
    assert.equal(Object.keys(h.app._kbCategoryPending).length, 1); const record = Object.values(h.app._kbCategoryPending)[0]; assert.equal(record.unknown, true); assert.deepEqual(structuredClone(record.payload), original);
  }
});

test('abort-like late errors after hide/unload/revision remain unknown and cannot release the old RAM slot', async () => {
  for (const boundary of ['hide', 'unload', 'revision']) for (const [http, code] of ABORT_PAIRS) {
    const gate = deferred(); const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : a === 'kb-category-write' ? gate.promise : detail(p));
    const work = h.page.save(); await tick(); if (boundary === 'hide') h.page.onHide(); else if (boundary === 'unload') h.page.onUnload(); else h.change('revision');
    gate.reject(error(http, code)); await work; assert.equal(Object.keys(h.app._kbCategoryPending).length, 1); assert.equal(Object.values(h.app._kbCategoryPending)[0].unknown, true); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.name, '');
  }
});

test('no abort-like detail error can release an already confirmed receipt or cause another category write', async () => {
  for (const [http, code] of ABORT_PAIRS) {
    let sent; const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p) : a === 'kb-category-write' ? (sent = p, receipt(p)) : sent ? Promise.reject(error(http, code)) : detail(p));
    await h.page.save(); assert.equal(h.page.data.receiptConfirmed, true); assert.equal(h.page.data.pending, true); assert.equal(h.page.data.saved, false); assert.ok(Object.values(h.app._kbCategoryPending)[0].receipt);
    await h.page.retryReadback(); await h.page.save(); await h.page.retrySame(); assert.equal(writes(h).length, 1); assert.equal(Object.keys(h.app._kbCategoryPending).length, 1);
  }
});

test('conflict latches remain resource-scoped when another category is opened or conflicts before returning', async () => {
  const second = '00000000-0000-4000-8000-000000000005';
  const h = await editing(async (a, p) => a === 'kb-category-list' ? list(p, { items: [row(), row({ id: second, name: '分类二' })] }) : a === 'kb-category-write' ? Promise.reject(error(409, 'version_conflict')) : detail(p, { category: row({ id: p.id, name: p.id === ID ? '开店' : '分类二' }) }));
  await h.page.save(); await h.page.refresh(); h.page.cancel(); await h.page.open(event(second));
  assert.equal(h.page.data.conflict, false); await h.page.save(); await h.page.refresh(); h.page.cancel(); await h.page.open(event(ID));
  assert.equal(h.page.data.conflict, true); assert.equal(h.page.data.canSave, false); await h.page.reloadLatest(); assert.equal(h.page.data.conflict, false);
  h.page.cancel(); await h.page.open(event(second)); assert.equal(h.page.data.conflict, true); assert.equal(h.page.data.canSave, false);
});
