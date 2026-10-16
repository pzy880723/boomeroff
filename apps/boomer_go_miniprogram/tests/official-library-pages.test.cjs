const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../miniprogram');
const h = require('../miniprogram/shared/official-library');
const clone = x => JSON.parse(JSON.stringify(x));
const tap = dataset => ({ currentTarget: { dataset } });
const input = value => ({ detail: { value } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function dto(params, count = 1) {
  const f = h.normalize(params), fields = { category: f.category || 'jp_porcelain', ip_name: f.ip_name, era: f.era, origin: f.origin };
  return { items: Array.from({ length: count }, (_, i) => ({ id: id(i + 1), name: '官方 ' + i, ...fields, summary: '摘要', cover_url: null, selling_points: null, tips: null, view_count: null, favorite_count: null, importance_score: null, updated_at: null })), filters: { q: f.q, category: f.category, ip_name: f.ip_name, era: f.era, origin: f.origin }, requested_sort: f.sort, effective_sort: f.category ? 'latest' : f.sort, window_limit: 60, as_of: '2026-10-16T09:00:00+08:00' };
}
function harness(name, handler = async (action, params) => action === 'official-library' ? dto(params, 60) : { items: [], categories: [], has_more: false }) {
  let spec, revision = 1, user = { userId: id(900), shop: { id: id(901) } };
  const calls = [], navigations = [], wx = { setNavigationBarTitle() {}, stopPullDownRefresh() {}, reLaunch() {} };
  const session = { get: () => user, revision: () => revision, signOut() { user = null; revision++; } };
  const app = { preview: false, session, ensureSession: async () => !!user, api: { async action(action, params) { calls.push({ action, params: clone(params) }); return handler(action, params); } } };
  const file = path.join(root, 'pages', name, 'index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page(value) { spec = value; }, getApp: () => app, wx, require(id) {
    if (id === '../../shared/page') { const module = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module, getApp: () => app, wx }); return module.exports; }
    return require(path.resolve(path.dirname(file), id));
  } }, { filename: file });
  const page = Object.assign({}, spec, { data: clone(spec.data), navigate(url) { navigations.push(url); }, setData(value) { assert.notEqual(this._gone, true, 'no render after shared wrapper unload'); Object.assign(this.data, value); } });
  return { page, calls, navigations, change(kind) { revision++; if (kind === 'user') user = { ...user, userId: id(902) }; if (kind === 'shop') user = { ...user, shop: { id: id(903) } }; }, async start(filters) {
    if (name === 'list') return page.onLoad({ kind: 'official', ...(filters === undefined ? {} : { official_filters: filters }) });
    await page.onLoad({}); return page.onSource(tap({ source: 'official' }));
  } };
}
async function pick(page, field, value) { page[field === 'category' ? 'beginOfficialCategory' : 'beginOfficialIP'](); return page[field === 'category' ? 'onOfficialCategory' : 'onOfficialIP'](input(value)); }

for (const name of ['learn', 'list']) {
  test(name + ' reads one bound window then locally reveals 20/40/60 without page/source/shop requests', async () => {
    const t = harness(name); await t.start(); const first = t.calls.filter(x => x.action === 'official-library');
    assert.equal(first.length, 1); assert.deepEqual(first[0].params, h.normalize()); assert.equal(t.page.data.items.length, 20);
    assert.match(t.page.data.officialWindowNote, /60/); assert.match(t.page.data.officialWindowNote, /全量/);
    const count = t.calls.length; await t.page.loadMore(); assert.equal(t.page.data.items.length, 40); await t.page.loadMore(); assert.equal(t.page.data.items.length, 60); assert.equal(t.page.data.hasMore, false); assert.equal(t.calls.length, count);
  });
  test(name + ' category resets IP, category forces latest while all-category sort uses only allowed values', async () => {
    const t = harness(name); await t.start(); await t.page.onOfficialSort(tap({ sort: 'hot', request: t.page._request })); assert.equal(t.calls.at(-1).params.sort, 'hot');
    await pick(t.page, 'category', 1); assert.equal(t.page.data.officialEffectiveSort, 'latest'); assert.equal(t.page.data.officialIPOptions.length, 7);
    await pick(t.page, 'ip', 1); assert.equal(t.calls.at(-1).params.ip_name, '品牌窑口'); await pick(t.page, 'category', 2); assert.equal(t.calls.at(-1).params.ip_name, null);
    const count = t.calls.length; await t.page.onOfficialSort(tap({ sort: 'important', request: t.page._request })); assert.equal(t.calls.length, count);
    await pick(t.page, 'category', 0); await t.page.onOfficialSort(tap({ sort: 'important', request: t.page._request })); assert.equal(t.calls.at(-1).params.sort, 'important');
    for (const sort of ['wrong', {}, undefined]) await t.page.onOfficialSort(tap({ sort, request: t.page._request })); assert.equal(t.calls.at(-1).params.sort, 'important');
  });
  test(name + ' rejects 81 codepoints before API, accepts 80 emoji without truncating', async () => {
    const t = harness(name); await t.start(); const count = t.calls.length;
    t.page.onSearchInput(input('😀'.repeat(81))); await t.page.onSearch(); assert.equal(t.calls.length, count); assert.ok(t.page.data.error); assert.equal(t.page.data.query, '😀'.repeat(81));
    t.page.onSearchInput(input('😀'.repeat(80))); await t.page.onSearch(); assert.equal(t.calls.at(-1).params.q, '😀'.repeat(80)); assert.equal(t.page.data.error, '');
  });
  test(name + ' malformed bound response never installs rows', async () => {
    const t = harness(name, async (action, params) => action === 'official-library' ? { ...dto(params), requested_sort: 'foreign' } : { items: [] }); await t.start(); assert.equal(t.page.data.items.length, 0); assert.ok(t.page.data.error);
  });
  test(name + ' local more rejects unsent query and stale sort event', async () => {
    const t = harness(name); await t.start(); const old = t.page._request;
    t.page.onSearchInput(input('new')); await t.page.loadMore(); assert.equal(t.page.data.items.length, 20);
    await t.page.onSearch(); const count = t.calls.length; await t.page.onOfficialSort(tap({ sort: 'hot', request: old })); assert.equal(t.calls.length, count);
  });
  for (const lifecycle of ['hide', 'unload', 'revision', 'user', 'shop']) test(name + ' late window after ' + lifecycle + ' cannot install rows or revive picker', async () => {
    const d = deferred(), t = harness(name, async (action, params) => action === 'official-library' ? (params.category ? d.promise : dto(params)) : { items: [] }); await t.start();
    const pending = pick(t.page, 'category', 1); if (lifecycle === 'hide') t.page.onHide(); else if (lifecycle === 'unload') t.page.onUnload(); else t.change(lifecycle);
    d.resolve(dto(h.normalize({ category: 'jp_porcelain' }))); await pending; assert.equal(t.page.data.items.length, 0);
    const count = t.calls.length; await t.page.onOfficialIP(input(1)); assert.equal(t.calls.length, count);
  });
  test(name + ' hidden same-identity picker is invalidated and visible return reads once afresh', async () => {
    const t = harness(name); await t.start(); t.page.beginOfficialCategory(); t.page.onHide(); const count = t.calls.length; await t.page.onShow(); assert.equal(t.calls.length, count + 1);
    await t.page.onOfficialCategory(input(1)); assert.equal(t.calls.length, count + 1);
  });
}
test('list structured detail filters retain unknown literal category/IP labels and removable exact era/origin', async () => {
  const t = harness('list'), f = { category: ' future%20 ', ip_name: ' exact-IP%20 ', era: ' 昭和%20 ', origin: ' 日本 ' }; await t.start(JSON.stringify(f));
  assert.equal(t.page.data.officialCategoryLabel, f.category); assert.equal(t.page.data.officialIPLabel, f.ip_name);
  assert.equal(t.page.data.officialCategoryOptions.length, 18); assert.equal(t.page.data.officialIPOptions.length, 1);
  assert.equal(t.calls.at(-1).params.era, f.era); const request = t.page._request; await t.page.onOfficialClear(tap({ field: 'era', request })); assert.equal(t.calls.at(-1).params.era, null); assert.equal(t.calls.at(-1).params.origin, f.origin);
});
test('list malformed supplied filters have zero API calls and stay errors on retry', async () => {
  for (const value of ['%', '{bad', 'null', '[]', '{"page":1}']) { const t = harness('list'); await t.start(value); await t.page.retry(); assert.equal(t.calls.length, 0); assert.ok(t.page.data.error); }
});
test('list initial onLoad/onShow starts only one official read', async () => {
  const d = deferred(), t = harness('list', async () => d.promise); const pending = t.start(); t.page.onShow(); assert.equal(t.calls.length, 1); d.resolve(dto(h.normalize())); await pending;
});
test('late failure while hidden never displays an old error or signs out a new actor', async () => {
  const d = deferred(), t = harness('list', async () => d.promise), pending = t.start(); t.page.onHide(); t.change('user'); d.reject(Object.assign(Error('secret stale error'), { status: 401 })); await pending; assert.equal(t.page.data.error, '');
});
test('native controls have dynamic conditions, original metadata chips and untruncated official query input', () => {
  for (const name of ['learn', 'list']) { const xml = fs.readFileSync(path.join(root, 'pages', name, 'index.wxml'), 'utf8'); assert.match(xml, /beginOfficialIP/); assert.match(xml, /onOfficialSort/); assert.match(xml, /onOfficialClear/); assert.match(xml, /officialWindowNote/); assert.match(xml, /maxlength="\{\{isOfficial \? -1/); for (const m of xml.matchAll(/wx:(?:if|elif)="([^"]+)"/g)) assert.match(m[1], /^\{\{[\s\S]*\}\}$/); }
});

test('learn onShow during changed-identity initial official read starts a current request, not an old-window install', async () => {
  const d = deferred(); let reads = 0;
  const t = harness('learn', async (action, params) => action === 'official-library' ? (++reads === 1 ? d.promise : dto(params)) : { items: [] });
  t.page.data.source = 'official'; const pending = t.page.onLoad({}); t.change('user'); await t.page.onShow();
  assert.equal(reads, 2); d.resolve(dto(h.normalize())); await pending; assert.equal(t.page.data.items.length, 1); assert.equal(t.page.data.error, '');
});
test('old filter response cannot replace a newer accepted window', async () => {
  const d = deferred(); const t = harness('list', async (action, params) => params.q === 'old' ? d.promise : dto(params)); await t.start();
  t.page.onSearchInput(input('old')); const pending = t.page.onSearch(); t.page.onSearchInput(input('new')); await t.page.onSearch();
  d.resolve({ ...dto(h.normalize({ q: 'old' })), items: dto(h.normalize({ q: 'old' })).items.map(x => ({ ...x, name: '旧结果' })) }); await pending;
  assert.equal(t.page._officialAccepted.filters.q, 'new'); assert.notEqual(t.page.data.items[0].title, '旧结果');
});
test('owned page group projection survives a failed continuation without inventing counts or dropping search/mastery', async () => {
  let fail = true; const t = harness('list', async (action, params) => { if (params.page === 1 && fail) throw Error('page unavailable'); return { items: [{ id: 'favorite-' + params.page, user_id: id(900), source_type: 'official', quiz_kind: 'favorite', passed: params.page === 1, passed_at: null, snapshot: { name: '器物', category: 'porcelain' }, source_metadata: { name: null, category: 'jp_porcelain', cover_url: null } }], page: params.page, has_more: params.page === 0 }; });
  await t.page.onLoad({ kind: 'my-library' }); assert.equal(t.page.data.learningGroups[0].count, 1); await t.page.loadMore(); assert.ok(t.page.data.error); assert.equal(t.page.data.learningGroups[0].count, 1);
  fail = false; await t.page.loadMore(); assert.equal(t.page.data.learningGroups[0].count, 2); t.page.onSearchInput(input('器物')); await t.page.onSearch(); t.page.onMastery(tap({ mastery: 'mastered' })); assert.equal(t.page.data.learningGroups[0].count, 1); assert.match(t.page.data.loadedSummary, /已加载 2/);
});
for (const lifecycle of ['hide', 'unload', 'revision']) test('official list late card tap after ' + lifecycle + ' cannot navigate old knowledge', async () => {
  const t = harness('list'); await t.start(); const selected = t.page.data.items[0].id;
  if (lifecycle === 'hide') t.page.onHide(); else if (lifecycle === 'unload') t.page.onUnload(); else t.change('revision');
  t.page.openItem(tap({ id: selected })); assert.deepEqual(t.navigations, []);
});
