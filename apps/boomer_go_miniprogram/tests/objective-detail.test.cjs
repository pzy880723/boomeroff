const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.resolve(__dirname, '../miniprogram/pages/detail/index.js');
const ID = '00000000-0000-4000-8000-000000000011';
const SHOP = '00000000-0000-4000-8000-000000000021';
const stamp = '2026-10-16T09:00:00+08:00';
const copy = value => JSON.parse(JSON.stringify(value));
const row = (extra = {}) => ({ id: ID, shop_id: SHOP, title: '门店协作', objective: '核对服务', key_results: [{ name: '培训', progress: 37.5, unit: '次', meta: { source: 'existing' } }], key_actions: '原行动', tags: ['协作'], scope: 'shop', period_start: '2026-10-01', period_end: '2026-10-31', updated_at: stamp, ...extra });
const paged = (items, page = 0, has_more = false) => ({ shop_id: SHOP, items: copy(items), page, page_size: 50, has_more });
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function harness(action) {
  let spec, revision = 1, user = { userId: 'employee-a', shop: { id: SHOP } };
  const calls = [], modals = [];
  const wx = { setNavigationBarTitle() {}, stopPullDownRefresh() {}, showModal(options) { modals.push(options); } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { spec = value; }, wx, console, Date,
    require(id) { if (id === '../../shared/page') return { definePage: value => value }; return require(path.resolve(path.dirname(file), id)); },
    getApp: () => ({ preview: false })
  }, { filename: file });
  const page = Object.assign({}, spec, {
    data: copy(spec.data), preview: false,
    session: { get: () => user, revision: () => revision },
    api: { action: async (name, params) => { calls.push({ name, params: copy(params) }); return action(name, params); } },
    setData(value) { Object.assign(this.data, value); },
    async run(task, options = {}) {
      if (!options.silent) this.setData({ loading: true, error: '' });
      try { return await task(); } catch (error) { this.setData({ error: error.message }); return null; }
      finally { if (!options.silent) this.setData({ loading: false }); }
    }
  });
  return { page, calls, modals, load: () => page.onLoad({ kind: 'objectives', id: ID }),
    changeIdentity() { user = { ...user, userId: 'employee-b' }; revision++; },
    changeRevision() { revision++; }, changeShop() { user = { ...user, shop: { id: 'other-shop' } }; revision++; } };
}
const input = value => ({ detail: { value } });
const toggle = (index, value) => ({ currentTarget: { dataset: { index } }, detail: { value } });
function editable(extra = {}) {
  let current = row(extra);
  const h = harness(async (name, params) => {
    if (name === 'objectives') return paged([current]);
    assert.equal(name, 'objective-update');
    current = { ...current, ...copy(params), updated_at: '2026-10-16T09:01:00+08:00' };
    return { id: current.id, key_results: copy(current.key_results), key_actions: current.key_actions, updated_at: current.updated_at };
  });
  return h;
}

test('finds exact objective across deployed zero-based list pages, without a fabricated detail endpoint', async () => {
  const h = harness(async (name, params) => {
    assert.equal(name, 'objectives');
    return params.page === 0 ? paged([row({ id: 'another' })], 0, true) : paged([row()], 1);
  });
  await h.load();
  assert.equal(h.page.data.item.id, ID);
  assert.deepEqual(h.calls.map(c => c.params), [{ page: 0, page_size: 50 }, { page: 1, page_size: 50 }]);
});

for (const stop of ['onHide', 'onUnload', 'changeIdentity', 'changeRevision', 'changeShop']) {
  test('pagination stops before next request after ' + stop, async () => {
    const d = deferred(); const h = harness(() => d.promise);
    const load = h.load();
    if (h[stop]) h[stop](); else h.page[stop]();
    d.resolve(paged([row({ id: 'other' })], 0, true)); await load;
    assert.equal(h.calls.length, 1);
    assert.equal(h.page.data.item, null);
    assert.equal(h.page.data.error || '', '');
  });
}

for (const bad of [
  { ...paged([row()]), page: 9 }, { ...paged([row()]), has_more: 'false' },
  { ...paged([row()]), shop_id: 'foreign' }, paged([null]), paged([row({ shop_id: 'foreign' })]),
  paged([row({ key_results: {} })]), paged([row({ key_actions: {} })])
]) test('malformed or foreign list data is an error, not a substituted detail', async () => {
  const h = harness(async () => bad); await h.load();
  assert.equal(h.page.data.item, null); assert.ok(h.page.data.error);
});

test('terminal empty page reports missing content without invented empty objective', async () => {
  const h = harness(async () => paged([])); await h.load();
  assert.equal(h.page.data.item, null); assert.ok(h.page.data.error);
});

test('KR view uses Web name and numeric progress semantics without modifying original JSON', async () => {
  const h = editable({ key_results: [{ name: '已掌握', progress: 100, extra: [1, 2] }, { text: '部分', progress: 12.75 }, '文字结果'] });
  await h.load();
  assert.equal(h.page.data.draftResults[0].title, '已掌握');
  assert.equal(h.page.data.draftResults[0].completed, true);
  assert.equal(h.page.data.draftResults[1].completed, false);
  h.page.onKeyActionsInput(input('新行动')); await h.page.saveObjective();
  const write = h.calls.find(c => c.name === 'objective-update');
  assert.equal(write.params.key_results, undefined, 'untouched KR is not rewritten');
  assert.match(h.page.data.actionNotice, /已核对/);
});

test('explicit completion changes only completion semantics and preserves other KR JSON', async () => {
  const originals = [{ name: '部分', progress: 37.5, custom: { a: 1 } }, { title: '双标志', done: true, completed: true, progress: 100, owner: 'existing' }, '纯文字'];
  const h = editable({ key_results: originals }); await h.load();
  h.page.onKeyResultChange(toggle(1, false)); await h.page.saveObjective();
  const value = h.calls.find(c => c.name === 'objective-update').params.key_results;
  assert.deepEqual(value[0], originals[0]); assert.equal(value[2], originals[2]);
  assert.deepEqual(value[1], { title: '双标志', done: false, completed: false, progress: 0, owner: 'existing' });
});

test('progress-only KR and string KR change only after explicit toggles', async () => {
  const h = editable({ key_results: [{ name: '阶段', progress: 37.5, custom: true }, '文字'] }); await h.load();
  h.page.onKeyResultChange(toggle(0, true)); h.page.onKeyResultChange(toggle(1, true)); await h.page.saveObjective();
  assert.deepEqual(h.calls.find(c => c.name === 'objective-update').params.key_results, [{ name: '阶段', progress: 100, custom: true }, { text: '文字', done: true }]);
});

test('unchanged null actions and JSON metadata are not rewritten', async () => {
  const h = editable({ key_actions: null }); await h.load();
  h.page.onKeyResultChange(toggle(0, true)); await h.page.saveObjective();
  assert.equal(h.calls.find(c => c.name === 'objective-update').params.key_actions, undefined);
});

test('4000 UTF16 units are accepted; 4001 are rejected at runtime without truncating draft', async () => {
  const h = editable(); await h.load(); h.page.onKeyActionsInput(input('x'.repeat(4001)));
  await h.page.saveObjective(); assert.equal(h.calls.filter(c => c.name === 'objective-update').length, 0);
  assert.equal(h.page.data.keyActionsDraft.length, 4001); assert.match(h.page.data.error, /4000/);
  h.page.onKeyActionsInput(input('x'.repeat(4000))); await h.page.saveObjective();
  assert.equal(h.calls.filter(c => c.name === 'objective-update').length, 1);
});

test('WXML has a 4000 action limit, server eligibility explanation, and no fake permission gate', () => {
  const source = fs.readFileSync(file.replace('.js', '.wxml'), 'utf8');
  assert.match(source, /bindinput="onKeyActionsInput"[^>]*maxlength="4000"/);
  assert.match(source, /保存权限.*服务器/);
  const article = source.match(/<view wx:if="([^"]+)" class="card article">/);
  assert.ok(article);
  assert.match(article[1], /kind !== 'objectives'/, 'structured OKR content is not an unavailable article');
});

for (const change of [receipt => ({ ...receipt, id: 'wrong' }), receipt => ({ ...receipt, key_actions: 'wrong' }), receipt => ({ ...receipt, key_results: [] }), receipt => ({ ...receipt, updated_at: 'bad' }), () => ({ updated: true })]) {
  test('invalid update receipt cannot report saved and preserves draft', async () => {
    const original = row(); const h = harness(async name => name === 'objectives' ? paged([original]) : change({ id: ID, key_actions: '新行动', key_results: original.key_results, updated_at: stamp }));
    await h.load(); h.page.onKeyActionsInput(input('新行动')); await h.page.saveObjective();
    assert.equal(h.page.data.keyActionsDraft, '新行动'); assert.ok(h.page.data.error);
    assert.doesNotMatch(h.page.data.actionNotice || '', /保存.*已核对/);
    const count = h.calls.length; await h.page.saveObjective(); assert.equal(h.calls.length, count, 'unverified result cannot be resent');
  });
}

for (const mode of ['mismatch', 'failure']) test('valid receipt plus readback ' + mode + ' is not saved and does not lose draft', async () => {
  let reads = 0; const original = row();
  const h = harness(async name => {
    if (name === 'objectives') { reads++; if (reads > 1 && mode === 'failure') throw new Error('readback unavailable'); return paged([original]); }
    return { id: ID, key_results: original.key_results, key_actions: '新行动', updated_at: '2026-10-16T09:01:00+08:00' };
  });
  await h.load(); h.page.onKeyActionsInput(input('新行动')); await h.page.saveObjective();
  assert.equal(h.page.data.keyActionsDraft, '新行动'); assert.ok(h.page.data.error);
  assert.doesNotMatch(h.page.data.actionNotice || '', /保存.*已核对/);
});

test('unknown save is single flight and retry is read-only, never an automatic resend', async () => {
  const d = deferred(); const h = harness(async name => name === 'objectives' ? paged([row()]) : d.promise);
  await h.load(); h.page.onKeyActionsInput(input('未确认草稿'));
  const write = h.page.saveObjective(); await h.page.saveObjective();
  d.reject(new Error('network timeout')); await write;
  assert.equal(h.page.data.keyActionsDraft, '未确认草稿');
  await h.page.retry();
  assert.equal(h.calls.filter(c => c.name === 'objective-update').length, 1);
});

for (const stop of ['onHide', 'onUnload', 'changeIdentity', 'changeRevision']) test('save callback after ' + stop + ' neither starts readback nor paints old state', async () => {
  const d = deferred(); const h = harness(async name => name === 'objectives' ? paged([row()]) : d.promise);
  await h.load(); h.page.onKeyActionsInput(input('旧身份草稿')); const save = h.page.saveObjective();
  if (h[stop]) h[stop](); else h.page[stop]();
  d.resolve({ id: ID, key_actions: '旧身份草稿', key_results: row().key_results, updated_at: stamp }); await save;
  assert.equal(h.calls.filter(c => c.name === 'objectives').length, 1);
  assert.equal(h.page.data.actionNotice || '', '');
  if (stop === 'onHide' || stop === 'onUnload') { assert.equal(h.page.data.item, null); assert.equal(h.page.data.keyActionsDraft, ''); assert.deepEqual(copy(h.page.data.draftResults), []); }
});

test('hidden or stale direct handler calls cannot write or mutate objective draft', async () => {
  const h = editable(); await h.load(); h.page.onHide();
  h.page.onKeyActionsInput(input('不能采用')); h.page.onKeyResultChange(toggle(0, true)); await h.page.saveObjective();
  assert.equal(h.page.data.keyActionsDraft, ''); assert.equal(h.calls.filter(c => c.name === 'objective-update').length, 0);
});

test('preview never sends objective mutation even via direct save handler', async () => {
  const h = editable(); await h.load(); h.page.preview = true; h.page.onKeyActionsInput(input('演示草稿')); await h.page.saveObjective();
  assert.equal(h.calls.filter(c => c.name === 'objective-update').length, 0);
});

test('reload confirmation does not discard edits made after opening the modal', async () => {
  const h = editable(); await h.load(); h.page.onKeyActionsInput(input('草稿 A'));
  h.page.reloadObjective(); assert.equal(h.modals.length, 1);
  h.page.onKeyActionsInput(input('草稿 B'));
  h.modals[0].success({ confirm: true }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.length, 1); assert.equal(h.page.data.keyActionsDraft, '草稿 B');
});

test('pull refresh cannot silently discard an unsaved objective draft', async () => {
  const h = editable(); await h.load(); h.page.onKeyActionsInput(input('尚未保存'));
  await h.page.onPullDownRefresh();
  assert.equal(h.calls.length, 1); assert.equal(h.modals.length, 1);
  assert.equal(h.page.data.keyActionsDraft, '尚未保存');
});

test('explicit confirmed reload after unknown save reads only and permits fresh edits', async () => {
  const h = harness(async name => { if (name === 'objectives') return paged([row()]); throw new Error('timeout'); });
  await h.load(); h.page.onKeyActionsInput(input('未知草稿')); await h.page.saveObjective();
  assert.equal(h.page.data.objectiveBlocked, true);
  h.page.retry(); assert.equal(h.page.data.keyActionsDraft, '未知草稿');
  h.modals[0].success({ confirm: true }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.page.data.objectiveBlocked, false); assert.equal(h.page.data.keyActionsDraft, '原行动');
  assert.equal(h.calls.filter(c => c.name === 'objective-update').length, 1);
  assert.equal(h.page.data.actionNotice, '');
});

for (const stop of ['onHide', 'onUnload', 'changeIdentity', 'changeRevision']) test('reload modal after ' + stop + ' cannot fetch or discard another context', async () => {
  const h = editable(); await h.load(); h.page.onKeyActionsInput(input('旧草稿')); h.page.reloadObjective();
  if (h[stop]) h[stop](); else h.page[stop]();
  h.modals[0].success({ confirm: true }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.length, 1);
});

test('hide clears all objective private fields and show reads fresh rather than restoring stale draft', async () => {
  const h = editable(); await h.load(); h.page.onKeyActionsInput(input('私密草稿'));
  h.page.onHide(); assert.equal(h.page._objective, null); assert.equal(h.page._objectiveDraft, null);
  assert.deepEqual(copy(h.page.data.fields), []); assert.deepEqual(copy(h.page.data.results), []);
  await h.page.onShow(); assert.equal(h.page.data.keyActionsDraft, '原行动'); assert.equal(h.calls.length, 2);
});

test('current 401 reaches shared run with no private residual; late 401 cannot affect the new actor', async () => {
  const d = deferred(); const h = harness(async name => name === 'objectives' ? paged([row()]) : d.promise);
  const errors = []; const run = h.page.run;
  h.page.run = function(task, options) { return run.call(this, async () => { try { return await task(); } catch (error) { errors.push(error.status); throw error; } }, options); };
  await h.load(); h.page.onKeyActionsInput(input('私密草稿')); const write = h.page.saveObjective();
  d.reject(Object.assign(new Error('expired'), { status: 401 })); await write;
  assert.deepEqual(errors, [401]); assert.equal(h.page.data.item, null); assert.equal(h.page.data.keyActionsDraft, '');
  const late = deferred(); const other = harness(async name => name === 'objectives' ? paged([row()]) : late.promise);
  await other.load(); other.page.onKeyActionsInput(input('私密草稿')); const save = other.page.saveObjective();
  other.changeIdentity(); late.reject(Object.assign(new Error('expired'), { status: 401 })); await save;
  assert.equal(other.page.data.error || '', ''); assert.equal(other.page.data.actionNotice || '', '');
});

test('KR JSON null/number/array shapes survive an unrelated action edit without becoming objects', async () => {
  const h = editable({ key_results: [null, 7, ['existing'], { name: '已有', done: 'yes', meta: { a: true } }] });
  await h.load(); assert.equal(h.page.data.draftResults[3].completed, true);
  h.page.onKeyResultChange(toggle(0, true)); h.page.onKeyActionsInput(input('新行动')); await h.page.saveObjective();
  assert.equal(h.calls.find(c => c.name === 'objective-update').params.key_results, undefined);
});

test('native onLoad pending followed immediately by onShow shares one active initial read', async () => {
  const d = deferred(); const h = harness(async () => d.promise);
  const load = h.load(); const serial = h.page._objectiveSerial;
  const show = h.page.onShow(), again = h.page.onShow();
  const count = h.calls.length, afterShow = h.page._objectiveSerial;
  d.resolve(paged([row()])); await Promise.all([load, show, again]);
  assert.equal(count, 1); assert.equal(afterShow, serial);
  assert.equal(h.page.data.item.id, ID); assert.equal(h.page.data.loading, false);
});

for (const outcome of ['receipt', 'timeout', 'late401', 'newIdentity']) test('hide/show during pending save resumes fresh visible read after ' + outcome + ', never old receipt or another write', async () => {
  const d = deferred(); let reads = 0;
  const h = harness(async name => {
    if (name === 'objectives') { reads++; return paged([row({ key_actions: reads > 1 ? '当前云端内容' : '原行动' })]); }
    return d.promise;
  });
  await h.load(); h.page.onKeyActionsInput(input('旧回包草稿')); const save = h.page.saveObjective();
  h.page.onHide(); if (outcome === 'newIdentity') h.changeIdentity(); await h.page.onShow();
  assert.equal(h.calls.filter(c => c.name === 'objectives').length, 1);
  if (outcome === 'timeout') d.reject(new Error('timeout'));
  else if (outcome === 'late401') d.reject(Object.assign(new Error('expired'), { status: 401 }));
  else d.resolve({ id: ID, key_actions: '旧回包草稿', key_results: row().key_results, updated_at: stamp });
  await save; await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.filter(c => c.name === 'objectives').length, 2);
  assert.equal(h.calls.filter(c => c.name === 'objective-update').length, 1);
  assert.equal(h.page.data.item.id, ID); assert.equal(h.page.data.keyActionsDraft, '当前云端内容');
  assert.equal(h.page.data.actionNotice, ''); assert.equal(h.page.data.error, ''); assert.equal(h.page.data.loading, false);
});

for (const stop of ['onHide', 'onUnload', 'changeIdentity', 'changeRevision']) test('queued visible refresh is cancelled by ' + stop + ' before old save settles', async () => {
  const d = deferred(); const h = harness(async name => name === 'objectives' ? paged([row()]) : d.promise);
  await h.load(); h.page.onKeyActionsInput(input('原草稿')); const save = h.page.saveObjective();
  h.page.onHide(); await h.page.onShow();
  if (h[stop]) h[stop](); else h.page[stop]();
  d.resolve({ id: ID, key_actions: '原草稿', key_results: row().key_results, updated_at: stamp }); await save;
  assert.equal(h.calls.filter(c => c.name === 'objectives').length, 1);
  assert.equal(h.calls.filter(c => c.name === 'objective-update').length, 1);
  assert.equal(h.page.data.item, null); assert.equal(h.page.data.keyActionsDraft, '');
});

test('initial read guard is context-bound and never blocks a fresh actor read', async () => {
  const d = deferred(); let reads = 0;
  const h = harness(async () => { reads++; return reads === 1 ? d.promise : paged([row({ title: '新身份可见' })]); });
  const initial = h.load(); h.changeIdentity(); await h.page.onShow();
  assert.equal(h.calls.length, 2); assert.equal(h.page.data.item.title, '新身份可见');
  d.resolve(paged([row({ title: '旧身份内容' })])); await initial;
  assert.equal(h.page.data.item.title, '新身份可见'); assert.equal(h.page.data.loading, false);
});

test('explicit completion updates both existing flag fields and existing numeric progress to 100', async () => {
  const h = editable({ key_results: [{ name: '双字段', done: false, completed: false, progress: 37.5, original: { keep: true } }] });
  await h.load(); h.page.onKeyResultChange(toggle(0, true)); await h.page.saveObjective();
  assert.deepEqual(h.calls.find(c => c.name === 'objective-update').params.key_results, [{ name: '双字段', done: true, completed: true, progress: 100, original: { keep: true } }]);
});

test('explicit uncomplete retains partial numeric progress but clears a complete numeric progress', async () => {
  const h = editable({ key_results: [{ name: '部分', done: true, progress: 37.5 }, { name: '完成', completed: true, progress: 100 }] });
  await h.load(); h.page.onKeyResultChange(toggle(0, false)); h.page.onKeyResultChange(toggle(1, false)); await h.page.saveObjective();
  assert.deepEqual(h.calls.find(c => c.name === 'objective-update').params.key_results, [{ name: '部分', done: false, progress: 37.5 }, { name: '完成', completed: false, progress: 0 }]);
});
