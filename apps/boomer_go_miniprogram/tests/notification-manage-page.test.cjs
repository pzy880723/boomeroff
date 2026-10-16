const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../miniprogram/pages/notification-manage');
const USER = '00000000-0000-4000-8000-000000000902', ID = '00000000-0000-4000-8000-000000000903', OTHER = '00000000-0000-4000-8000-000000000904';
const row = patch => ({ id: ID, title: '原公告', body: '原正文', type: 'legacy-type', active: true,
  expires_at: '2026-12-25T13:02:03.123456+08:00', created_by: OTHER, created_at: '2026-10-16T01:02:03.123456Z',
  image_url: 'https://example.invalid/original.png', category: 'legacy-category', summary: '原导语', ...patch });
const copy = value => value === undefined ? undefined : structuredClone(value);
const ev = value => ({ detail: { value } });
const select = id => ({ currentTarget: { dataset: { id } } });
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const failure = status => Object.assign(Error('private-secret-message'), { status });
function outcome(intent, base = row()) {
  if (intent.operation === 'delete') return { operation: 'delete', id: intent.id, deleted: true };
  return { operation: intent.operation, id: intent.id, row: { ...base, ...(intent.operation === 'create' ? { image_url: null, category: null, summary: null } : {}), ...copy(intent.payload), id: intent.id } };
}
function harness(options = {}) {
  const file = path.join(root, 'index.js'); assert.ok(fs.existsSync(file), 'notification manager page must exist');
  const env = options.env || { user: { userId: USER, shop: { id: ID }, scopeVersion: 1, permissions: ['role.manage'] }, revision: 1 };
  const calls = [], modals = [], navigation = [], renders = [];
  const session = env.session || (env.session = { get: () => env.user, revision: () => env.revision,
    signOut() { env.user = null; env.revision++; } });
  const app = env.app || (env.app = { session, preview: !!options.preview, ensureSession: async () => !!env.user });
  let latest = options.base === undefined ? row() : options.base;
  app.api = {
    async notificationManageCapabilities() { calls.push({ method: 'caps' }); return options.caps ? options.caps() : { can_manage: true }; },
    async notificationManageList() { calls.push({ method: 'list' }); return options.list ? options.list() : { items: latest ? [copy(latest)] : [] }; },
    async notificationManageRead(id) { calls.push({ method: 'read', id }); return options.read ? options.read(id) : copy(latest); },
    async notificationManageWrite(intent) { calls.push({ method: 'write', intent: copy(intent) }); if (options.write) return options.write(intent);
      const result = outcome(intent, latest || row()); latest = result.row || null; return copy(result); }
  };
  const wx = { showModal(o) { modals.push(o); if (!options.manualModal) o.success({ confirm: true }); }, reLaunch(o) { navigation.push(o.url); }, navigateTo(o) { navigation.push(o.url); } };
  const shell = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.resolve(root, '../../shared/page.js'), 'utf8'), { module: shell, getApp: () => app, wx });
  let spec; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page: s => { spec = s; }, getApp: () => app, wx,
    require: name => name === '../../shared/page' ? shell.exports : require(path.resolve(root, name)) });
  const page = { ...spec, data: copy(spec.data), setData(patch) { assert.equal(this._gone, false, 'no unloaded render'); renders.push(copy(patch)); Object.assign(this.data, patch); } };
  return { page, calls, modals, navigation, renders, env, app,
    async start(query = {}) { const load = page.onLoad(query), show = page.onShow(); await Promise.all([load, show]); },
    change(kind) { env.revision++; if (kind === 'user') env.user = { ...env.user, userId: OTHER }; if (kind === 'shop') env.user = { ...env.user, shop: { id: OTHER } }; },
    latest(value) { latest = value; }
  };
}
const writes = h => h.calls.filter(x => x.method === 'write');
const reads = h => h.calls.filter(x => x.method === 'read');
async function loaded(options) { const h = harness(options); await h.start(); return h; }
async function editing(options) { const h = await loaded(options); await h.page.openItem(select(ID)); return h; }
function draft(h, title = '新公告', body = '新正文') { h.page.onTitle(ev(title)); h.page.onBody(ev(body)); }

test('real shared shell first onLoad/onShow reads capabilities and latest list once', async () => {
  const h = await loaded(); assert.deepEqual(h.calls.map(x => x.method), ['caps', 'list']);
  assert.equal(h.page.data.items.length, 1); assert.equal(h.page.data.canManage, true); assert.equal(h.page.data.editorVisible, false);
  assert.equal(h.page.data.items[0].title, '原公告'); assert.match(h.page.data.audience, /全体|全局|所有门店/);
});
for (const caps of [{ can_manage: false }, { can_manage: 'true' }, {}, null]) test('strict server capability denies list/editor regardless of role or HQ: ' + JSON.stringify(caps), async () => {
  const h = await loaded({ caps: () => caps }); await h.page.newItem(); await h.page.save(); await h.page.remove(); await h.page.reconcile();
  assert.equal(h.page.data.canManage, false); assert.equal(h.page.data.items.length, 0); assert.equal(h.page.data.editorVisible, false);
  assert.deepEqual(h.calls.map(x => x.method), ['caps']);
});
test('list projects only display fields and invalid rows do not become editable', async () => {
  const h = await loaded({ list: () => ({ items: [{ ...row(), unknown: { secret: 'raw-secret' } }] }) });
  assert.equal(JSON.stringify(h.page.data).includes('raw-secret'), false);
  const bad = await loaded({ list: () => ({ items: [row({ active: 'yes' })] }) });
  assert.equal(bad.page.data.items.length, 0); await bad.page.openItem(select(ID)); assert.equal(reads(bad).length, 0);
});
test('opening an existing loaded row reads exact ID; forged IDs never open', async () => {
  const h = await editing(); assert.equal(reads(h).length, 1); assert.equal(reads(h)[0].id, ID);
  assert.equal(h.page.data.title, '原公告'); assert.equal(h.page.data.body, '原正文'); assert.equal(h.page.data.canSave, false);
  await h.page.closeEditor(); await h.page.openItem(select(OTHER)); assert.equal(reads(h).length, 1);
});
test('new global notification requires explicit confirmation and independent exact-ID readback', async () => {
  const h = await loaded(); await h.page.newItem(); draft(h); assert.equal(writes(h).length, 0); assert.equal(h.page.data.canSave, true);
  await h.page.save(); const intent = writes(h)[0].intent;
  assert.equal(intent.operation, 'create'); assert.equal(intent.userId, USER); assert.equal(intent.payload.type, 'announcement'); assert.equal(intent.payload.created_by, USER);
  assert.match(h.modals[0].content, /全体|全局|所有门店/); assert.equal(reads(h).at(-1).id, intent.id);
  assert.equal(h.page.data.saved, true); assert.equal(h.page.data.pending, false); await h.page.save(); assert.equal(writes(h).length, 1);
});
test('update changes only edited fields preserving legacy metadata and timestamp precision', async () => {
  const h = await editing(); h.page.onTitle(ev('新标题')); await h.page.save();
  const intent = writes(h)[0].intent; assert.equal(intent.operation, 'update'); assert.deepEqual(intent.payload, { title: '新标题' });
  assert.equal(intent.base.expires_at, row().expires_at); assert.equal(intent.base.category, 'legacy-category');
  assert.equal(h.page.data.saved, true);
});
test('native expiry picker and clear change only expiry using Shanghai end of day', async () => {
  const h = await editing(); h.page.onExpiry(ev('2026-12-31')); assert.equal(h.page.data.expiryDate, '2026-12-31');
  await h.page.save(); assert.deepEqual(writes(h)[0].intent.payload, { expires_at: '2026-12-31T15:59:59.000Z' });
  const clear = await editing(); clear.page.clearExpiry(); await clear.page.save(); assert.deepEqual(writes(clear)[0].intent.payload, { expires_at: null });
});
test('invalid picker input cannot silently clear or replace an existing expiry', async () => {
  const h = await editing(); const before = h.page.data.expiryDate;
  for (const value of ['2026-02-30', '', 'bad', null]) h.page.onExpiry(ev(value));
  assert.equal(h.page.data.expiryDate, before); assert.equal(h.page.data.canSave, false); assert.equal(writes(h).length, 0);
});
test('active switch can be edited locally and requires explicit save', async () => {
  const h = await editing(); h.page.onActive(ev(false)); assert.equal(writes(h).length, 0); await h.page.save();
  assert.deepEqual(writes(h)[0].intent.payload, { active: false }); assert.match(h.modals[0].content, /全体|全局|所有门店/);
});
test('list toggle and delete have explicit global confirmation and preserve other columns', async () => {
  const h = await loaded(); await h.page.toggleItem(select(ID)); assert.equal(writes(h).length, 1); assert.deepEqual(writes(h)[0].intent.payload, { active: false });
  assert.match(h.modals[0].content, /下架|停用/); assert.match(h.modals[0].content, /全体|全局|所有门店/);
  const del = await editing(); await del.page.remove(); assert.equal(writes(del)[0].intent.operation, 'delete');
  assert.match(del.modals[0].content, /删除/); assert.equal(del.page.data.saved, true); assert.equal(del.page.data.items.length, 0);
});
for (const phase of ['visible', 'hide-show', 'revision', 'user']) test('toggle continuation remains bound to its original context: ' + phase, async () => {
  const gate = deferred(); let first = true, latest = row();
  const h = await loaded({ read: () => first ? (first = false, gate.promise) : copy(latest),
    write: intent => { const result = outcome(intent, latest); latest = result.row; return result; } });
  const work = h.page.toggleItem(select(ID)); await tick();
  assert.equal(reads(h).length, 1); assert.equal(h.modals.length, 0);
  if (phase === 'hide-show') { h.page.onHide(); await h.page.onShow(); }
  else if (phase !== 'visible') { h.change(phase); await h.page.refresh(); await h.page.openItem(select(ID)); }
  if (phase !== 'visible') { assert.equal(h.page.data.editable, true); assert.equal(reads(h).length, 2); }
  gate.resolve(row()); await work;
  assert.equal(h.modals.length, phase === 'visible' ? 1 : 0);
  assert.equal(writes(h).length, phase === 'visible' ? 1 : 0);
  if (phase === 'visible') {
    assert.match(h.modals[0].content, /全体|全局|所有门店/);
    assert.equal(writes(h)[0].intent.userId, USER); assert.deepEqual(writes(h)[0].intent.payload, { active: false });
    assert.equal(h.page.data.saved, true);
  }
});
test('confirmed toggle editor displays the readback state instead of the pre-toggle draft', async () => {
  const h = await loaded(); await h.page.toggleItem(select(ID));
  assert.equal(h.page.data.saved, true); assert.equal(h.page.data.active, false); assert.equal(h.page.data.items[0].active, false);
});
test('updating an older notice preserves the server latest-list order', async () => {
  const newest = row({ id: OTHER, title: '较新公告', created_at: '2026-10-17T01:02:03.123456Z' });
  let latest = row();
  const h = await editing({ list: () => ({ items: [newest, latest] }), read: () => latest,
    write: intent => { const result = outcome(intent, latest); latest = result.row; return result; } });
  draft(h); await h.page.save(); assert.equal(h.page.data.saved, true);
  assert.deepEqual(h.page.data.items.map(r => r.id), [OTHER, ID]); assert.equal(h.page.data.items[1].title, '新公告');
});
test('deleting does not require repairing an untouched overlength legacy title/body', async () => {
  const h = await editing({ base: row({ title: '旧'.repeat(80), body: '旧'.repeat(700) }) });
  assert.equal(h.page.data.title.length, 80); await h.page.remove(); assert.equal(writes(h).length, 1); assert.equal(h.page.data.saved, true);
});
test('changed title/body counters do not truncate and invalid changes cannot write', async () => {
  const h = await editing();
  for (const [title, body] of [['字'.repeat(61), '正文'], ['标题', '文'.repeat(501)], [' ', '正文']]) {
    draft(h, title, body); assert.equal(h.page.data.title, title); assert.equal(h.page.data.body, body); assert.equal(h.page.data.titleCount, title.length); assert.equal(h.page.data.bodyCount, body.length);
    assert.equal(h.page.data.canSave, false); await h.page.save();
  }
  assert.equal(writes(h).length, 0); assert.ok(h.page.data.validation);
});
test('empty body is allowed, title60/body500 accepted, and noop emits no request', async () => {
  const h = await editing(); await h.page.save(); assert.equal(writes(h).length, 0);
  h.page.onBody(ev('')); await h.page.save(); assert.deepEqual(writes(h)[0].intent.payload, { body: '' });
  const max = await editing(); draft(max, '字'.repeat(60), '文'.repeat(500)); await max.page.save(); assert.equal(max.page.data.saved, true);
});
test('cancel and double tap never duplicate a write', async () => {
  const h = await editing({ manualModal: true }); draft(h); const work = h.page.save(); await tick(); await h.page.save(); await h.page.remove();
  assert.equal(h.modals.length, 1); h.modals[0].success({ confirm: false }); await work; assert.equal(writes(h).length, 0);
});
for (const action of ['edit', 'hide', 'unload', 'user', 'shop', 'revision']) test('stale confirmation cannot write: ' + action, async () => {
  const h = await editing({ manualModal: true }); draft(h); const work = h.page.save(); await tick();
  if (action === 'edit') h.page.onBody(ev('另一个草稿')); else if (action === 'hide') h.page.onHide(); else if (action === 'unload') h.page.onUnload(); else h.change(action);
  h.modals[0].success({ confirm: true }); await work; assert.equal(writes(h).length, 0);
});
test('closing a dirty editor requires explicit discard and never saves', async () => {
  const h = await editing({ manualModal: true }); draft(h); const close = h.page.closeEditor(); await tick(); h.modals[0].success({ confirm: false }); await close;
  assert.equal(h.page.data.editorVisible, true); assert.equal(h.page.data.title, '新公告'); assert.equal(writes(h).length, 0);
});
test('foreground refresh keeps local draft and latches a changed server snapshot until explicit reload', async () => {
  const h = await editing(); draft(h); h.latest(row({ summary: '其他管理员更新' })); h.page.onHide(); await h.page.onShow();
  assert.equal(h.page.data.title, '新公告'); assert.equal(h.page.data.conflict, true); assert.equal(h.page.data.canSave, false);
  await h.page.reloadLatest(); assert.equal(h.page.data.title, '原公告'); assert.equal(h.page.data.conflict, false);
});
for (const kind of ['create', 'update', 'delete']) test('unknown ' + kind + ' never auto-retries or treats absence as completion', async () => {
  let sent; const h = await loaded({ read: () => sent ? null : row(), write: intent => { sent = intent; throw Error('timeout'); } });
  if (kind === 'create') await h.page.newItem(); else await h.page.openItem(select(ID));
  if (kind !== 'delete') draft(h); await (kind === 'delete' ? h.page.remove() : h.page.save());
  const frozen = copy(writes(h)[0].intent); await h.page.reconcile(); await h.page.save(); await h.page.newItem();
  assert.equal(h.page.data.pending, true); assert.equal(h.page.data.saved, false); assert.equal(writes(h).length, 1);
  assert.deepEqual(writes(h)[0].intent, frozen); assert.match(h.page.data.notice, /不代表|尚未|不能/);
});
for (const represented of [false, true]) for (const phase of ['hide', 'unload']) test(phase + ' restores immutable actor intent only after fresh capabilities; representation=' + represented, async () => {
  let sent; const first = await editing({ read: () => sent ? Promise.reject(failure(500)) : row(), write: intent => { sent = intent; if (!represented) throw Error('timeout'); return outcome(intent); } });
  draft(first); await first.page.save(); first.page[phase === 'hide' ? 'onHide' : 'onUnload'](); assert.equal(first.page.data.title, ''); assert.equal(first.page.data.items.length, 0);
  const gate = deferred(), next = harness({ env: first.env, caps: () => gate.promise, read: () => outcome(sent).row }); const starting = next.start(); await tick();
  assert.equal(next.page.data.pending, false); assert.equal(next.page.data.title, ''); gate.resolve({ can_manage: true }); await starting;
  assert.equal(next.page.data.pending, true); assert.equal(next.page.data.receiptConfirmed, represented); assert.equal(writes(next).length, 0);
  await next.page.reconcile(); assert.equal(next.page.data.saved, true); assert.equal(writes(next).length, 0);
});
test('known deletion representation plus independent absence completes after unload; unknown absence does not', async () => {
  let sent; const first = await editing({ read: () => sent ? Promise.reject(failure(500)) : row(), write: intent => { sent = intent; return outcome(intent); } });
  await first.page.remove(); assert.equal(first.page.data.receiptConfirmed, true); first.page.onUnload();
  const next = await loaded({ env: first.env, read: () => null }); assert.equal(next.page.data.pending, true); await next.page.reconcile();
  assert.equal(next.page.data.saved, true); assert.equal(next.page.data.pending, false); assert.equal(writes(next).length, 0);
});
test('late hidden write representation remains actor-bound without hidden render or readback', async () => {
  const gate = deferred(); let sent;
  const h = await editing({ read: () => sent ? outcome(sent).row : row(), write: intent => { sent = intent; return gate.promise; } });
  draft(h); const work = h.page.save(); await tick(); h.page.onHide(); gate.resolve(outcome(sent)); await work;
  assert.equal(h.page.data.title, ''); assert.equal(h.page.data.saved, false); assert.equal(reads(h).length, 1);
  await h.page.onShow(); assert.equal(h.page.data.receiptConfirmed, true); await h.page.reconcile(); assert.equal(h.page.data.saved, true);
});
test('fresh capability denial hides pending and retains it for later authorized read-only recovery', async () => {
  let sent; const first = await editing({ write: intent => { sent = intent; throw Error('timeout'); } }); draft(first); await first.page.save(); first.page.onUnload();
  const denied = await loaded({ env: first.env, caps: () => ({ can_manage: false }) }); assert.equal(denied.page.data.pending, false); assert.equal(denied.page.data.title, ''); assert.equal(reads(denied).length, 0);
  const restored = await loaded({ env: first.env, read: () => outcome(sent).row }); assert.equal(restored.page.data.pending, true); await restored.page.reconcile(); assert.equal(restored.page.data.saved, true);
});
test('other actor cannot restore original global pending intent and same actor revision must recapture capability', async () => {
  const first = await editing({ write: () => { throw Error('timeout'); } }); draft(first); await first.page.save(); first.page.onUnload(); first.change('user');
  const next = await loaded({ env: first.env }); assert.equal(next.page.data.pending, false); assert.equal(next.page.data.title, '');
});
test('malformed representation and mismatched readback never declare saved or release original intent', async () => {
  for (const patch of [{}, { operation: 'delete', id: ID, deleted: true }]) {
    const h = await editing({ write: () => patch }); draft(h); await h.page.save(); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.pending, true);
  }
  let sent; const h = await editing({ read: () => sent ? row({ title: '不是原稿' }) : row(), write: intent => { sent = intent; return outcome(intent); } });
  draft(h); await h.page.save(); assert.equal(h.page.data.receiptConfirmed, true); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.pending, true);
});
for (const phase of ['visible', 'hide', 'unload', 'revision', 'user']) test('shared-shell write 401 handling is lifecycle-bound: ' + phase, async () => {
  const gate = deferred(); const h = await editing({ write: () => gate.promise }); draft(h); const work = h.page.save(); await tick();
  if (phase === 'hide') h.page.onHide(); else if (phase === 'unload') h.page.onUnload(); else if (phase !== 'visible') h.change(phase);
  gate.reject(failure(401)); await work; assert.equal(h.navigation.includes('/pages/login/index'), phase === 'visible'); assert.equal(h.page.data.title, '');
});
test('current 403 clears private UI without forgetting the unresolved request', async () => {
  const h = await editing({ write: () => { throw failure(403); } }); draft(h); await h.page.save();
  assert.equal(h.page.data.title, ''); assert.equal(h.page.data.canManage, false); assert.ok(h.env.user); assert.equal(writes(h).length, 1);
  await h.page.onShow(); await h.page.refresh(); assert.equal(h.page.data.pending, true);
});
for (const phase of ['hide', 'unload', 'revision', 'user']) test('late capability/list read cannot expose or authorize old data: ' + phase, async () => {
  const gate = deferred(), h = harness({ list: () => gate.promise }); const work = h.start(); await tick();
  if (phase === 'hide') h.page.onHide(); else if (phase === 'unload') h.page.onUnload(); else h.change(phase);
  gate.resolve({ items: [row()] }); await work; assert.equal(h.page.data.items.length, 0); assert.equal(h.page.data.canManage, false);
});
test('preview permits local inputs but all direct mutation and recovery handlers issue zero writes/reads', async () => {
  const h = await editing({ preview: true }); const before = reads(h).length; draft(h); h.page.onActive(ev(false)); h.page.clearExpiry();
  assert.equal(h.page.data.title, '新公告'); assert.equal(h.page.data.editable, true); assert.equal(h.page.data.canSave, false);
  await h.page.save(); await h.page.remove(); await h.page.toggleItem(select(ID)); await h.page.reconcile();
  assert.equal(writes(h).length, 0); assert.equal(reads(h).length, before); assert.equal(h.modals.length, 0);
});
test('native quartet uses actual global classes, dynamic bindings and nontruncating counters', () => {
  const xml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8');
  for (const match of xml.matchAll(/\bwx:(?:if|elif)\s*=\s*(["'])([\s\S]*?)\1/g)) assert.match(match[2].trim(), /^\{\{[\s\S]+\}\}$/);
  assert.match(xml, /class="title"/); assert.match(xml, /class="field/); assert.match(xml, /class="button"/);
  assert.equal((xml.match(/maxlength="-1"/g) || []).length, 2); assert.match(xml, /mode="date"/); assert.match(xml, /switch/);
  assert.doesNotMatch(xml, /button-primary|web-view/); assert.match(xml, /最新\s*50/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')).navigationBarTitleText, '系统通知管理');
});
