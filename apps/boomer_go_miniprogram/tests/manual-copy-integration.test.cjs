const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { assetView } = require('../miniprogram/pages/marketing/model');
const root = path.resolve(__dirname, '../miniprogram');
const ID = '00000000-0000-4000-8000-000000000861';
function harness(name, row) {
  let spec, revision = 1, reads = 0;
  const navigation = [], user = { userId: 'employee', shop: { id: 'shop', name: '门店' } };
  const session = { get: () => user, revision: () => revision };
  const api = { action: async () => { reads++; return { item: row }; }, invoke: async () => ({ task_kind: 'none' }) };
  const wx = { navigateTo: x => navigation.push(x.url), stopPullDownRefresh() {} };
  const app = { session, api, preview: false, ensureSession: async () => true }, shell = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module: shell, getApp: () => app, wx });
  const filename = path.join(root, 'pages', name, 'index.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { Page: x => { spec = x; }, getApp: () => app, wx, setTimeout: () => 1, clearTimeout() {},
    require: id => id === '../../shared/page' ? shell.exports : require(path.resolve(path.dirname(filename), id)) });
  const page = { ...spec, data: structuredClone(spec.data), setData(patch) { Object.assign(this.data, patch); } };
  return { page, navigation, api, reads: () => reads, row(value) { row = value; }, revise() { revision++; } };
}
function manual() { return { id: ID, user_id: 'employee', shop_id: 'shop', kind: 'copy', output_text: '原始正文', meta: { source: 'manual_upload', asset_class: 'upload', candidates: [{ title: '原始标题', body: '旧快照正文' }] } }; }

test('manual copy editor has native library entry and keeps the approved five tabs', () => {
  const config = require('../miniprogram/app.json');
  assert.ok(config.pages.includes('pages/manual-copy/index'));
  assert.equal(config.tabBar.list.length, 5);
  assert.match(fs.readFileSync(path.join(root, 'pages/marketing/index.wxml'), 'utf8'), /bindtap="newManualCopy"/);
});

test('manual plain copy uses its original title but the latest stored body, not a stale metadata body', () => {
  const row = manual(), view = assetView(row);
  assert.equal(view.title, '原始标题'); assert.equal(view.copyTitle, '原始标题'); assert.equal(view.copyBody, '原始正文');
  row.meta.source = 'generated'; assert.equal(assetView(row).copyTitle, '');
});

test('only visible loaded owned manual copy can open editing; generated/other-store rows cannot', async () => {
  for (const mode of ['own', 'other-owner', 'other-shop', 'generated', 'video']) {
    const row = manual();
    if (mode === 'other-owner') row.user_id = 'other';
    if (mode === 'other-shop') row.shop_id = 'other';
    if (mode === 'generated') row.meta.source = 'generated';
    if (mode === 'video') row.kind = 'video';
    const h = harness('asset', row); await h.page.onLoad({ id: ID }); h.page.openManualCopy();
    assert.equal(h.navigation.length, mode === 'own' ? 1 : 0, mode);
    if (mode === 'own') assert.equal(h.navigation[0], '/pages/manual-copy/index?id=' + ID);
  }
});

test('manual-copy entry cannot use hidden or old-session material and foreground reads again', async () => {
  const h = harness('asset', manual()); await h.page.onLoad({ id: ID });
  h.page.onHide(); h.page.openManualCopy(); assert.equal(h.navigation.length, 0);
  await h.page.onShow(); h.page.openManualCopy(); assert.equal(h.navigation.length, 1);
  h.revise(); h.page.openManualCopy(); assert.equal(h.navigation.length, 1);
});

test('new manual copy entry is stopped when marketing page is hidden or its scope changes', async () => {
  const h = harness('marketing'); h.page.onLoad({ tab: 'library' }); h.page.newManualCopy();
  assert.equal(h.navigation[0], '/pages/manual-copy/index');
  h.page.onHide(); h.page.newManualCopy(); assert.equal(h.navigation.length, 1);
  h.page._visible = true; h.revise(); h.page.newManualCopy(); assert.equal(h.navigation.length, 1);
});

test('asset initial onLoad/onShow shares a read and a hidden late copy cannot install an edit context',async()=>{
 const h=harness('asset',manual());let resolve;h.api.action=()=>{return new Promise(done=>{resolve=done;});};
 const first=h.page.onLoad({id:ID}),second=h.page.onShow();assert.equal(first,second);
 h.page.onHide();resolve({item:manual()});await first;assert.equal(h.page.data.asset,null);h.page.openManualCopy();assert.equal(h.navigation.length,0);
});

test('returning after manual copy deletion clears the former copy, edit context and clipboard draft',async()=>{
 const h=harness('asset',manual());await h.page.onLoad({id:ID});assert.equal(h.reads(),1);
 h.page.onHide();h.row(null);await h.page.onShow();
 assert.equal(h.page.data.asset,null);assert.equal(h.page.data.publishTitle,'');assert.equal(h.page.data.publishBody,'');
 h.page.openManualCopy();assert.equal(h.navigation.length,0);assert.match(h.page.data.error,/撤回|访问/);
});

test('copy detail uses a copy-specific saved status and hides non-copy media panels',()=>{
 assert.equal(assetView(manual()).statusLabel,'文案已保存');
 const markup=fs.readFileSync(path.join(root,'pages/asset/index.wxml'),'utf8');
 assert.match(markup,/wx:if="\{\{asset.kind !== 'copy'\}\}" class="card media-card"/);
 assert.match(markup,/wx:if="\{\{asset.kind !== 'copy'\}\}" class="card"><view class="section-title">视频封面/);
});

test('manual editor reuses actual global field, title and primary-button styles',()=>{
 const markup=fs.readFileSync(path.join(root,'pages/manual-copy/index.wxml'),'utf8');
 assert.match(markup,/class="title"/);assert.match(markup,/class="field title-input"/);assert.match(markup,/class="field body-input"/);assert.match(markup,/class="button save-button"/);
});

function realApiAssetHarness() {
  const { createApi } = require('../miniprogram/shared/api');
  const { createTransport } = require('../miniprogram/shared/transport');
  let spec, revision = 1, signouts = 0;
  let user = { userId: '00000000-0000-4000-8000-000000000902', shop: { id: '00000000-0000-4000-8000-000000000901' }, scopeVersion: 1 };
  const navigation = [], requests = [];
  const session = { get: () => user, revision: () => revision, token: () => 'synthetic-user-token', async ensureFresh() {},
    signOut() { signouts++; user = null; revision++; } };
  const wx = { request: request => requests.push(request), reLaunch: x => navigation.push(x.url) };
  const config = { supabaseUrl: 'https://example.invalid', publicKey: 'synthetic-public-key' };
  const api = createApi({ wx, config, session, invoke: createTransport(wx, config, session.token) });
  const app = { api, session, preview: false, ensureSession: async () => true }, shell = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module: shell, getApp: () => app, wx });
  const filename = path.join(root, 'pages/asset/index.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { Page: x => { spec = x; }, getApp: () => app, wx,
    require: id => id === '../../shared/page' ? shell.exports : require(path.resolve(path.dirname(filename), id)) });
  const page = { ...spec, data: structuredClone(spec.data), setData(patch) { assert.equal(this._gone, false); Object.assign(this.data, patch); } };
  return { page, requests, navigation, signouts: () => signouts, revise() { revision++; },
    row: () => ({ ...manual(), user_id: user.userId, shop_id: user.shop.id }), tick: () => new Promise(setImmediate) };
}

for (const state of ['visible', 'hidden', 'revised', 'unloaded', 'superseded']) test('real API/shared shell asset 401 belongs only to the current visible read: ' + state, async () => {
  const h = realApiAssetHarness(), first = h.page.onLoad({ id: ID });
  await h.tick(); assert.equal(h.requests.length, 1);
  let second;
  if (state === 'hidden' || state === 'superseded') h.page.onHide();
  if (state === 'revised') h.revise();
  if (state === 'unloaded') h.page.onUnload();
  if (state === 'superseded') { second = h.page.onShow(); await h.tick(); assert.equal(h.requests.length, 2); }
  h.requests[0].success({ statusCode: 401, data: { code: 'unauthorized' } });
  await first;
  assert.equal(h.signouts(), state === 'visible' ? 1 : 0);
  assert.deepEqual(h.navigation, state === 'visible' ? ['/pages/login/index'] : []);
  if (second) {
    h.requests[1].success({ statusCode: 200, data: { item: h.row() } }); await second;
    assert.equal(h.page.data.loaded, true); assert.equal(h.page.data.asset.id, ID); assert.equal(h.page.data.error, '');
  }
});
