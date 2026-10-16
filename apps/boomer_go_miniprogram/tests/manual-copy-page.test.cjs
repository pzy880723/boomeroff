const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../miniprogram/pages/manual-copy');
const USER = '00000000-0000-4000-8000-000000000902', SHOP = '00000000-0000-4000-8000-000000000901';
const ID = '00000000-0000-4000-8000-000000000903', OTHER = '00000000-0000-4000-8000-000000000904';
const original = [
  { title: '第一条', body: '第一段正文', hashtags: ['#原标签'], unknown: { keep: true } },
  { title: '第二条', body: '第二段正文', topics: ['#另一标签'], future_key: [1, 2] },
];
const row = extra => ({ id: ID, user_id: USER, shop_id: SHOP, kind: 'copy', output_text: JSON.stringify(original), meta: { source: 'manual_upload', asset_class: 'upload', hidden: { private: true } }, created_at: '2026-10-16T01:02:03.123456Z', ...extra });
const ev = value => ({ detail: { value } });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const error = status => Object.assign(Error('raw-private-provider-message'), { status });
const copy = value => value === undefined ? undefined : structuredClone(value);
function outcome(intent) {
  if (intent.operation === 'delete') return { operation: 'delete', id: intent.id, deleted: true };
  return { operation: intent.operation, id: intent.id, row: row({ id: intent.id, output_text: intent.outputText, meta: intent.meta || row().meta }) };
}
function harness(options = {}) {
  const file = path.join(root, 'index.js');
  assert.ok(fs.existsSync(file), 'native manual-copy editor must exist');
  const env = options.env || { current: { userId: USER, shop: { id: SHOP, name: '当前授权店' }, scopeVersion: 1 }, revision: 1 };
  env.fresh = options.fresh;
  const calls = [], modals = [], navigation = [];
  const session = env.session || (env.session = { get: () => env.current, revision: () => env.revision,
    async ensureFresh() { calls.push({ method: 'fresh' }); if (env.fresh) await env.fresh(); },
    signOut() { env.current = null; env.revision++; } });
  const app = env.app || (env.app = { session, preview: !!options.preview, ensureSession: async () => !!env.current });
  let currentRow = row();
  app.api = {
    async manualCopyRead(id) { calls.push({ method: 'read', id }); return options.read ? options.read(id) : copy(currentRow); },
    async manualCopyWrite(intent) {
      calls.push({ method: 'write', intent: copy(intent) });
      if (options.write) return options.write(intent);
      const result = outcome(intent); currentRow = result.row || null; return copy(result);
    },
  };
  const wx = { showModal(o) { modals.push(o); if (!options.manualModal) o.success({ confirm: true }); },
    navigateTo(o) { navigation.push(o.url); }, switchTab(o) { navigation.push(o.url); }, reLaunch(o) { navigation.push(o.url); } };
  let spec;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require(id) {
    if (id === '../../shared/page') { const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.resolve(root, id + '.js'), 'utf8'), { module: m, getApp: () => app, wx }); return m.exports; }
    return require(path.resolve(root, id));
  }, Page(s) { spec = s; }, getApp: () => app, wx });
  const page = { ...spec, data: copy(spec.data), setData(patch) { Object.assign(this.data, patch); } };
  return { page, env, app, calls, modals, navigation,
    async start(query = {}) { await page.onLoad(query); await page.onShow(); },
    change(kind) { env.revision++; if (kind === 'user') env.current = { ...env.current, userId: OTHER }; if (kind === 'shop') env.current = { ...env.current, shop: { id: OTHER } }; },
  };
}
const writes = h => h.calls.filter(c => c.method === 'write');
const reads = h => h.calls.filter(c => c.method === 'read');
async function loaded(options, edit = true) { const h = harness(options); await h.start(edit ? { id: ID } : {}); return h; }
function draft(h, title = '新标题', body = '新正文') { h.page.onTitle(ev(title)); h.page.onBody(ev(body)); }

test('real page shell first entry reads once and exposes only projected manual-copy fields', async () => {
  const h = await loaded();
  assert.equal(reads(h).length, 1); assert.equal(h.page.data.title, '第一条'); assert.equal(h.page.data.body, '第一段正文');
  assert.equal(h.page.data.candidateNames.length, 2); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, true);
  assert.equal(JSON.stringify(h.page.data).includes('private'), false); assert.equal(h.page.data.meta, undefined);
});

test('new copy has active empty local inputs but no mutation before explicit confirmation', async () => {
  const h = await loaded(undefined, false); assert.equal(h.page.data.editable, true); assert.equal(h.page.data.canSave, false);
  draft(h); assert.equal(h.page.data.canSave, true); assert.equal(writes(h).length, 0);
  await h.page.save(); assert.equal(writes(h).length, 1); assert.equal(h.modals.length, 1); assert.equal(h.page.data.saved, true);
  assert.equal(reads(h).at(-1).id, writes(h)[0].intent.id); assert.equal(h.page.data.pending, false);
  await h.page.save(); assert.equal(writes(h).length, 1);
});

test('edit changes only selected candidate and preserves other candidates, unknown keys and original hashtags', async () => {
  const h = await loaded(); await h.page.onCandidate(ev('1')); draft(h);
  await h.page.save(); const intent = writes(h)[0].intent, result = JSON.parse(intent.outputText);
  assert.equal(intent.operation, 'update'); assert.equal(intent.baseOutputText, row().output_text);
  assert.deepEqual(result[0], original[0]); assert.equal(result[1].title, '新标题'); assert.equal(result[1].body, '新正文');
  assert.deepEqual(result[1].topics, original[1].topics); assert.deepEqual(result[1].future_key, original[1].future_key);
  assert.equal(h.page.data.saved, true); assert.equal(h.page.data.receiptConfirmed, true);
});

test('plain original text and metadata candidates are both editable without installing metadata in setData', async () => {
  for (const base of [row({ output_text: '原始纯文本' }), row({ output_text: '原始纯文本', meta: { source: 'manual_upload', asset_class: 'upload', candidates: original } })]) {
    let latest = base;
    const h = await loaded({ read: () => latest, write: intent => { const out = outcome(intent); latest = { ...base, output_text: intent.outputText }; return { ...out, row: latest }; } });
    assert.ok(h.page.data.body); draft(h); await h.page.save(); assert.equal(h.page.data.saved, true);
    assert.equal(h.page.data.meta, undefined);
  }
});

test('legacy plain-text edit preserves first-candidate tags and unknown metadata without promoting stale alternatives', async () => {
  let latest = row({ output_text: '当前真实正文', meta: { source: 'manual_upload', asset_class: 'upload', candidates: original } });
  const h = await loaded({ read: () => latest, write: intent => { latest = { ...latest, output_text: intent.outputText }; return { ...outcome(intent), row: latest }; } });
  assert.equal(h.page.data.body, '当前真实正文'); assert.equal(h.page.data.candidateNames.length, 1);
  draft(h); await h.page.save(); const result = JSON.parse(writes(h)[0].intent.outputText);
  assert.deepEqual(result[0].hashtags, original[0].hashtags); assert.deepEqual(result[0].unknown, original[0].unknown); assert.equal(result.length, 1);
  assert.equal(h.page.data.saved, true);
});

test('non-upload manual lookalikes never grant editing or deletion', async () => {
  for (const asset_class of [undefined, null, 'generated', 'video']) {
    const h = await loaded({ read: () => row({ meta: { source: 'manual_upload', asset_class } }) });
    assert.equal(h.page.data.editable, false); await h.page.remove(); assert.equal(writes(h).length, 0);
  }
});

test('empty and oversize drafts remain intact and never mutate or silently truncate', async () => {
  const h = await loaded();
  for (const [title, body] of [['标题', ' '], ['字'.repeat(61), '正文'], ['标题', '文'.repeat(1001)]]) {
    draft(h, title, body); await h.page.save(); assert.equal(h.page.data.title, title); assert.equal(h.page.data.body, body);
    assert.equal(h.page.data.canSave, false); assert.ok(h.page.data.validation);
  }
  assert.equal(writes(h).length, 0);
});

test('valid 60-title/1000-body codepoints are accepted without lossy maxlength truncation', async () => {
  const h = await loaded(); draft(h, '字'.repeat(60), '文'.repeat(1000)); await h.page.save(); assert.equal(h.page.data.saved, true);
});

test('dirty candidate switch requires explicit discard and forged indices cannot change the selection', async () => {
  const h = await loaded({ manualModal: true }); draft(h, '不要丢');
  const switching = h.page.onCandidate(ev('1')); await tick(); assert.equal(h.modals.length, 1);
  h.modals[0].success({ confirm: false }); await switching; assert.equal(h.page.data.title, '不要丢'); assert.equal(h.page.data.candidateIndex, 0);
  for (const index of ['constructor', '-1', '1.5', '99', '__proto__']) await h.page.onCandidate(ev(index));
  assert.equal(h.page.data.candidateIndex, 0); assert.equal(h.modals.length, 1);
});

test('save and delete use separate confirmations; cancellation and double taps issue zero extra requests', async () => {
  const h = await loaded({ manualModal: true }); draft(h);
  const a = h.page.save(); await tick(); await h.page.save(); await h.page.remove(); assert.equal(h.modals.length, 1);
  h.modals[0].success({ confirm: false }); await a; assert.equal(writes(h).length, 0);
  const b = h.page.remove(); await tick(); assert.match(h.modals[1].content, /删除/);
  h.modals[1].success({ confirm: false }); await b; assert.equal(writes(h).length, 0); assert.equal(h.page.data.title, '新标题');
});

test('save modal cannot authorize modified drafts, hidden pages or switched scopes', async () => {
  for (const action of ['edit', 'hide', 'user', 'shop', 'revision', 'unload']) {
    const h = await loaded({ manualModal: true }); draft(h); const work = h.page.save(); await tick();
    if (action === 'edit') h.page.onBody(ev('另一个草稿'));
    else if (action === 'hide') h.page.onHide(); else if (action === 'unload') h.page.onUnload(); else h.change(action);
    h.modals[0].success({ confirm: true }); await work; assert.equal(writes(h).length, 0, action);
  }
});

test('write singleflight freezes original payload and waits for exact independent readback', async () => {
  const gate = deferred(); let sent;
  const h = await loaded({ write: intent => { sent = intent; return gate.promise; }, read: () => sent ? outcome(sent).row : row() });
  draft(h); const work = h.page.save(); await tick(); h.page.onBody(ev('不能覆盖')); await h.page.save(); await h.page.remove();
  assert.equal(writes(h).length, 1); assert.equal(h.page.data.body, '新正文'); assert.equal(h.page.data.saved, false);
  gate.resolve(outcome(sent)); await work; assert.equal(h.page.data.saved, true); assert.equal(reads(h).length, 2);
});

test('verified deletion representation plus absent exact-ID readback is required for confirmed removal', async () => {
  const h = await loaded(); await h.page.remove(); assert.equal(writes(h)[0].intent.operation, 'delete');
  assert.equal(h.page.data.saved, true); assert.equal(h.page.data.receiptConfirmed, true); assert.equal(reads(h).at(-1).id, ID);
});

for (const result of ['timeout', 'empty', 'wrong-id', 'wrong-operation']) test('unconfirmed mutation remains immutable pending: ' + result, async () => {
  const h = await loaded({ write: intent => {
    if (result === 'timeout') throw Error('private-timeout');
    if (result === 'empty') return {};
    return { ...outcome(intent), ...(result === 'wrong-id' ? { id: OTHER } : { operation: 'delete' }) };
  } });
  draft(h); await h.page.save(); const intent = copy(writes(h)[0].intent);
  assert.equal(h.page.data.saved, false); assert.equal(h.page.data.pending, true); assert.equal(h.page.data.editable, false);
  await h.page.save(); await h.page.remove(); h.page.onTitle(ev('篡改')); assert.equal(writes(h).length, 1); assert.deepEqual(writes(h)[0].intent, intent);
});

for (const kind of ['create', 'update', 'delete']) test('unknown ' + kind + ' reconciliation is read-only and absence never releases the intent', async () => {
  let sent;
  const h = await loaded({ read: () => sent ? null : row(), write: intent => { sent = intent; throw Error('timeout'); } }, kind !== 'create');
  if (kind !== 'delete') draft(h);
  await (kind === 'delete' ? h.page.remove() : h.page.save()); await h.page.reconcile();
  assert.equal(h.page.data.saved, false); assert.equal(h.page.data.pending, true); assert.match(h.page.data.notice, /不代表|不能确认/);
  await h.page.save(); assert.equal(writes(h).length, 1); assert.equal(reads(h).at(-1).id, sent.id);
});

test('unknown create/update can confirm only an exact owned matching row, never another resource or content', async () => {
  for (const create of [true, false]) {
    let sent, visible = null;
    const h = await loaded({ read: () => sent ? visible : row(), write: intent => { sent = intent; throw Error('timeout'); } }, !create);
    draft(h); await h.page.save();
    for (const patch of [{ id: OTHER }, { user_id: OTHER }, { shop_id: OTHER }, { kind: 'video' }, { meta: { source: 'generated' } }, { output_text: '不匹配' }]) {
      visible = { ...outcome(sent).row, ...patch }; await h.page.reconcile(); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.pending, true);
    }
    visible = outcome(sent).row; await h.page.reconcile(); assert.equal(h.page.data.saved, true); assert.equal(writes(h).length, 1);
  }
});

test('readback failure after representation retains confirmation and retries only reads', async () => {
  let sent, fail = true;
  const h = await loaded({ read: () => { if (!sent) return row(); if (fail) throw error(500); return outcome(sent).row; }, write: intent => { sent = intent; return outcome(intent); } });
  draft(h); await h.page.save(); assert.equal(h.page.data.receiptConfirmed, true); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.pending, true);
  fail = false; await h.page.reconcile(); assert.equal(h.page.data.saved, true); assert.equal(writes(h).length, 1);
});

for (const hide of ['hide', 'unload']) for (const represented of [false, true]) test(hide + ' retains original ' + (represented ? 'confirmed' : 'unknown') + ' intent across fresh reentry', async () => {
  let sent;
  const first = await loaded({ write: intent => { sent = intent; if (!represented) throw Error('timeout'); return outcome(intent); }, read: () => sent ? Promise.reject(error(500)) : row() }, false);
  draft(first); await first.page.save(); first.page[hide === 'hide' ? 'onHide' : 'onUnload']();
  assert.equal(first.page.data.title, ''); assert.equal(first.page.data.body, '');
  const next = harness({ env: first.env, read: () => null }); await next.start();
  assert.equal(next.page.data.pending, true); assert.equal(next.page.data.receiptConfirmed, represented);
  await next.page.save(); await next.page.remove(); assert.equal(writes(next).length, 0);
  await next.page.reconcile(); assert.equal(reads(next).at(-1).id, sent.id); assert.equal(next.page.data.saved, false); assert.equal(next.page.data.pending, true);
});

test('late hidden representation is retained without readback or hidden render, then explicit read-only recovery completes', async () => {
  const gate = deferred(); let sent;
  const h = await loaded({ write: intent => { sent = intent; return gate.promise; }, read: () => sent ? outcome(sent).row : row() });
  draft(h); const work = h.page.save(); await tick(); h.page.onHide(); gate.resolve(outcome(sent)); await work;
  assert.equal(h.page.data.title, ''); assert.equal(h.page.data.saved, false); assert.equal(reads(h).length, 1);
  await h.page.onShow(); assert.equal(h.page.data.pending, true); assert.equal(h.page.data.receiptConfirmed, true);
  await h.page.reconcile(); assert.equal(h.page.data.saved, true); assert.equal(writes(h).length, 1);
});

test('opening a newly visible ID cannot bypass the original unknown create slot', async () => {
  let sent;
  const first = await loaded({ write: intent => { sent = intent; throw Error('timeout'); } }, false);
  draft(first); await first.page.save(); first.page.onUnload();
  const next = harness({ env: first.env, read: () => outcome(sent).row }); await next.start({ id: sent.id });
  assert.equal(next.page.data.pending, true); assert.equal(next.page.data.editable, false);
  await next.page.save(); await next.page.remove(); assert.equal(writes(next).length, 0);
});

test('reconciliation through the created resource ID clears its original create slot only after matching content', async () => {
  let sent;
  const first = await loaded({ write: intent => { sent = intent; throw Error('timeout'); } }, false);
  draft(first); await first.page.save(); first.page.onUnload();
  const next = harness({ env: first.env, read: () => outcome(sent).row }); await next.start({ id: sent.id });
  await next.page.reconcile(); assert.equal(next.page.data.saved, true);
  assert.equal(Object.keys(next.app._manualCopyPending).length, 0);
  const fresh = await loaded({ env: first.env }, false); assert.equal(fresh.page.data.pending, false); assert.equal(fresh.page.data.title, '');
});

test('same-scope hide/show preserves an unsent draft but explicit reload requires discard confirmation', async () => {
  const h = await loaded({ manualModal: true }); draft(h, '保留本地'); h.page.onHide(); await h.page.onShow(); assert.equal(h.page.data.title, '保留本地');
  const work = h.page.reloadLatest(); await tick(); h.modals[0].success({ confirm: false }); await work; assert.equal(h.page.data.title, '保留本地');
  const adopt = h.page.reloadLatest(); await tick(); h.modals[1].success({ confirm: true }); await adopt; assert.equal(h.page.data.title, '第一条');
});

test('fresh server change preserves draft, latches conflict and requires explicit latest adoption', async () => {
  let latest = row(); const h = await loaded({ read: () => latest }); draft(h, '本地草稿');
  latest = row({ output_text: JSON.stringify([{ title: '服务器更新', body: '新的正文' }]) });
  h.page.onHide(); await h.page.onShow(); assert.equal(h.page.data.title, '本地草稿'); assert.equal(h.page.data.conflict, true); assert.equal(h.page.data.canSave, false);
  await h.page.reloadLatest(); assert.equal(h.page.data.title, '服务器更新'); assert.equal(h.page.data.conflict, false);
});

test('scope change clears private state; old shop/account cannot restore another scoped pending intent', async () => {
  for (const change of ['user', 'shop']) {
    const h = await loaded({ write: () => { throw Error('timeout'); } }, false); draft(h, '原账号私密草稿'); await h.page.save(); h.page.onUnload(); h.change(change);
    const next = await loaded({ env: h.env }, false); assert.equal(next.page.data.pending, false); assert.equal(next.page.data.title, '');
  }
});

test('same actor new revision restores only unresolved intent after a fresh gate, not an unsent draft', async () => {
  const fresh = deferred(); const h = await loaded(undefined, false); draft(h, '旧草稿'); h.change('revision');
  h.page.onHide(); const showing = h.page.onShow(); await showing; assert.equal(h.page.data.title, '');
  const first = await loaded({ write: () => { throw Error('timeout'); } }, false); draft(first); await first.page.save(); first.page.onUnload(); first.change('revision');
  const next = harness({ env: first.env, fresh: () => fresh.promise }); const work = next.start(); await tick(); assert.equal(next.page.data.pending, false); assert.equal(next.page.data.title, '');
  fresh.resolve(); await work; assert.equal(next.page.data.pending, true);
});

test('current 401 uses shared logout; current 403 closes editor while retaining original intent', async () => {
  for (const status of [401, 403]) {
    const h = await loaded({ write: () => { throw error(status); } }); draft(h); await h.page.save();
    assert.equal(h.page.data.title, ''); assert.equal(h.page.data.editable, false);
    assert.equal(h.navigation.includes('/pages/login/index'), status === 401);
    if (status === 403) { assert.equal(h.env.current.userId, USER); assert.ok(h.page.data.error); }
  }
});

test('hidden, unloaded, revised or switched-identity late 401 never logs out current/new account', async () => {
  for (const action of ['hide', 'unload', 'revision', 'user']) {
    const gate = deferred(); const h = await loaded({ write: () => gate.promise }); draft(h); const work = h.page.save(); await tick();
    if (action === 'hide') h.page.onHide(); else if (action === 'unload') h.page.onUnload(); else h.change(action);
    gate.reject(error(401)); await work; assert.ok(h.env.current); assert.equal(h.navigation.length, 0); assert.equal(h.page.data.title, '');
  }
});

test('late read responses and finally cannot repopulate hidden/revised identity or reauthorize writes', async () => {
  for (const action of ['hide', 'unload', 'revision', 'user', 'shop']) {
    const gate = deferred(); const h = harness({ read: () => gate.promise }); await h.page.onLoad({ id: ID }); const showing = h.page.onShow(); await tick();
    if (action === 'hide') h.page.onHide(); else if (action === 'unload') h.page.onUnload(); else h.change(action);
    gate.resolve(row()); await showing; assert.equal(h.page.data.title, ''); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, false);
  }
});

test('invalid id/missing selected scope and forged foreign/generated rows never grant editor access', async () => {
  const bad = harness(); await bad.start({ id: 'constructor' }); assert.equal(reads(bad).length, 0); assert.equal(bad.page.data.editable, false);
  for (const current of [null, { userId: USER, shop: null }, { userId: USER, shop: { id: 'bad' } }]) {
    const h = harness({ env: { current, revision: 1 } }); await h.start(); await h.page.save(); assert.equal(h.calls.length, 0);
  }
  for (const patch of [{ id: OTHER }, { user_id: OTHER }, { shop_id: OTHER }, { kind: 'photo' }, { meta: { source: 'generated' } }]) {
    const h = await loaded({ read: () => row(patch) }); await h.page.remove(); assert.equal(h.page.data.editable, false); assert.equal(writes(h).length, 0);
  }
});

test('preview supports local inputs/candidate selection but all mutation and reconciliation handlers make zero network writes', async () => {
  const h = await loaded({ preview: true }); draft(h); await h.page.save(); await h.page.remove(); await h.page.reconcile();
  assert.equal(h.page.data.title, '新标题'); assert.equal(h.page.data.editable, true); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, false);
  assert.equal(writes(h).length, 0); assert.equal(reads(h).length, 1); assert.equal(h.modals.length, 0);
});

test('native return stays in the existing material library, without an AI copy menu or parameter grant', async () => {
  const h = await loaded(); h.page.returnLibrary(); assert.deepEqual(h.navigation, ['/pages/marketing/index?tab=library']);
});

test('native template binds dynamic states, unlimited local input and separate confirmation/reconciliation controls', () => {
  const file = path.join(root, 'index.wxml'); assert.ok(fs.existsSync(file), 'manual-copy WXML must exist'); const xml = fs.readFileSync(file, 'utf8');
  for (const handler of ['onTitle', 'onBody', 'onCandidate', 'save', 'remove', 'reconcile', 'reloadLatest', 'returnLibrary']) assert.match(xml, new RegExp('bind(?:tap|input|change)="' + handler + '"'));
  for (const match of xml.matchAll(/\bwx:(?:if|elif)\s*=\s*(["'])([\s\S]*?)\1/g)) assert.match(match[2].trim(), /^\{\{[\s\S]+\}\}$/);
  assert.equal((xml.match(/maxlength="-1"/g) || []).length, 2); assert.doesNotMatch(xml, /web-view|generate|retrySame/);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')); assert.equal(config.navigationBarTitleText, '手动文案');
});
