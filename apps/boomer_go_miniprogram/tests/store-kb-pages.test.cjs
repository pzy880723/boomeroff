const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../miniprogram');
const SHOP = '00000000-0000-4000-8000-000000000001', USER = '00000000-0000-4000-8000-000000000002';
const ID = '00000000-0000-4000-8000-000000000003', CAT = '00000000-0000-4000-8000-000000000004', OTHER = '00000000-0000-4000-8000-000000000005';
const NOW = '2026-10-16T09:20:00+08:00', V1 = '1'.repeat(64), V2 = '2'.repeat(64);
const ABORT_PAIRS = [[400, 'invalid_params'], [404, 'not_found'], [409, 'version_conflict'], [422, 'invalid_category'], [422, 'title_too_long'], [422, 'body_too_long'], [422, 'invalid_tags']];
const limits = { title_chars: 200, body_chars: 40000, tags: 20, tag_chars: 40, query_chars: 200 };
const caps = extra => ({ shop_id: SHOP, type: 'sop', can_write: true, limits, ...extra });
const category = extra => ({ id: CAT, shop_id: SHOP, type: 'sop', name: '开店', sort_order: 0, ...extra });
const entry = extra => ({ id: ID, shop_id: SHOP, type: 'sop', category_id: CAT, title: '开店流程', body: '# 开店\n**检查**灯光\n- 整理货架\n\n|项目|说明|\n|---|---|\n|陈列|整齐|', tags: ['okr-highlight', '每日'], sort_order: 7, created_by: USER, created_at: NOW, updated_at: NOW, ...extra });
const item = extra => { const e = entry(extra); return { ...e, body_preview: '检查灯光' }; };
const listing = (p = {}, extra) => ({ shop_id: SHOP, type: p.type || 'sop', query: p.q || '', category_id: p.category_id || null, items: [item({ type: p.type || 'sop' })], categories: [category({ type: p.type || 'sop' })], page: p.page || 0, page_size: p.page_size || 20, has_more: false, as_of: NOW, ...extra });
const detail = extra => ({ shop_id: SHOP, type: 'sop', entry: entry(), categories: [category()], version: V1, can_edit: true, can_delete: true, as_of: NOW, ...extra });
const receipt = (p, extra) => ({ shop_id: p.shop_id, type: p.type, request_id: p.request_id, operation: p.operation, actor_id: USER, entry_id: p.entry_id || ID, version: V2, deleted: p.operation === 'delete', recorded_at: NOW, replay: false, ...extra });
const readback = p => detail({ entry: entry({ id: p.entry_id || ID, title: p.title, body: p.body, tags: p.tags, category_id: p.category_id }), version: V2 });
const status = (p, r = null) => ({ shop_id: p.shop_id, type: p.type, request_id: p.request_id, operation: p.operation, requested_entry_id: p.entry_id || null, state: r ? 'succeeded' : 'not_found', receipt: r });
const ev = value => ({ detail: { value } });
const event = data => ({ currentTarget: { dataset: data } });
const error = (status, code) => Object.assign(Error(code), { status, code });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(r => setImmediate(r));
function model() { return require('../miniprogram/pages/store-kb/model'); }
function harness(name, handler, options = {}) {
  const filename = path.join(root, 'pages', name, 'index.js');
  assert.ok(fs.existsSync(filename), 'native ' + name + ' page must exist');
  const env = options.env || { revision: 1, current: options.current === undefined ? { userId: USER, shop: { id: SHOP, name: '授权门店' }, scopeVersion: 1 } : options.current };
  const calls = [], modals = [], urls = [];
  const wx = { showModal(o) { modals.push(o); if (!options.manualModal) o.success({ confirm: true }); }, navigateTo(o) { urls.push(o.url); }, switchTab(o) { urls.push(o.url); }, reLaunch(o) { wx.login = o.url; } };
  const session = env.session || (env.session = { get: () => env.current, revision: () => env.revision, signOut() { env.current = null; env.revision++; } });
  const app = env.app || (env.app = { session, preview: !!options.preview, ensureSession: async () => !!env.current });
  app.api = { async action(action, params) { calls.push({ action, params: structuredClone(params) }); return handler(action, params); } };
  let spec;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { require(id) {
    if (id === '../../shared/page') { const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module: m, getApp: () => app, wx }); return m.exports; }
    return require(path.resolve(path.dirname(filename), id));
  }, Page(x) { spec = x; }, wx, getApp: () => app });
  const page = { ...spec, data: structuredClone(spec.data), setData(data) { Object.assign(this.data, data); } };
  return { page, calls, modals, urls, env, app, wx, async start(q = { type: 'sop', ...(name === 'store-kb-edit' ? { id: ID } : {}) }) { await page.onLoad(q); await page.onShow(); }, change(kind) { env.revision++; if (kind === 'user') env.current = { ...env.current, userId: OTHER }; if (kind === 'shop') env.current = { ...env.current, shop: { id: OTHER } }; if (kind === 'scope') env.current = { ...env.current, scopeVersion: 2 }; } };
}
async function loaded(name = 'store-kb-edit', handler, options, query) {
  const h = harness(name, handler || (async (a, p) => a === 'kb-capabilities' ? caps({ type: p.type }) : a === 'kb-list' ? listing(p) : detail()), options);
  await h.start(query); return h;
}

test('invalid type/id, missing identity or unverified shop make zero requests', async () => {
  for (const name of ['store-kb', 'store-kb-edit']) for (const query of [{}, { type: 'other' }, { type: 'sop', id: 'bad' }]) {
    const h = harness(name, async () => { throw Error('no calls'); }); await h.start(query); await h.page.refresh();
    assert.equal(h.calls.length, 0); assert.ok(h.page.data.error);
  }
  for (const current of [null, { userId: USER, shop: null }, { userId: USER, shop: { id: 'not-a-shop' } }]) {
    const h = await loaded('store-kb', undefined, { current }); assert.equal(h.calls.length, 0);
  }
});

test('capability flags, limits, shop and type must be exact; a reader still reads but cannot write', async () => {
  for (const c of [caps({ can_write: 'true' }), caps({ shop_id: OTHER }), caps({ type: 'qa' }), caps({ limits: { ...limits, tags: 99 } })]) {
    const h = await loaded('store-kb-edit', async () => c); assert.deepEqual(h.calls.map(x => x.action), ['kb-capabilities']); assert.equal(h.page.data.canSave, false);
  }
  const h = await loaded('store-kb-edit', async a => a === 'kb-capabilities' ? caps({ can_write: false }) : detail());
  assert.equal(h.page.data.title, '开店流程'); assert.equal(h.page.data.editable, false); await h.page.save(); await h.page.remove(); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 0);
});

test('list uses real server query/category/page echoes and current/shared scope without invented totals', async () => {
  const h = await loaded('store-kb', async (a, p) => a === 'kb-capabilities' ? caps({ type: p.type }) : listing(p, { items: [item(), item({ id: OTHER, shop_id: null })], categories: [category(), category({ id: OTHER, shop_id: null })] }));
  assert.equal(h.page.data.items.length, 2); assert.equal(h.page.data.items[1].scopeLabel, '共享 · 只读');
  assert.equal(h.page.data.canCreate, true); h.page.onQuery(ev('灯_%,光')); await h.page.search();
  assert.equal(h.calls.at(-1).params.q, '灯_%,光'); assert.equal(h.calls.at(-1).params.page, 0);
  await h.page.category(event({ id: CAT })); assert.equal(h.calls.at(-1).params.category_id, CAT);
  await h.page.switchType(event({ type: 'qa' })); assert.equal(h.calls.at(-1).params.type, 'qa'); assert.equal(h.calls.at(-1).params.q, '');
  assert.equal(h.page.data.total, undefined);
});

test('list rejects foreign rows/categories, wrong query/page and missing pagination metadata', async () => {
  for (const patch of [{ items: [item({ shop_id: OTHER })] }, { items: [item({ type: 'qa' })] }, { categories: [category({ shop_id: OTHER })] }, { query: 'wrong' }, { page: 1 }, { has_more: undefined }, { as_of: 'bad' }]) {
    const h = await loaded('store-kb', async (a, p) => a === 'kb-capabilities' ? caps() : listing(p, patch)); assert.equal(h.page.data.items.length, 0); assert.ok(h.page.data.error);
  }
});

test('pagination dedupes but respects server has_more, retries the same failed page and retains loaded results', async () => {
  let fail = true;
  const h = await loaded('store-kb', async (a, p) => { if (a === 'kb-capabilities') return caps(); if (p.page === 1 && fail) throw Error('断网'); return listing(p, { has_more: p.page < 2 }); });
  await h.page.loadMore(); assert.equal(h.page.data.items.length, 1); assert.equal(h.page.data.hasMore, true); assert.ok(h.page.data.error);
  fail = false; await h.page.loadMore(); assert.equal(h.calls.at(-1).params.page, 1); assert.equal(h.page.data.items.length, 1); assert.equal(h.page.data.hasMore, true);
  await h.page.loadMore(); assert.equal(h.calls.at(-1).params.page, 2); assert.equal(h.page.data.hasMore, false);
});

test('overlong query is not silently truncated and does not call search', async () => {
  const h = await loaded('store-kb'); const count = h.calls.length; h.page.onQuery(ev('😀'.repeat(201))); await h.page.search();
  assert.equal(h.calls.length, count); assert.equal(Array.from(h.page.data.query).length, 201); assert.ok(h.page.data.error);
});

test('type switches and hidden late responses cannot paint old lists or sign out a new session', async () => {
  const gate = deferred(); const h = harness('store-kb', async (a, p) => a === 'kb-capabilities' ? caps({ type: p.type }) : p.type === 'sop' ? gate.promise : listing(p));
  const first = h.start(); await tick(); await h.page.switchType(event({ type: 'qa' })); gate.resolve(listing()); await first;
  assert.equal(h.page.data.type, 'qa'); assert.equal(h.page.data.items[0].type, 'qa');
  for (const mode of ['hide', 'unload', 'revision', 'user', 'shop', 'scope']) {
    const pending = deferred(); const x = harness('store-kb', async a => a === 'kb-capabilities' ? caps() : pending.promise); const work = x.start(); await tick();
    if (mode === 'hide') x.page.onHide(); else if (mode === 'unload') x.page.onUnload(); else x.change(mode);
    pending.reject(error(401, 'old')); await work; assert.equal(x.page.data.items.length, 0); assert.ok(x.env.current); assert.equal(x.wx.login, undefined);
  }
});

test('safe native Markdown retains headings bold lists and tables without active HTML/links/images', async () => {
  const md = require('../miniprogram/pages/store-kb/markdown');
  const blocks = md.parse('# 标题\n**重点**\n- 项目\n\n|列一|列二|\n|---|---|\n|甲|乙|\n<script>x</script>\n[链接](https://evil.test)\n![图](https://evil.test/a.png)');
  assert.ok(blocks.some(x => x.kind === 'heading')); assert.ok(blocks.some(x => x.kind === 'list')); assert.ok(blocks.some(x => x.kind === 'table'));
  const serialized = JSON.stringify(blocks); assert.doesNotMatch(serialized, /"(?:src|href|style)":|"name":"(?:script|img|a)"/); assert.match(serialized, /"name":"strong"/); assert.match(serialized, /<script>/);
  const h = await loaded('store-kb', undefined, undefined, { type: 'sop', id: ID }); assert.equal(h.page.data.entry.tags.length, 2); assert.ok(h.page.data.blocks.length);
});

test('read/edit detail binds exact scope/id/version and global NULL is never editable even with contradictory flags', async () => {
  for (const change of [{ shop_id: OTHER }, { type: 'qa' }, { version: 'bad' }, { entry: entry({ id: OTHER }) }, { entry: entry({ shop_id: OTHER }) }]) {
    const h = await loaded('store-kb-edit', async a => a === 'kb-capabilities' ? caps() : detail(change)); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.title, ''); assert.ok(h.page.data.error);
  }
  const h = await loaded('store-kb-edit', async a => a === 'kb-capabilities' ? caps() : detail({ entry: entry({ shop_id: null }) }));
  assert.equal(h.page.data.editable, false); assert.equal(h.page.data.canDelete, false); await h.page.save(); await h.page.remove(); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 0);
});

test('normalization uses codepoints, preserves empty/exact body and okr tags, validates all existing category IDs', () => {
  const m = model(); const d = m.normalizeDraft({ title: ' 标题 ', body: '', tagsText: 'okr-highlight, 标签，标签, ', categoryId: CAT }, [category()]);
  assert.deepEqual(d, { title: '标题', body: '', tags: ['okr-highlight', '标签'], category_id: CAT });
  assert.equal(m.normalizeDraft({ title: '😀'.repeat(200), body: ' \n ', tagsText: '😀'.repeat(40), categoryId: null }, []).body, ' \n ');
  for (const patch of [{ title: ' ' }, { title: '😀'.repeat(201) }, { body: '😀'.repeat(40001) }, { tagsText: '😀'.repeat(41) }, { tagsText: Array.from({ length: 21 }, (_, i) => String(i)).join(',') }, { categoryId: OTHER }]) assert.throws(() => m.normalizeDraft({ title: '题', body: '', tagsText: '', categoryId: null, ...patch }, [category()]));
  assert.equal(m.transactionAborted(error(409, 'version_conflict')), true, 'final source proves this exact first-send abort pair');
});

test('oversize existing title/body/tags are retained without truncation and cannot save until valid', async () => {
  const e = entry({ title: '题'.repeat(201), body: '文'.repeat(40001), tags: ['标'.repeat(41)] }); const h = await loaded('store-kb-edit', async a => a === 'kb-capabilities' ? caps() : detail({ entry: e }));
  assert.equal(h.page.data.title, e.title); assert.equal(h.page.data.body, e.body); assert.equal(h.page.data.tagsText, e.tags[0]); assert.equal(h.page.data.canSave, false);
  await h.page.save(); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 0);
});

test('create/update send only frozen whitelisted fields and require receipt plus exact version/content readback', async () => {
  for (const create of [true, false]) {
    let sent;
    const h = await loaded('store-kb-edit', async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-list' ? listing(p) : a === 'kb-write' ? (sent = structuredClone(p), receipt(p)) : sent ? readback(sent) : detail(), undefined, { type: 'sop', ...(create ? {} : { id: ID }) });
    h.page.onTitle(ev(' 修改标题 ')); h.page.onBody(ev('')); h.page.onTags(ev('okr-highlight,新标')); await h.page.save();
    assert.equal(sent.operation, create ? 'create' : 'update'); assert.equal(sent.title, '修改标题'); assert.equal(sent.body, ''); assert.deepEqual(sent.tags, ['okr-highlight', '新标']);
    assert.equal(sent.entry_id, create ? undefined : ID); assert.equal(sent.expected_version, create ? undefined : V1);
    assert.deepEqual(Object.keys(sent).sort(), ['shop_id', 'type', 'request_id', 'operation', 'category_id', 'title', 'body', 'tags', ...(create ? [] : ['entry_id', 'expected_version'])].sort());
    assert.match(sent.request_id, /^[a-f0-9-]{36}$/); assert.equal(h.page.data.saved, true); assert.equal(h.page.data.pending, false); assert.equal(Object.keys(h.app._storeKbPending).length, 0);
  }
});

test('delete uses a separate danger modal, and only exact receipt plus scoped 404 not_found proves absence', async () => {
  for (const outcome of ['not_found', 'forbidden', 'network', 'other404', 'exists']) {
    let sent;
    const h = await loaded('store-kb-edit', async (a, p) => { if (a === 'kb-capabilities') return caps(); if (a === 'kb-write') { sent = p; return receipt(p); } if (!sent) return detail(); if (outcome === 'not_found') throw error(404, 'not_found'); if (outcome === 'forbidden') throw error(403, 'forbidden'); if (outcome === 'other404') throw error(404, 'other'); if (outcome === 'network') throw Error('断网'); return detail(); });
    await h.page.remove(); assert.equal(sent.operation, 'delete'); assert.equal(sent.title, undefined); assert.equal(h.page.data.saved, outcome === 'not_found', outcome); assert.match(h.modals[0].content, /删除/);
    assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 1); if (outcome !== 'forbidden') await h.page.save(); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 1);
  }
});

test('wrong receipt metadata never confirms success; receipt readback mismatch retries read only', async () => {
  for (const patch of [{ actor_id: OTHER }, { request_id: OTHER }, { shop_id: OTHER }, { type: 'qa' }, { operation: 'create' }, { entry_id: OTHER }, { version: 'bad' }, { deleted: true }, { recorded_at: 'bad' }, { replay: 1 }]) {
    const h = await loaded('store-kb-edit', async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-write' ? receipt(p, patch) : detail()); await h.page.save(); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.receiptConfirmed, false); assert.equal(h.page.data.pending, true);
  }
  for (const field of ['title', 'body', 'tags', 'category_id', 'version']) {
    let sent;
    const h = await loaded('store-kb-edit', async (a, p) => { if (a === 'kb-capabilities') return caps(); if (a === 'kb-write') { sent = p; return receipt(p); } if (!sent) return detail(); const d = readback(sent); if (field === 'version') d.version = V1; else d.entry[field] = field === 'tags' ? [] : field === 'category_id' ? null : '不匹配'; return d; });
    await h.page.save(); assert.equal(h.page.data.receiptConfirmed, true); assert.equal(h.page.data.saved, false); assert.ok(h.page.data.readbackError); await h.page.retryReadback(); await h.page.save(); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 1);
  }
});

test('same-page hide preserves unsent draft, conflict keeps old CAS and explicit latest reload is required', async () => {
  let changed = false;
  const h = await loaded('store-kb-edit', async a => a === 'kb-capabilities' ? caps() : detail({ version: changed ? V2 : V1 })); h.page.onTitle(ev('草稿')); h.page.onBody(ev('未保存'));
  h.page.onHide(); assert.equal(h.page.data.title, ''); await h.page.onShow(); assert.equal(h.page.data.title, '草稿'); changed = true; await h.page.refresh(); assert.equal(h.page.data.conflict, true); assert.equal(h.page.data.canSave, false);
  await h.page.save(); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 0); await h.page.reloadLatest(); assert.equal(h.page.data.title, '开店流程'); assert.equal(h.page.data.conflict, false);
});

test('cancel, edited modal draft and lifecycle boundaries prevent mutations', async () => {
  for (const mode of ['cancel', 'edit', 'hide', 'unload', 'revision', 'user', 'shop', 'scope']) {
    const h = await loaded('store-kb-edit', undefined, { manualModal: true }); const work = h.page.save(); assert.equal(h.modals.length, 1);
    if (mode === 'edit') h.page.onTitle(ev('另稿')); else if (mode === 'hide') h.page.onHide(); else if (mode === 'unload') h.page.onUnload(); else if (mode !== 'cancel') h.change(mode);
    h.modals[0].success({ confirm: mode !== 'cancel' }); await work; assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 0, mode);
  }
});

async function unknown(options) { const h = await loaded('store-kb-edit', async a => a === 'kb-capabilities' ? caps() : a === 'kb-write' ? Promise.reject(Error('超时')) : detail(), options); h.page.onTitle(ev('冻结草稿')); await h.page.save(); return h; }

test('unknown intent survives unload in isolated App RAM and restores only after fresh caps/detail', async () => {
  const first = await unknown(); const original = first.calls.find(x => x.action === 'kb-write').params; first.page.onUnload();
  const gate = deferred(); const second = harness('store-kb-edit', async a => a === 'kb-capabilities' ? caps() : gate.promise, { env: first.env }); const work = second.start(); await tick();
  assert.equal(second.page.data.title, ''); await second.page.reconcile(); assert.equal(second.calls.filter(x => x.action === 'kb-write-status').length, 0); gate.resolve(detail()); await work;
  assert.equal(second.page.data.title, '冻结草稿'); assert.equal(second.page.data.pending, true); assert.equal(second.page.data.canSave, false); assert.equal(second.calls.filter(x => x.action === 'kb-write').length, 0);
  assert.equal(Object.values(second.app._storeKbPending)[0].payload.request_id, original.request_id);
  for (const change of ['user', 'shop']) { const h = await unknown(); h.page.onUnload(); h.change(change); const x = await loaded('store-kb-edit', async (a, p) => a === 'kb-capabilities' ? caps({ shop_id: p.shop_id }) : detail({ shop_id: p.shop_id, entry: entry({ shop_id: p.shop_id }) }), { env: h.env }); assert.equal(x.page.data.pending, false); assert.notEqual(x.page.data.title, '冻结草稿'); }
});

test('status not_found preserves history and only a second explicit modal may resend exact frozen payload', async () => {
  let sent, writes = 0;
  const h = await loaded('store-kb-edit', async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-write' ? (++writes === 1 ? (sent = structuredClone(p), Promise.reject(Error('超时'))) : receipt(p)) : a === 'kb-write-status' ? status(p) : writes > 1 ? readback(sent) : detail());
  await h.page.save(); await h.page.retrySame(); assert.equal(writes, 1); h.page.onTitle(ev('不应改冻结稿')); await h.page.reconcile(); assert.match(h.page.data.notice, /不代表|不能/); assert.equal(h.page.data.pending, true);
  await h.page.retrySame(); assert.equal(writes, 2); assert.deepEqual(h.calls.filter(x => x.action === 'kb-write')[1].params, sent); assert.equal(h.page.data.saved, true);
});

test('status echoes and receipt must bind exactly; request conflict blocks same-key retry', async () => {
  for (const patch of [{ type: 'qa' }, { shop_id: OTHER }, { operation: 'create' }, { requested_entry_id: OTHER }, { request_id: OTHER }, { receipt: receipt({ shop_id: SHOP, type: 'sop', operation: 'update', request_id: OTHER, entry_id: ID }) }]) {
    let sent; const h = await loaded('store-kb-edit', async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-write' ? (sent = p, Promise.reject(Error('超时'))) : a === 'kb-write-status' ? { ...status(p, receipt(sent)), ...patch } : detail()); await h.page.save(); await h.page.reconcile(); assert.equal(h.page.data.receiptConfirmed, false); assert.equal(h.page.data.saved, false);
  }
  const h = await loaded('store-kb-edit', async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-write' ? Promise.reject(error(409, 'request_id_conflict')) : a === 'kb-write-status' ? status(p) : detail()); await h.page.save(); await h.page.reconcile(); await h.page.retrySame(); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 1);
});

test('delete status can recover a receipt after target absence without guessing deletion from a lookup alone', async () => {
  let sent; const first = await loaded('store-kb-edit', async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-write' ? (sent = p, Promise.reject(Error('超时'))) : detail()); await first.page.remove(); first.page.onUnload();
  const next = await loaded('store-kb-edit', async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-write-status' ? status(p, receipt(sent)) : Promise.reject(error(404, 'not_found')), { env: first.env });
  assert.equal(next.page.data.pending, true); assert.equal(next.page.data.saved, false); await next.page.reconcile(); assert.equal(next.page.data.saved, true); assert.equal(Object.keys(next.app._storeKbPending).length, 0);
});

test('403 hides private draft but preserves pending; restored intents never release on guessed aborts', async () => {
  const first = await unknown(); first.app.api.action = first.page.api.action = async () => { throw error(403, 'forbidden'); }; await first.page.reconcile(); assert.equal(first.page.data.title, ''); assert.equal(first.page.data.pending, false); assert.equal(Object.keys(first.app._storeKbPending).length, 1);
  first.page.onUnload(); const next = await loaded('store-kb-edit', async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-write-status' ? status(p) : a === 'kb-write' ? Promise.reject(error(409, 'version_conflict')) : detail(), { env: first.env });
  await next.page.reconcile(); await next.page.retrySame(); assert.equal(next.page.data.pending, true); assert.equal(Object.keys(next.app._storeKbPending).length, 1);
});

test('singleflight and hidden late mutation response retain intent without accepting an old receipt', async () => {
  const gate = deferred(); const h = await loaded('store-kb-edit', async a => a === 'kb-capabilities' ? caps() : a === 'kb-write' ? gate.promise : detail()); const work = h.page.save(); await tick(); await h.page.save(); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 1);
  const sent = h.calls.find(x => x.action === 'kb-write').params; h.page.onHide(); gate.resolve(receipt(sent)); await work; assert.equal(h.page.data.receiptConfirmed, false); assert.equal(h.page.data.title, ''); assert.equal(Object.keys(h.app._storeKbPending).length, 1);
});

test('preview permits local draft editing but invokes zero writes/status and never reports saved', async () => {
  const h = await loaded('store-kb-edit', undefined, { preview: true }); h.page.onTitle(ev('合成草稿')); assert.equal(h.page.data.title, '合成草稿'); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, false);
  await h.page.save(); await h.page.remove(); await h.page.reconcile(); await h.page.retrySame(); assert.equal(h.calls.filter(x => /kb-write/.test(x.action)).length, 0); assert.equal(h.page.data.saved, false);
});

test('native templates have unlimited input capture, real error/retry states and only approved SOP/QA entries change', () => {
  const edit = fs.readFileSync(path.join(root, 'pages/store-kb-edit/index.wxml'), 'utf8'); const list = fs.readFileSync(path.join(root, 'pages/store-kb/index.wxml'), 'utf8');
  assert.ok((edit.match(/maxlength="-1"/g) || []).length >= 3); assert.match(edit, /bindtap="retry"/); assert.match(edit, /bindtap="save"/); assert.match(edit, /bindtap="remove"/); assert.match(list, /bindtap="loadMore"/); assert.doesNotMatch(edit + list, /web-view|&amp;&amp;/);
  for (const file of ['pages/workbench/index.js', 'pages/mine/index.js', 'pages/learn/index.wxml']) { const source = fs.readFileSync(path.join(root, file), 'utf8'); assert.match(source, /\/pages\/store-kb\/index\?type=sop/); assert.match(source, /\/pages\/store-kb\/index\?type=qa/); }
});

test('every KB wx:if and wx:elif uses an expression binding, never a truthy literal attribute', () => {
  const invalid = [];
  for (const name of ['store-kb', 'store-kb-edit']) {
    const source = fs.readFileSync(path.join(root, 'pages', name, 'index.wxml'), 'utf8');
    const conditions = [...source.matchAll(/\bwx:(if|elif)\s*=\s*(["'])([\s\S]*?)\2/g)];
    assert.ok(conditions.length > 0, name + ' must have conditional states');
    for (const match of conditions) {
      if (!/^\{\{[\s\S]+\}\}$/.test(match[3].trim())) invalid.push(name + ': wx:' + match[1] + '=' + match[2] + match[3] + match[2]);
    }
  }
  assert.deepEqual(invalid, [], 'literal conditions render as truthy strings: ' + invalid.join('; '));
});

test('confirmed create cannot become another create after hiding and returning to the same page', async () => {
  let sent;
  const h = await loaded('store-kb-edit', async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-list' ? listing(p) : a === 'kb-write' ? (sent = p, receipt(p)) : readback(sent), undefined, { type: 'sop' });
  h.page.onTitle(ev('新建流程')); await h.page.save(); assert.equal(h.page.data.saved, true);
  h.page.onHide(); await h.page.onShow(); await h.page.save();
  assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 1); assert.equal(h.page.data.saved, true); assert.equal(h.page.data.canSave, false);
});

test('unchanged source tags containing commas are preserved; explicit input alone reparses comma-separated tags', async () => {
  let sent;
  const h = await loaded('store-kb-edit', async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-write' ? (sent = p, receipt(p)) : sent ? readback(sent) : detail({ entry: entry({ tags: ['a,b', 'okr-highlight'] }) }));
  h.page.onTitle(ev('只改标题')); await h.page.save(); assert.deepEqual(sent.tags, ['a,b', 'okr-highlight']);
});

test('list resets search and private results at identity boundaries and does not navigate using stale caps', async () => {
  const h = await loaded('store-kb'); h.page.onQuery(ev('上位员工搜索')); h.change('user'); h.page.create(); h.page.open(event({ id: ID }));
  assert.equal(h.urls.length, 0); await h.page.onShow(); assert.equal(h.calls.at(-1).params.q, ''); assert.equal(h.page.data.query, '');
});

test('search uses the normalized server query without altering literal wildcard characters', async () => {
  const h = await loaded('store-kb', async (a, p) => a === 'kb-capabilities' ? caps() : listing(p, { query: (p.q || '').trim() }));
  h.page.onQuery(ev('  _%,原词  ')); await h.page.search(); assert.equal(h.calls.at(-1).params.q, '_%,原词'); assert.equal(h.page.data.error, '');
});

test('actual main readonly preview lists dynamically provide editable own and shared readonly details', async () => {
  const createPreview = require('../miniprogram/shared/preview').createPreview;
  assert.equal(typeof createPreview, 'function');
  const preview = createPreview();
  const h = harness('store-kb', (a, p) => preview.api.action(a, p), { current: preview.session.get(), preview: true }); await h.start();
  assert.ok(h.page.data.items.length >= 2); const own = h.page.data.items.find(x => x.shop_id !== null), shared = h.page.data.items.find(x => x.shop_id === null);
  assert.ok(own); assert.ok(shared);
  for (const row of [own, shared]) { const edit = await loaded('store-kb-edit', (a, p) => preview.api.action(a, p), { current: preview.session.get(), preview: true }, { type: 'sop', id: row.id }); assert.equal(edit.page.data.editable, row.shop_id !== null); assert.equal(edit.page.data.canSave, false); assert.ok(edit.page.data.tagsText.includes('okr-highlight') || row.id !== own.id); }
});

test('transaction abort recognition accepts only the seven exact verified status/code pairs', () => {
  const m = model();
  for (const [http, code] of ABORT_PAIRS) {
    assert.equal(m.transactionAborted(error(http, code)), true, http + ' ' + code);
    for (const wrong of [401, 403, 500, String(http)]) assert.equal(m.transactionAborted(error(wrong, code)), false, String(wrong) + ' ' + code);
    assert.equal(m.transactionAborted(error(http, code + '_extra')), false);
  }
  for (const e of [null, {}, Error('transport'), error(409, 'request_id_conflict'), error(500, 'db_error'), error(422, 'invalid_params'), error(400, 'title_too_long'), error(409, 'not_found'), error(404, 'version_conflict')]) assert.equal(m.transactionAborted(e), false);
});

test('first definite create/update/delete abort releases only its RAM slot, keeps draft and requires fresh authority before a new intent', async () => {
  for (const operation of ['create', 'update', 'delete']) for (const [http, code] of ABORT_PAIRS) {
    let writes = 0, sent;
    const h = await loaded('store-kb-edit', async (a, p) => {
      if (a === 'kb-capabilities') return caps(); if (a === 'kb-list') return listing(p);
      if (a === 'kb-write') { sent = p; if (++writes === 1) throw error(http, code); return receipt(p); }
      if (writes > 1) { if (operation === 'delete') throw error(404, 'not_found'); return readback(sent); }
      return detail();
    }, undefined, { type: 'sop', ...(operation === 'create' ? {} : { id: ID }) });
    h.app._storeKbPending = Object.create(null); const unrelated = { marker: 'other-resource' }; h.app._storeKbPending.unrelated = unrelated;
    h.page.onTitle(ev(' 未保存标题 ')); h.page.onBody(ev('原文\n保留')); h.page.onTags(ev('okr-highlight,保稿'));
    await (operation === 'delete' ? h.page.remove() : h.page.save());
    const first = h.calls.find(x => x.action === 'kb-write').params;
    assert.equal(h.page.data.pending, false, operation + ' ' + code); assert.equal(h.page.data.saved, false); assert.equal(h.page.data.receiptConfirmed, false);
    assert.equal(h.page.data.title, ' 未保存标题 '); assert.equal(h.page.data.body, '原文\n保留'); assert.equal(h.page.data.tagsText, 'okr-highlight,保稿');
    assert.deepEqual(Object.keys(h.app._storeKbPending), ['unrelated']); assert.equal(h.app._storeKbPending.unrelated, unrelated);
    assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.canDelete, false);
    await h.page.save(); await h.page.remove(); assert.equal(writes, 1);
    await h.page.refresh(); assert.equal(writes, 1); assert.equal(h.page.data.title, ' 未保存标题 ');
    if (code === 'version_conflict') { assert.equal(h.page.data.conflict, true); await h.page.reloadLatest(); if (operation === 'create') h.page.onTitle(ev('重新确认的新建标题')); }
    await (operation === 'delete' ? h.page.remove() : h.page.save());
    assert.equal(writes, 2); assert.notEqual(sent.request_id, first.request_id); assert.equal(h.page.data.saved, true);
    assert.deepEqual(Object.keys(h.app._storeKbPending), ['unrelated']);
  }
});

test('server version_conflict remains an internal lock across rendering, refresh and hide until explicit successful latest adoption', async () => {
  let failRead = false;
  const h = await loaded('store-kb-edit', async a => a === 'kb-capabilities' ? caps() : a === 'kb-write' ? Promise.reject(error(409, 'version_conflict')) : failRead ? Promise.reject(Error('读取失败')) : detail(), { manualModal: true });
  h.page.onTitle(ev('冲突保稿')); const saving = h.page.save(); h.modals.at(-1).success({ confirm: true }); await saving;
  assert.equal(h.page.data.conflict, true); h.page.render(); assert.equal(h.page.data.conflict, true); await h.page.refresh(); h.page.onBody(ev('冲突仍可整理草稿')); assert.equal(h.page.data.conflict, true); assert.equal(h.page.data.canSave, false);
  h.page.onHide(); await h.page.onShow(); assert.equal(h.page.data.conflict, true); assert.equal(h.page.data.title, '冲突保稿');
  const cancel = h.page.reloadLatest(); h.modals.at(-1).success({ confirm: false }); await cancel; assert.equal(h.page.data.title, '冲突保稿'); assert.equal(h.page.data.conflict, true);
  failRead = true; const failedAdopt = h.page.reloadLatest(); h.modals.at(-1).success({ confirm: true }); await failedAdopt; assert.equal(h.page.data.title, '冲突保稿'); assert.equal(h.page.data.conflict, true); assert.equal(h.page.data.canSave, false);
  failRead = false; await h.page.refresh(); const adopt = h.page.reloadLatest(); h.modals.at(-1).success({ confirm: true }); await adopt;
  assert.equal(h.page.data.title, '开店流程'); assert.equal(h.page.data.conflict, false); assert.equal(h.page.data.canSave, true); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 1);
});

test('a fresh conflict can explicitly load latest directly, with new capability/detail reads and no second write', async () => {
  const h = await loaded('store-kb-edit', async a => a === 'kb-capabilities' ? caps() : a === 'kb-write' ? Promise.reject(error(409, 'version_conflict')) : detail());
  h.page.onTitle(ev('仍须保留到明确确认')); await h.page.save(); const before = h.calls.length;
  await h.page.reloadLatest(); assert.deepEqual(h.calls.slice(before).map(x => x.action), ['kb-capabilities', 'kb-detail']);
  assert.equal(h.page.data.conflict, false); assert.equal(h.page.data.title, '开店流程'); assert.equal(h.page.data.canSave, true); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 1);
});

test('historical unknown same-page and RAM restored retries never release for any otherwise definitive abort pair', async () => {
  for (const restore of [false, true]) for (const [http, code] of ABORT_PAIRS) {
    const first = await unknown(); const payload = first.calls.find(x => x.action === 'kb-write').params;
    const handler = async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-write-status' ? status(p) : a === 'kb-write' ? Promise.reject(error(http, code)) : detail();
    let h = first;
    if (restore) { first.page.onUnload(); h = await loaded('store-kb-edit', handler, { env: first.env }); }
    else h.page.api.action = async (a, p) => { h.calls.push({ action: a, params: structuredClone(p) }); return handler(a, p); };
    await h.page.reconcile(); await h.page.retrySame();
    assert.equal(h.page.data.pending, true); assert.equal(h.page.data.canSave, false); assert.equal(h.page.data.saved, false); assert.equal(Object.keys(h.app._storeKbPending).length, 1);
    const record = Object.values(h.app._storeKbPending)[0]; assert.equal(record.unknown, true); assert.deepEqual(structuredClone(record.payload), payload);
    assert.equal(h.page.data.title, '冻结草稿');
  }
});

test('first-send abort arriving after hide or revision change retains the unknown RAM record', async () => {
  for (const boundary of ['hide', 'unload', 'revision']) for (const [http, code] of ABORT_PAIRS) {
    const gate = deferred(); const h = await loaded('store-kb-edit', async a => a === 'kb-capabilities' ? caps() : a === 'kb-write' ? gate.promise : detail());
    h.page.onTitle(ev('隐藏保稿')); const sending = h.page.save(); await tick();
    if (boundary === 'hide') h.page.onHide(); else if (boundary === 'unload') h.page.onUnload(); else h.change('revision');
    gate.reject(error(http, code)); await sending;
    assert.equal(Object.keys(h.app._storeKbPending).length, 1); assert.equal(Object.values(h.app._storeKbPending)[0].unknown, true); assert.equal(h.page.data.saved, false);
    assert.equal(h.page.data.title, '');
  }
});

test('mismatched status/code, server failure and receipt mismatch stay pending instead of becoming a free new key', async () => {
  for (const failure of [error(500, 'invalid_params'), error(400, 'not_found'), error(404, 'version_conflict'), error(409, 'invalid_category'), error(422, 'invalid_params'), error(409, 'request_id_conflict'), error(500, 'db_error'), Error('timeout'), 'receipt']) {
    const h = await loaded('store-kb-edit', async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-write' ? failure === 'receipt' ? receipt(p, { version: 'bad' }) : Promise.reject(failure) : detail());
    await h.page.save(); assert.equal(h.page.data.pending, true); assert.equal(Object.keys(h.app._storeKbPending).length, 1); assert.equal(Object.values(h.app._storeKbPending)[0].unknown, true); assert.equal(h.page.data.saved, false);
  }
});

test('a verified receipt followed by any abort-like readback error never releases or resends that intent', async () => {
  for (const [http, code] of ABORT_PAIRS) {
    let sent;
    const h = await loaded('store-kb-edit', async (a, p) => a === 'kb-capabilities' ? caps() : a === 'kb-write' ? (sent = p, receipt(p)) : sent ? Promise.reject(error(http, code)) : detail());
    await h.page.save(); assert.equal(h.page.data.pending, true); assert.equal(h.page.data.receiptConfirmed, true); assert.equal(h.page.data.saved, false); assert.ok(h.page.data.readbackError);
    await h.page.retryReadback(); await h.page.save(); await h.page.retrySame(); assert.equal(h.calls.filter(x => x.action === 'kb-write').length, 1);
    assert.equal(Object.keys(h.app._storeKbPending).length, 1); assert.ok(Object.values(h.app._storeKbPending)[0].receipt);
  }
});
