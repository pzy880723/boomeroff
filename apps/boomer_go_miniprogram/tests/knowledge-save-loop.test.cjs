const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createApi } = require('../miniprogram/shared/api');

const root = path.resolve(__dirname, '../miniprogram');
const USER = '00000000-0000-4000-8000-000000000901';
const PRODUCT = '00000000-0000-4000-8000-000000000902';
const FAVORITE = '00000000-0000-4000-8000-000000000903';
const OTHER = '00000000-0000-4000-8000-000000000904';
const receipt = () => ({ saved: true, favorite_id: FAVORITE });
const product = () => ({ kind: 'recognition', id: PRODUCT, title: '合成商品', raw: { id: PRODUCT, created_by: USER } });
function favorite(available = true) {
  return { kind: 'favorite', id: FAVORITE, title: '收藏快照', quiz_kind: available ? 'favorite' : null, quiz_available: available,
    raw: { favorite: { id: FAVORITE, source_type: 'recognition', source_id: PRODUCT }, source_available: available, source: available ? { id: PRODUCT } : null } };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(handler, preview = false, restore) {
  let spec, revision = 1, user = USER;
  const calls = [], navigation = [], renders = [];
  let signouts = 0;
  const session = { get: () => ({ userId: user, shop: { id: OTHER }, scopeVersion: 1 }), revision: () => revision,
    signOut() { signouts++; revision++; user = ''; } };
  if (restore) session.restore = restore;
  const wx = { setNavigationBarTitle() {}, stopPullDownRefresh() {}, navigateTo: value => navigation.push(value.url), reLaunch: value => navigation.push(value.url) };
  const api = createApi({ wx, config: {}, session, invoke: async (name, body) => {
    assert.equal(name, 'go-mini-api');
    calls.push({ action: body.action, params: structuredClone(body.params) });
    const data = handler ? await handler(body.action, body.params) : (body.action === 'knowledge-save' ? receipt() : body.params.kind === 'favorite' ? favorite() : product());
    return { data };
  } });
  const app = { api, session, preview, ensureSession: async () => true };
  const shell = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module: shell, getApp: () => app, wx });
  const filename = path.join(root, 'pages/detail/index.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { wx, getApp: () => app, Page(value) { spec = value; },
    require(id) { return id === '../../shared/page' ? shell.exports : require(path.resolve(path.dirname(filename), id)); } }, { filename });
  const page = Object.assign({}, spec, { data: structuredClone(spec.data), setData(value) {
    assert.notEqual(this._gone, true, 'never render after shared onUnload'); renders.push(value); Object.assign(this.data, value);
  } });
  return { page, calls, navigation, renders, session, change() { revision++; user = OTHER; }, revise() { revision++; }, signouts: () => signouts,
    load: () => page.onLoad({ kind: 'recognition', id: PRODUCT }), writes: () => calls.filter(c => c.action === 'knowledge-save') };
}

test('actual save receipt is read back by favorite ID, then reading is explicit and no quiz starts', async () => {
  const h = harness(); await h.load(); await h.page.saveKnowledge();
  assert.equal(h.page.data.knowledgeSaveState, 'confirmed');
  assert.equal(h.writes().length, 1);
  assert.equal(h.writes()[0].params.product_id, PRODUCT);
  assert.equal(h.calls.at(-1).params.id, FAVORITE);
  assert.equal(h.calls.at(-1).params.kind, 'favorite');
  assert.deepEqual(h.navigation, []);
  h.page.openSavedKnowledge();
  assert.deepEqual(h.navigation, ['/pages/detail/index?kind=favorite&id=' + FAVORITE]);
  assert.equal(h.calls.filter(c => c.action.startsWith('quiz-')).length, 0);
});

for (const bad of [null, { saved: false, favorite_id: FAVORITE }, { saved: true }, { saved: true, favorite_id: 'bad' }, { saved: true, favorite_id: [FAVORITE] }, { ok: true }]) {
  test('malformed or negative save receipt stays unknown and cannot silently resend: ' + JSON.stringify(bad), async () => {
    const h = harness((action) => action === 'knowledge-save' ? bad : product()); await h.load();
    await h.page.saveKnowledge(); await h.page.saveKnowledge();
    assert.equal(h.page.data.knowledgeSaveState, 'unknown'); assert.equal(h.writes().length, 1);
    assert.equal(h.page.data.actionNotice, ''); assert.equal(h.calls.length, 2);
    h.page.checkKnowledgeLibrary(); assert.deepEqual(h.navigation, ['/pages/list/index?kind=my-library']);
  });
}

for (const [name, mutate] of [
  ['favorite ID', x => { x.id = OTHER; }], ['raw favorite ID', x => { x.raw.favorite.id = OTHER; }],
  ['source type', x => { x.raw.favorite.source_type = 'product'; }], ['source ID', x => { x.raw.favorite.source_id = OTHER; }],
  ['source row', x => { x.raw.source.id = OTHER; }], ['optional owner', x => { x.raw.favorite.user_id = OTHER; }],
  ['optional top owner', x => { x.user_id = OTHER; }], ['kind', x => { x.kind = 'official'; }],
  ['availability', x => { delete x.raw.source_available; }]
]) test('readback rejects mismatched ' + name + ' without losing known receipt or rewriting', async () => {
  let wrong = true;
  const h = harness((action, params) => {
    if (action === 'knowledge-save') return receipt();
    if (params.kind !== 'favorite') return product();
    const row = favorite(); if (wrong) mutate(row); return row;
  }); await h.load(); await h.page.saveKnowledge();
  assert.equal(h.page.data.knowledgeSaveState, 'receipt'); h.page.openSavedKnowledge(); assert.equal(h.navigation.length, 0);
  wrong = false; await h.page.retryKnowledgeReadback();
  assert.equal(h.page.data.knowledgeSaveState, 'confirmed'); assert.equal(h.writes().length, 1);
});

test('source unavailable confirms collection only, without fabricating quiz or source availability', async () => {
  const h = harness((action, params) => action === 'knowledge-save' ? receipt() : params.kind === 'favorite' ? favorite(false) : product());
  await h.load(); await h.page.saveKnowledge();
  assert.equal(h.page.data.knowledgeSaveState, 'confirmed');
  assert.match(h.page.data.knowledgeSaveNotice, /源内容.*不可|无法.*测验/);
  assert.equal(h.page.data.quizUrl, '');
});

test('double click sends one write while in flight', async () => {
  const gate = deferred(); const h = harness(action => action === 'knowledge-save' ? gate.promise : product());
  await h.load(); const first = h.page.saveKnowledge(); await tick(); await h.page.saveKnowledge();
  assert.equal(h.writes().length, 1); gate.resolve(receipt()); await first;
});

test('known receipt survives hidden late write and fresh same-product load; only readback resumes', async () => {
  const gate = deferred(); const h = harness((action, params) => action === 'knowledge-save' ? gate.promise : params.kind === 'favorite' ? favorite() : product());
  await h.load(); const write = h.page.saveKnowledge(); await tick(); h.page.onHide(); const count = h.renders.length;
  gate.resolve(receipt()); await write; assert.equal(h.renders.length, count);
  assert.equal(h.page.data.knowledgeSaveState, '');
  await h.page.onShow(); assert.equal(h.page.data.knowledgeSaveState, 'confirmed'); assert.equal(h.writes().length, 1);
  assert.equal(h.calls.at(-2).params.kind, 'recognition'); assert.equal(h.calls.at(-1).params.kind, 'favorite');
});

test('readback failure preserves receipt across hide/show and retries only reads', async () => {
  let failed = true;
  const h = harness((action, params) => {
    if (action === 'knowledge-save') return receipt();
    if (params.kind === 'favorite') { if (failed) throw new Error('network'); return favorite(); } return product();
  }); await h.load(); await h.page.saveKnowledge(); assert.equal(h.page.data.knowledgeSaveState, 'receipt');
  h.page.onHide(); failed = false; await h.page.onShow();
  assert.equal(h.page.data.knowledgeSaveState, 'confirmed'); assert.equal(h.writes().length, 1);
});

test('returning while an old readback is pending can reconcile in the fresh visible context', async () => {
  const gate = deferred(); let reads = 0;
  const h = harness((action, params) => action === 'knowledge-save' ? receipt() : params.kind === 'favorite' ? (++reads === 1 ? gate.promise : favorite()) : product());
  await h.load(); const first = h.page.saveKnowledge(); await tick();
  h.page.onHide(); await h.page.onShow();
  assert.equal(h.page.data.knowledgeSaveState, 'confirmed'); assert.equal(h.page.data.knowledgeSaveBusy, false);
  const count = h.renders.length; gate.resolve(favorite()); await first;
  assert.equal(h.renders.length, count); assert.equal(h.writes().length, 1);
});

test('previously confirmed collection is rechecked after a fresh product read, not assumed still present', async () => {
  let removed = false;
  const h = harness((action, params) => {
    if (action === 'knowledge-save') return receipt();
    if (params.kind === 'favorite') { if (removed) throw Object.assign(new Error('removed'), { status: 404 }); return favorite(); }
    return product();
  }); await h.load(); await h.page.saveKnowledge(); h.page.onHide(); removed = true; await h.page.onShow();
  assert.equal(h.page.data.knowledgeSaveState, 'receipt'); h.page.openSavedKnowledge(); assert.equal(h.navigation.length, 0);
  assert.equal(h.writes().length, 1);
});

test('matching optional ownership is accepted but never required by the actual favorite DTO', async () => {
  const h = harness((action, params) => {
    if (action === 'knowledge-save') return receipt();
    if (params.kind !== 'favorite') return product();
    const row = favorite(); row.user_id = USER; row.raw.favorite.user_id = USER; return row;
  }); await h.load(); await h.page.saveKnowledge(); assert.equal(h.page.data.knowledgeSaveState, 'confirmed');
});

test('save cannot use a hidden, unloaded, loading or changed route binding', async () => {
  for (const state of ['hide', 'unload', 'loading', 'route']) {
    const h = harness(); await h.load();
    if (state === 'hide') h.page.onHide();
    if (state === 'unload') h.page.onUnload();
    if (state === 'loading') h.page.data.loading = true;
    if (state === 'route') h.page.data.id = OTHER;
    await h.page.saveKnowledge(); assert.equal(h.writes().length, 0, state);
  }
});

test('network unknown survives fresh load and only offers manual library check', async () => {
  const h = harness(action => { if (action === 'knowledge-save') throw new Error('network'); return product(); });
  await h.load(); await h.page.saveKnowledge(); h.page.onHide(); await h.page.onShow(); await h.page.saveKnowledge();
  assert.equal(h.writes().length, 1); assert.equal(h.page.data.knowledgeSaveState, 'unknown');
});

for (const transition of ['hide', 'unload', 'identity', 'revision', 'product']) test('late favorite readback cannot paint or navigate after ' + transition, async () => {
  const gate = deferred(); const h = harness((action, params) => action === 'knowledge-save' ? receipt() : params.kind === 'favorite' ? gate.promise : product());
  await h.load(); const write = h.page.saveKnowledge(); await tick();
  if (transition === 'hide') h.page.onHide();
  if (transition === 'unload') h.page.onUnload();
  if (transition === 'identity') h.change();
  if (transition === 'revision') h.revise();
  if (transition === 'product') h.page.data.id = OTHER;
  const count = h.renders.length; gate.resolve(favorite()); await write;
  assert.equal(h.renders.length, count); assert.notEqual(h.page.data.knowledgeSaveState, 'confirmed');
  h.page.openSavedKnowledge(); assert.equal(h.navigation.length, 0);
});

test('old 401 cannot sign out a new identity; current 401 uses shared shell protection', async () => {
  for (const stale of [true, false]) {
    const gate = deferred(), h = harness(action => action === 'knowledge-save' ? gate.promise : product());
    await h.load(); const write = h.page.saveKnowledge(); await tick(); if (stale) h.change();
    gate.reject(Object.assign(new Error('unauthorized'), { status: 401 })); await write;
    assert.equal(h.signouts(), stale ? 0 : 1); assert.equal(h.navigation.length, stale ? 0 : 1);
  }
});

test('preview direct handler cannot write and WXML disables save', async () => {
  const h = harness(undefined, true); await h.load(); await h.page.saveKnowledge(); assert.equal(h.writes().length, 0);
  const wxml = fs.readFileSync(path.join(root, 'pages/detail/index.wxml'), 'utf8');
  assert.match(wxml, /bindtap="saveKnowledge"[^>]*disabled="{{[^}]*preview/);
});

test('favorite details never offer a duplicate knowledge-save, and invalid raw product ID is not writable', async () => {
  const h = harness((action, params) => params.kind === 'favorite' ? favorite() : { ...product(), raw: { id: 'not-a-uuid' } });
  await h.load(); assert.equal(h.page.data.canSave, false); await h.page.saveKnowledge();
  await h.page.onLoad({ kind: 'favorite', id: FAVORITE }); assert.equal(h.page.data.canSave, false); await h.page.saveKnowledge();
  assert.equal(h.writes().length, 0);
});

test('knowledge save never renews and automatically resends a denied write, including hide and return', async () => {
  let restores = 0;
  const h = harness(action => {
    if (action === 'knowledge-save') throw Object.assign(new Error('scope not ready'), { status: 403, code: 'erp_scope_not_ready' });
    return product();
  }, false, async () => { restores++; });
  await h.load(); await h.page.saveKnowledge();
  h.page.onHide(); await h.page.onShow(); await h.page.saveKnowledge();
  assert.equal(restores, 0);
  assert.equal(h.writes().length, 1);
  assert.equal(h.page.data.knowledgeSaveState, 'unknown');
  assert.equal(h.calls.filter(c => c.params.kind === 'favorite').length, 0);
});

test('ordinary knowledge reads retain the existing exact scope-denial renewal retry', async () => {
  let restores = 0, reads = 0;
  const h = harness(() => {
    if (++reads === 1) throw Object.assign(new Error('scope not ready'), { status: 403, code: 'erp_scope_not_ready' });
    return product();
  }, false, async () => { restores++; });
  await h.load();
  assert.equal(restores, 1);
  assert.equal(reads, 2);
  assert.equal(h.page.data.item.id, PRODUCT);
  assert.equal(h.page.data.error, '');
});
