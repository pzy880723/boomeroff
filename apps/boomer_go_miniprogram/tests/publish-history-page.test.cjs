const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../miniprogram');
const uid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const SHOP = uid(901), USER = uid(902), JOB = uid(911), NEXT = uid(912);
const when = '2026-10-16T09:20:00+08:00';
function row(id = JOB) { return { id, title: '合成发布任务', kind: 'video', status: 'running', statusLabel: '发布中', platforms: ['douyin', 'xhs'], createdAt: when, scheduleAt: null }; }
function history(items = [row()]) { return { shopId: SHOP, items, limit: 50 }; }
function status(id = JOB) { return { shopId: SHOP, job: row(id), targets: [{ id: uid(921), status: 'success', statusLabel: '已成功', progress: 100, error: '', platform: 'douyin', name: '合成账号', postUrl: 'https://example.invalid/post' }] }; }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
const event = id => ({ currentTarget: { dataset: { id } } });

function harness(options = {}) {
  const filename = path.join(root, 'pages/publish-history/index.js');
  assert.ok(fs.existsSync(filename), 'new native publish-history page must exist');
  let spec, revision = 1, currentUser = USER, shopId = SHOP, signouts = 0;
  const calls = [], renders = [], navigation = [];
  const session = { get: () => ({ userId: currentUser, shop: shopId ? { id: shopId, name: '合成门店' } : null, scopeVersion: 1 }), revision: () => revision,
    signOut() { signouts++; revision++; currentUser = ''; } };
  const forbidden = () => { throw new Error('read-only page must never invoke mutations or generic services'); };
  const api = { async publishHistory() { calls.push({ kind: 'list' }); return options.list ? options.list() : history(); },
    async publishStatus(id) { calls.push({ kind: 'detail', id }); return options.detail ? options.detail(id) : status(id); },
    action: forbidden, invoke: forbidden, copy: forbidden };
  const app = { preview: options.preview === true, session, api, ensureSession: async () => true };
  const wx = { stopPullDownRefresh() {}, reLaunch: x => navigation.push(x.url), navigateTo: forbidden, switchTab: forbidden };
  const shell = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module: shell, getApp: () => app, wx });
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { Page(value) { spec = value; }, getApp: () => app, wx,
    require(id) { return id === '../../shared/page' ? shell.exports : require(path.resolve(path.dirname(filename), id)); } }, { filename });
  const page = Object.assign({}, spec, { data: structuredClone(spec.data), setData(value) {
    assert.notEqual(this._gone, true, 'no setData after real shared wrapper unload'); renders.push(value); Object.assign(this.data, value);
  } });
  return { page, calls, renders, navigation, signouts: () => signouts,
    change(kind) { if (kind === 'actor') currentUser = uid(999); if (kind === 'shop') shopId = uid(999); revision++; },
    noShop() { shopId = null; }, async load() { await page.onLoad({}); await page.onShow(); } };
}

test('platform names remain strings for inherited object keys and both Xiaohongshu aliases', async () => {
  const names = ['constructor', 'toString', '__proto__', 'xhs', 'xiaohongshu'];
  const h = harness({ list: () => { const r = row(); r.platforms = names; return history([r]); },
    detail: () => { const d = status(); d.targets = names.map((platform, i) => ({ ...d.targets[0], id: uid(930 + i), platform })); return d; } });
  await h.load(); await h.page.selectJob(event(JOB));
  assert.deepEqual(Array.from(h.page.data.items[0].platforms), ['constructor', 'toString', '__proto__', '小红书', '小红书']);
  assert.deepEqual(Array.from(h.page.data.targets, row => row.platform), ['constructor', 'toString', '__proto__', '小红书', '小红书']);
});

test('native quartet has real bindings, recent-50 scope and no publishing/browser controls', () => {
  const dir = path.join(root, 'pages/publish-history');
  for (const ext of ['js', 'json', 'wxml', 'wxss']) assert.ok(fs.existsSync(path.join(dir, 'index.' + ext)), ext + ' native file required');
  const wxml = fs.readFileSync(path.join(dir, 'index.wxml'), 'utf8');
  for (const match of wxml.matchAll(/wx:(?:if|elif)="([^"]*)"/g)) assert.match(match[1], /^{{[\s\S]*}}$/);
  assert.match(wxml, /最近\s*50\s*条/); assert.match(wxml, /只读/); assert.match(wxml, /preview/);
  assert.doesNotMatch(wxml, /web-view|retryTarget|cancelPublish|bindtap="publish"|bindtap="go"/);
});

test('initial load/show is one read even when onLoad is still pending; only safe fields enter data', async () => {
  const gate = deferred(), dto = history(); dto.items[0].raw = { token: 'never-project' };
  const h = harness({ list: () => gate.promise });
  const load = h.page.onLoad({}); const show = h.page.onShow();
  assert.equal(h.calls.length, 1); assert.equal(h.page.data.listLoading, true);
  gate.resolve(dto); await load; await show;
  assert.equal(h.page.data.items.length, 1); assert.equal(h.page.data.listLoading, false);
  assert.doesNotMatch(JSON.stringify(h.page.data), /never-project|2026-10-16T09:20/);
  assert.match(h.page.data.items[0].createdAt, /10-16 09:20/);
  await h.page.onShow(); assert.equal(h.calls.length, 1);
});

test('valid empty list is distinct from failure; retry is a fresh read', async () => {
  let fail = true;
  const h = harness({ list: () => { if (fail) throw new Error('network'); return history([]); } }); await h.load();
  assert.ok(h.page.data.listError); assert.equal(h.page.data.listLoaded, false);
  fail = false; await h.page.refresh(); assert.equal(h.page.data.listLoaded, true); assert.equal(h.page.data.listError, ''); assert.equal(h.page.data.items.length, 0);
});

test('loaded rows alone can open inline exact-ID status; detail and list refresh independently', async () => {
  const h = harness(); await h.load();
  await h.page.selectJob(event(NEXT)); assert.equal(h.calls.length, 1);
  await h.page.selectJob(event(JOB)); assert.equal(h.page.data.job.id, JOB); assert.equal(h.page.data.targets.length, 1);
  assert.deepEqual(h.calls.at(-1), { kind: 'detail', id: JOB });
  await h.page.refreshDetail(); assert.equal(h.calls.filter(x => x.kind === 'list').length, 1);
  await h.page.refresh(); assert.equal(h.calls.filter(x => x.kind === 'detail').length, 2);
  h.page.closeDetail(); assert.equal(h.page.data.selectedId, ''); assert.equal(h.page.data.items.length, 1); assert.equal(h.page.data.job, null);
});

test('failed detail read retains selected ID and list, retry does not reread list', async () => {
  let fail = true; const h = harness({ detail: id => { if (fail) throw new Error('network'); return status(id); } });
  await h.load(); await h.page.selectJob(event(JOB)); assert.ok(h.page.data.detailError); assert.equal(h.page.data.items.length, 1);
  fail = false; await h.page.refreshDetail(); assert.equal(h.page.data.detailError, ''); assert.equal(h.page.data.job.id, JOB);
  assert.equal(h.calls.filter(x => x.kind === 'list').length, 1);
});

test('changing selection supersedes a late detail without mixing targets', async () => {
  const gate = deferred(); const h = harness({ list: () => history([row(), row(NEXT)]), detail: id => id === JOB ? gate.promise : status(id) });
  await h.load(); const old = h.page.selectJob(event(JOB)); await h.page.selectJob(event(NEXT));
  gate.resolve(status(JOB)); await old; assert.equal(h.page.data.job.id, NEXT); assert.equal(h.page.data.selectedId, NEXT);
});

test('close while status is pending discards its result and leaves list usable', async () => {
  const gate = deferred(), h = harness({ detail: () => gate.promise }); await h.load();
  const read = h.page.selectJob(event(JOB)); h.page.closeDetail(); const count = h.renders.length;
  gate.resolve(status()); await read; assert.equal(h.renders.length, count); assert.equal(h.page.data.job, null); assert.equal(h.page.data.items.length, 1);
});

test('unknown statuses stay explicit, no progress value or platform success is invented', async () => {
  const dto = status(); dto.job.status = 'new_phase'; dto.job.statusLabel = '未知状态（new_phase）';
  dto.targets[0].status = 'future'; dto.targets[0].statusLabel = '未知状态（future）'; dto.targets[0].progress = null;
  const h = harness({ detail: () => dto }); await h.load(); await h.page.selectJob(event(JOB));
  assert.match(h.page.data.job.statusLabel, /未知状态/); assert.match(h.page.data.targets[0].statusLabel, /未知状态/);
  assert.equal(h.page.data.targets[0].progress, null); assert.equal(h.navigation.length, 0);
});

test('foreground immediately reloads list and the explicitly selected job, without polling or writes', async () => {
  const h = harness(); await h.load(); await h.page.selectJob(event(JOB)); h.page.onHide();
  assert.equal(h.page.data.items.length, 0); assert.equal(h.page.data.job, null); assert.equal(h.page.data.targets.length, 0);
  await h.page.onShow(); assert.equal(h.calls.filter(x => x.kind === 'list').length, 2); assert.equal(h.calls.filter(x => x.kind === 'detail').length, 2);
  assert.equal(h.page.data.job.id, JOB);
});

for (const phase of ['list', 'detail']) for (const transition of ['hide', 'unload', 'actor', 'shop', 'revision']) {
  test(phase + ' late success/401 cannot paint or sign out after ' + transition, async () => {
    for (const rejection of [false, true]) {
      const gate = deferred(), h = harness(phase === 'list' ? { list: () => gate.promise } : { detail: () => gate.promise });
      let read;
      if (phase === 'list') read = h.page.onLoad({}); else { await h.load(); read = h.page.selectJob(event(JOB)); }
      if (transition === 'hide') h.page.onHide(); else if (transition === 'unload') h.page.onUnload(); else h.change(transition);
      const count = h.renders.length;
      if (rejection) gate.reject(Object.assign(new Error('old unauthorized'), { status: 401 })); else gate.resolve(phase === 'list' ? history() : status());
      await read; assert.equal(h.renders.length, count); assert.equal(h.signouts(), 0); assert.equal(h.navigation.length, 0);
    }
  });
}

test('fresh current 401 clears private UI and reaches the actual shared shell', async () => {
  for (const phase of ['list', 'detail']) {
    let fail = false; const unauthorized = () => { throw Object.assign(new Error('unauthorized'), { status: 401 }); };
    const h = harness({ list: () => fail && phase === 'list' ? unauthorized() : history(), detail: () => phase === 'detail' ? unauthorized() : status() });
    await h.load(); if (phase === 'detail') await h.page.selectJob(event(JOB)); else { fail = true; await h.page.refresh(); }
    assert.equal(h.signouts(), 1); assert.deepEqual(h.navigation, ['/pages/login/index']); assert.equal(h.page.data.items.length, 0); assert.equal(h.page.data.job, null);
  }
});

test('store or revision changes on foreground never restore the previous selected task', async () => {
  const h = harness(); await h.load(); await h.page.selectJob(event(JOB)); h.page.onHide(); h.change('revision'); await h.page.onShow();
  assert.equal(h.calls.filter(x => x.kind === 'detail').length, 1); assert.equal(h.page.data.selectedId, ''); assert.equal(h.page.data.job, null);
});

test('missing verified shop makes no reads and stale loaded-row clicks cannot start a request', async () => {
  const h = harness(); h.noShop(); await h.load(); assert.equal(h.calls.length, 0); assert.ok(h.page.data.listError);
  const valid = harness(); await valid.load(); valid.change('shop'); await valid.page.selectJob(event(JOB)); assert.equal(valid.calls.length, 1);
});

test('a detail refresh event from the previous identity cannot request its selected job under a new scope', async () => {
  for (const change of ['actor', 'shop', 'revision']) {
    const h = harness(); await h.load(); await h.page.selectJob(event(JOB)); h.change(change);
    const count = h.calls.length; await h.page.refreshDetail(); assert.equal(h.calls.length, count, change);
  }
});

test('list refresh failure does not erase an independently confirmed selected detail', async () => {
  let fail = false; const h = harness({ list: () => { if (fail) throw new Error('network'); return history(); } });
  await h.load(); await h.page.selectJob(event(JOB)); fail = true; await h.page.refresh();
  assert.ok(h.page.data.listError); assert.equal(h.page.data.job.id, JOB); assert.equal(h.page.data.items.length, 1);
});

test('preview uses only frozen safe read methods and cannot mutate through any event', async () => {
  const h = harness({ preview: true }); await h.load(); await h.page.selectJob(event(JOB)); await h.page.refreshDetail();
  assert.equal(h.page.data.preview, true); assert.equal(h.calls.length, 3); assert.equal(h.navigation.length, 0);
});

test('wrong shop list and wrong-ID/shop detail cannot be installed', async () => {
  const h = harness({ list: () => ({ ...history(), shopId: NEXT }) }); await h.load(); assert.ok(h.page.data.listError); assert.equal(h.page.data.items.length, 0);
  for (const bad of [{ ...status(), shopId: NEXT }, { ...status(), job: row(NEXT) }]) {
    const p = harness({ detail: () => bad }); await p.load(); await p.page.selectJob(event(JOB)); assert.ok(p.page.data.detailError); assert.equal(p.page.data.job, null);
  }
});
