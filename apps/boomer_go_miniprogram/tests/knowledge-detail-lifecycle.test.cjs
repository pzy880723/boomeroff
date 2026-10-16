const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../miniprogram');
const ID = '00000000-0000-4000-8000-000000000811';
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function detail() { return { item: { id: ID, kind: 'official', title: '合成学习详情', body: '不是员工或业务记录', quiz_kind: 'official', quiz_available: true, raw: {} } }; }
function harness(action = async () => detail()) {
  let spec;
  const renders = [], calls = [];
  const app = { preview: false, session: { get: () => ({ userId: ID, shop: { id: ID }, scopeVersion: 1 }), revision: () => 1 },
    api: { async action(name, params) { calls.push({ name, params }); return action(name, params); } }, ensureSession: async () => true };
  const wx = { setNavigationBarTitle() {}, stopPullDownRefresh() {} };
  const shell = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module: shell, getApp: () => app, wx });
  const filename = path.join(root, 'pages/detail/index.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { spec = value; }, getApp: () => app, wx,
    require(id) { return id === '../../shared/page' ? shell.exports : require(path.resolve(path.dirname(filename), id)); }
  }, { filename });
  const page = Object.assign({}, spec, { data: structuredClone(spec.data), setData(value) {
    assert.notEqual(this._gone, true, 'the real shared wrapper marks gone before onUnload; no later render is valid');
    renders.push(value); Object.assign(this.data, value);
  } });
  return { page, renders, calls };
}

test('official detail unload clears quiz entry without rendering after the real shared wrapper marks gone', async () => {
  const h = harness(); await h.page.onLoad({ kind: 'official', id: ID });
  assert.match(h.page.data.quizUrl, /kind=official/);
  h.page.onUnload();
  assert.equal(h.page._gone, true); assert.equal(h.page._hidden, true); assert.equal(h.page.data.quizUrl, '');
});

test('a late official detail response after unload cannot render or restore its quiz entry', async () => {
  const gate = deferred(), h = harness(() => gate.promise);
  const read = h.page.onLoad({ kind: 'official', id: ID }); h.page.onUnload();
  const count = h.renders.length; gate.resolve(detail()); await read;
  assert.equal(h.renders.length, count); assert.equal(h.page.data.quizUrl, ''); assert.equal(h.page.data.item, null); assert.equal(h.calls.length, 1);
});

test('hiding a readable official detail removes its quiz entry before a fresh onShow read', async () => {
  const h = harness(); await h.page.onLoad({ kind: 'official', id: ID });
  h.page.onHide(); assert.equal(h.page.data.quizUrl, ''); assert.equal(h.page._hidden, true);
  await h.page.onShow(); assert.equal(h.calls.length, 2); assert.match(h.page.data.quizUrl, /kind=official/);
});
