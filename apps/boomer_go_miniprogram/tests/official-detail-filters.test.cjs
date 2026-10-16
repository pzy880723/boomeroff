const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../miniprogram');
const ID = '00000000-0000-4000-8000-000000000811';
const clone = value => JSON.parse(JSON.stringify(value));
const row = raw => ({ item: { id: ID, kind: 'official', title: '合成官方知识', category: raw.category, body: '仅供本地测试', raw } });
function harness(raw, kind = 'official') {
  let spec, revision = 1;
  const urls = [], session = { get: () => ({ userId: ID, shop: null, scopeVersion: 1 }), revision: () => revision };
  const app = { session, preview: false, ensureSession: async () => true, api: { action: async () => {
    const dto = row(raw); dto.item.kind = kind; return dto;
  } } };
  const wx = { setNavigationBarTitle() {}, navigateTo({ url }) { urls.push(url); } };
  const shell = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module: shell, getApp: () => app, wx });
  const file = path.join(root, 'pages/detail/index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page(value) { spec = value; }, getApp: () => app, wx,
    require(id) { return id === '../../shared/page' ? shell.exports : require(path.resolve(path.dirname(file), id)); }
  }, { filename: file });
  const page = Object.assign({}, spec, { data: clone(spec.data), setData(value) { assert.notEqual(this._gone, true); Object.assign(this.data, value); } });
  return { page, urls, change() { revision++; }, start() { return page.onLoad({ kind, id: ID }); } };
}
const tap = key => ({ currentTarget: { dataset: { key } } });
function filters(url) { return JSON.parse(decodeURIComponent(url.split('official_filters=')[1])); }

test('official detail offers native exact-value category/IP/era/origin refilters, not display-label queries', async () => {
  const raw = { category: 'jp_porcelain', ip_name: '品牌%20窑口', era: ' 昭和 ', origin: '日本/产地待核实' };
  const h = harness(raw); await h.start();
  assert.deepEqual(clone(h.page.data.officialFilters).map(x => x.key), ['category','ip_name','era','origin']);
  assert.equal(h.page.data.officialFilters[0].label, '日瓷');
  const expected = [{ category: raw.category }, { category: raw.category, ip_name: raw.ip_name }, { era: raw.era }, { origin: raw.origin }];
  for (const [index, key] of ['category','ip_name','era','origin'].entries()) {
    await h.page.openOfficialFilter(tap(key));
    assert.match(h.urls[index], /^\/pages\/list\/index\?kind=official&official_filters=/);
    assert.deepEqual(filters(h.urls[index]), expected[index]);
  }
  assert.equal(h.page.data.item.category, '日瓷');
});

for (const state of ['hide','unload','revision','id','loading']) test('official detail rejects refilter events after ' + state, async () => {
  const h = harness({ category: 'jp_porcelain' }); await h.start();
  if (state === 'hide') h.page.onHide(); else if (state === 'unload') h.page.onUnload(); else if (state === 'revision') h.change(); else if (state === 'id') h.page.data.id = 'different'; else h.page.data.loading = true;
  await h.page.openOfficialFilter(tap('category')); assert.deepEqual(h.urls, []);
});

test('official detail rejects forged field callbacks and never invents metadata values', async () => {
  const h = harness({ category: 'future_category', ip_name: {}, era: '', origin: '\ud800' }); await h.start();
  assert.deepEqual(clone(h.page.data.officialFilters).map(x => x.key), ['category']);
  await h.page.openOfficialFilter(tap('missing')); await h.page.openOfficialFilter(tap('__proto__')); assert.deepEqual(h.urls, []);
  await h.page.openOfficialFilter(tap('category')); assert.deepEqual(filters(h.urls[0]), { category: 'future_category' });
});

test('product detail does not acquire official-library metadata navigation', async () => {
  const h = harness({ category: 'jp_porcelain', ip_name: '品牌窑口' }, 'knowledge'); await h.start();
  assert.deepEqual(clone(h.page.data.officialFilters), []);
  await h.page.openOfficialFilter(tap('category')); assert.deepEqual(h.urls, []);
});
