const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../miniprogram');
const expected = [
  ['jp_porcelain', '日瓷'], ['eu_porcelain', '欧瓷'], ['incense', '线香'], ['antique_art', '古美术'],
  ['local_craft', '本地特色'], ['anime_toy', '动漫玩具'], ['otaku_goods', '二次元周边'], ['luxury', '奢侈品'],
  ['vintage_jewelry', '中古首饰'], ['game_console', '游戏机'], ['walkman', '随身听'], ['ccd', 'CCD'],
  ['media_record', '音像制品'], ['playback_device', '播放设备'], ['home_appliance', '家用电器'], ['hobby', '兴趣爱好'], ['other', '其他']
];
const clone = value => JSON.parse(JSON.stringify(value));
const tap = dataset => ({ currentTarget: { dataset } });
const pick = value => ({ detail: { value } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const row = (id = 'one', category = 'jp_porcelain') => ({ id, name: '官方器物 ' + id, category, quiz_kind: 'official' });
const dto = (items = [row()], page = 0, has_more = false) => ({ items, page, page_size: 20, has_more, as_of: '2026-10-16T09:00:00+08:00' });
function officialDto(data, params) {
  const f = require('../miniprogram/shared/official-library').normalize(params);
  return { items: data.items.map((r, i) => ({ id: '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'), name: r.name, category: f.category || r.category || null, ip_name: f.ip_name, summary: null, era: f.era, origin: f.origin, cover_url: null, tips: null, view_count: null, favorite_count: null, importance_score: null, updated_at: null })), filters: { q: f.q, category: f.category, ip_name: f.ip_name, era: f.era, origin: f.origin }, requested_sort: f.sort, effective_sort: f.category ? 'latest' : f.sort, window_limit: 60, as_of: data.as_of };
}
function categories() {
  const file = path.join(root, 'shared/knowledge-categories.js');
  assert.ok(fs.existsSync(file), 'immutable official category metadata exists'); return require(file);
}
function harness(name, handler = async () => dto()) {
  let spec, revision = 1, user = { userId: 'employee-a', shop: { id: 'shop-a' }, scopeVersion: 1 };
  const calls = [], wx = { setNavigationBarTitle() {}, stopPullDownRefresh() {}, reLaunch() {} };
  const session = { get: () => user, revision: () => revision, signOut() { user = null; revision++; } };
  const app = { preview: false, session, ensureSession: async () => !!user, api: { async action(action, params) { calls.push({ action, params: clone(params) }); const data = await handler(action, params); return action === 'official-library' ? officialDto(data, params) : data; } } };
  const file = path.join(root, 'pages', name, 'index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { spec = value; }, getApp: () => app, wx,
    require(id) {
      if (id === '../../shared/page') { const module = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module, getApp: () => app, wx }); return module.exports; }
      return require(path.resolve(path.dirname(file), id));
    }
  }, { filename: file });
  const page = Object.assign({}, spec, { data: clone(spec.data), setData(value) { assert.notEqual(this._gone, true, 'unloaded native pages must not render'); Object.assign(this.data, value); } });
  return { page, calls, name, async start(options) { await page.onLoad(options || (name === 'list' ? { kind: 'official' } : {})); if (name === 'learn') await page.onSource(tap({ source: 'official' })); }, change(kind = 'revision') { revision++; if (kind === 'user') user = { ...user, userId: 'employee-b' }; if (kind === 'shop') user = { ...user, shop: { id: 'shop-b' } }; } };
}
async function loaded(name, handler) { const h = harness(name, handler); await h.start(); return h; }
async function choose(page, value) { page.beginOfficialCategory(); return page.onOfficialCategory(pick(value)); }

test('official category metadata has exact 17 choices, a separate all choice, immutable records and safe legacy labels', () => {
  const m = categories();
  assert.deepEqual(m.OPTIONS.map(x => [x.code, x.label]), [['', '全部分类'], ...expected]);
  assert.ok(Object.isFrozen(m.OPTIONS)); m.OPTIONS.forEach(x => assert.ok(Object.isFrozen(x)));
  for (const [code, label] of [['porcelain', '瓷器'], ['stationery', '文房四宝'], ['lacquerware', '漆器'], ['bronze', '铜器'], ['woodcraft', '木器'], ['textile', '织物/布艺'], ['jewelry', '首饰/饰品'], ['painting', '书画']]) assert.equal(m.label(code), label);
  for (const value of ['future_category', '__proto__', 'constructor']) assert.equal(m.label(value), value);
  for (const value of [null, undefined, {}, [], 2]) assert.equal(m.label(value), '');
});

test('category label projection never replaces raw codes or projects dirty values as labels', () => {
  const model = require('../miniprogram/pages/list/model');
  const projected = model.items({ items: [row(), row('legacy', 'porcelain'), row('unknown', 'future_category'), row('unsafe', {}), { id: 'snapshot', snapshot: { category: 'vintage_jewelry' } }] });
  assert.deepEqual(projected.map(x => x.category), ['jp_porcelain', 'porcelain', 'future_category', '', 'vintage_jewelry']);
  assert.deepEqual(projected.map(x => x.categoryLabel), ['日瓷', '瓷器', '', '', '中古首饰']);
  assert.deepEqual(projected.map(x => x.categoryLabel || x.category), ['日瓷', '瓷器', 'future_category', '', '中古首饰']);
});

test('label-only projection does not duplicate unrelated notification enums before their existing Chinese mapping', () => {
  const model = require('../miniprogram/pages/list/model');
  for (const code of ['notice', 'schedule', 'learning']) {
    const item = model.items({ items: [{ id: code, title: '通知', category: code }] })[0];
    assert.equal(item.category, code); assert.equal(item.categoryLabel, '');
  }
});

for (const name of ['learn', 'list']) {
  test(name + ' official entry shows all supported picker options without BFF categories', async () => {
    const h = await loaded(name);
    assert.equal(h.page.data.isOfficial, true); assert.equal(h.page.data.officialCategoryOptions.length, 18);
    assert.deepEqual(clone(h.page.data.officialCategoryOptions).map(x => [x.code, x.label]), [['', '全部分类'], ...expected]);
    assert.equal(h.page.data.officialCategoryIndex, 0); assert.equal(h.page.data.officialCategoryLabel, '全部分类');
    assert.equal(h.page.data.items[0].category, 'jp_porcelain'); assert.equal(h.page.data.items[0].categoryLabel, '日瓷');
  });

  test(name + ' every current category and all use only frozen official window parameters', async () => {
    const h = await loaded(name); h.page.onSearchInput(pick('  器物  '));
    for (let index = 1; index <= expected.length; index++) {
      await choose(h.page, String(index)); const call = h.calls.at(-1);
      assert.equal(call.action, 'official-library'); assert.equal(call.params.category, expected[index - 1][0]); assert.equal(call.params.q, '器物'); assert.equal(call.params.sort, 'latest');
      assert.equal(h.page.data.officialCategoryIndex, index); assert.equal(h.page.data.officialCategoryLabel, expected[index - 1][1]);
      assert.deepEqual(Object.keys(call.params).sort(), ['category', 'era', 'ip_name', 'origin', 'q', 'sort']);
    }
    await choose(h.page, 0); assert.equal(h.calls.at(-1).params.category, null); assert.equal(h.page.data.category, '');
  });

  test(name + ' malformed/out-of-range picker values and direct category chip callbacks cannot send a guessed filter', async () => {
    const h = await loaded(name); await choose(h.page, 2); const before = h.calls.length;
    for (const value of [-1, 18, 1.2, NaN, Infinity, '01', '1.0', '1e0', 'future_category', '日瓷', null, undefined, {}, []]) await choose(h.page, value);
    await h.page.onCategory(tap({ id: 'future_category' }));
    assert.equal(h.calls.length, before); assert.equal(h.page.data.category, 'eu_porcelain'); assert.equal(h.page.data.officialCategoryIndex, 2);
  });

  test(name + ' category picker is blocked during first read and an active filtered read', async () => {
    let delay = false; const d = deferred();
    const h = harness(name, async (action) => delay && action === 'official-library' ? d.promise : dto());
    if (name === 'learn') await h.page.onLoad({}); delay = true;
    const loading = name === 'learn' ? h.page.onSource(tap({ source: 'official' })) : h.page.onLoad({ kind: 'official' });
    const before = h.calls.length; await choose(h.page, 1); assert.equal(h.calls.length, before); assert.equal(h.page.data.category, '');
    d.resolve(dto()); await loading;
    const next = deferred(); h.page.api.action = async (action, params) => { h.calls.push({ action, params: clone(params) }); return officialDto(await next.promise, params); };
    const filtering = choose(h.page, 1); await choose(h.page, 2); assert.equal(h.page.data.category, 'jp_porcelain');
    next.resolve(dto()); await filtering;
  });

  test(name + ' pagination and retry retain selected filter and full options when every response omits categories', async () => {
    let fail = false;
    const h = await loaded(name, async () => { if (fail) throw Error('read failed'); return dto(Array.from({ length: 41 }, (_, i) => row(String(i)))); });
    await choose(h.page, 6); await h.page.loadMore();
    assert.equal(h.calls.at(-1).params.category, 'anime_toy'); assert.equal(h.calls.at(-1).action, 'official-library'); assert.equal(h.calls.at(-1).params.page, undefined); assert.equal(h.page.data.items.length, 40);
    const reads = h.calls.length; await h.page.loadMore(); assert.equal(h.page.data.items.length, 41); assert.equal(h.calls.length, reads);
    assert.equal(h.page.data.officialCategoryOptions.length, 18); assert.equal(h.page.data.officialCategoryIndex, 6);
    fail = true; await h.page.retry(); assert.ok(h.page.data.error); assert.equal(h.page.data.officialCategoryOptions.length, 18);
    const before = h.calls.length; await choose(h.page, 2); assert.equal(h.calls.length, before);
    fail = false; await h.page.retry(); assert.equal(h.calls.at(-1).params.category, 'anime_toy'); assert.equal(h.page.data.officialCategoryLabel, '动漫玩具');
  });

  test(name + ' local more and a second category event cannot mix an in-flight replacement window', async () => {
    const d = deferred(); const h = await loaded(name, async (action, params) => params.category ? d.promise : dto(Array.from({ length: 41 }, (_, i) => row(String(i)))));
    const read = choose(h.page, 1), before = h.calls.length; await h.page.loadMore(); await choose(h.page, 3); assert.equal(h.calls.length, before); assert.equal(h.page.data.category, 'jp_porcelain'); assert.equal(h.page.data.items.length, 0);
    d.resolve(dto([row('two')])); await read; assert.equal(h.page.data.items.length, 1);
  });

  for (const kind of ['hide', 'unload', 'revision', 'user', 'shop']) test(name + ' picker callback after ' + kind + ' cannot render or request a filter', async () => {
    const h = await loaded(name); h.page.beginOfficialCategory(); const before = h.calls.length;
    if (kind === 'hide') h.page.onHide(); else if (kind === 'unload') h.page.onUnload(); else h.change(kind);
    await h.page.onOfficialCategory(pick(4)); assert.equal(h.calls.length, before); assert.equal(h.page.data.category, '');
  });

  test(name + ' picker from before hide/show is not revived by fresh same-identity data', async () => {
    const h = await loaded(name); h.page.beginOfficialCategory(); h.page.onHide(); await h.page.onShow();
    const before = h.calls.length; await h.page.onOfficialCategory(pick(1)); assert.equal(h.calls.length, before);
    await choose(h.page, 1); assert.equal(h.calls.at(-1).params.category, 'jp_porcelain');
  });

  for (const kind of ['hide', 'unload', 'revision']) test(name + ' late official filtered response after ' + kind + ' cannot paint old rows', async () => {
    const d = deferred(); const h = await loaded(name, async (action, params) => params.category ? d.promise : dto());
    const read = choose(h.page, 1); if (kind === 'hide') h.page.onHide(); else if (kind === 'unload') h.page.onUnload(); else h.change();
    d.resolve(dto([row('late')])); await read; assert.equal(h.page.data.items.length, 0);
  });
}

test('learning source/kind changes remove official controls and invalidate an earlier picker without fake product filtering', async () => {
  const h = await loaded('learn', async () => ({ ...dto(), categories: [{ id: 'server-category', name: '服务器分类' }] }));
  h.page.beginOfficialCategory(); await h.page.onSource(tap({ source: 'product' })); const before = h.calls.length;
  await h.page.onOfficialCategory(pick(1)); await h.page.onCategory(tap({ id: 'jp_porcelain' }));
  assert.equal(h.calls.length, before); assert.equal(h.page.data.isOfficial, false); assert.equal(h.page.data.category, ''); assert.equal(h.calls.at(-1).params.source, 'product');
  await h.page.onSource(tap({ source: 'official' })); h.page.beginOfficialCategory(); await h.page.onFilter(tap({ kind: 'training' }));
  const count = h.calls.length; await h.page.onOfficialCategory(pick(1)); assert.equal(h.calls.length, count); assert.equal(h.page.data.isOfficial, false);
  assert.equal(h.page.data.categories[0].id, 'server-category'); await h.page.onCategory(tap({ id: 'server-category' }));
  assert.equal(h.calls.at(-1).action, 'learning'); assert.equal(h.calls.at(-1).params.category_id, 'server-category'); assert.equal(h.calls.at(-1).params.type, 'sop');
});

test('secondary product knowledge cannot send an unsupported category; training retains dynamic categories', async () => {
  const h = harness('list', async () => ({ ...dto(), categories: [{ id: 'dynamic', name: '动态培训类' }] })); await h.page.onLoad({ kind: 'knowledge' });
  const before = h.calls.length; await h.page.onCategory(tap({ id: 'jp_porcelain' })); assert.equal(h.calls.length, before); assert.equal(h.page.data.isOfficial, false);
  const training = harness('list', async () => ({ ...dto(), categories: [{ id: 'dynamic', name: '动态培训类' }] })); await training.page.onLoad({ kind: 'training' });
  assert.equal(training.page.data.categories[0].name, '动态培训类'); await training.page.onCategory(tap({ id: 'dynamic' }));
  assert.equal(training.calls.at(-1).action, 'learning'); assert.equal(training.calls.at(-1).params.category_id, 'dynamic');
});

test('official list initial onLoad/onShow shares its active read rather than starting a duplicate', async () => {
  const d = deferred(), h = harness('list', async () => d.promise); const load = h.page.onLoad({ kind: 'official' }); const show = h.page.onShow(); await tick();
  assert.equal(h.calls.length, 1); d.resolve(dto()); await load; await show;
});

test('native picker bindings are official-only, disabled while reading, and labels are projected without raw-code replacement', () => {
  for (const name of ['learn', 'list']) {
    const text = fs.readFileSync(path.join(root, 'pages', name, 'index.wxml'), 'utf8');
    assert.match(text, /<picker[^>]*wx:if="\{\{isOfficial\}\}"[^>]*range-key="label"[^>]*bindchange="onOfficialCategory"/);
    assert.match(text, /bindtap="beginOfficialCategory"/); assert.match(text, /officialCategoryLabel/); assert.match(text, /disabled="\{\{loading \|\| loadingMore \|\| error\}\}"/);
    assert.match(text, /!isOfficial && kind !== 'knowledge' && categories.length/); assert.match(text, /item.categoryLabel/);
    for (const match of text.matchAll(/wx:(?:if|elif)="([^"]*)"/g)) assert.match(match[1], /^\{\{[\s\S]*\}\}$/);
    assert.doesNotMatch(text, /ip_name|official-library|&amp;&amp;|<web-view/);
  }
});
