const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const file = path.resolve(__dirname, '../miniprogram/pages/list/index.js');
const helperFile = path.join(path.dirname(file), 'rewards.js');
const keys = ['daily_first_scan', 'daily_3_scans', 'daily_quiz', 'daily_post'];
const ids = ['00000000-0000-4000-8000-000000000991', '00000000-0000-4000-8000-000000000992'];
const clone = x => JSON.parse(JSON.stringify(x));
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function dto(extra = {}) {
  return { date: '2026-10-16', pending_exp: [], claimed_today: [], today_counts: { scans: 1, quiz_passed: 1, quiz_attempts: 1, community_posts: 0 },
    items: keys.map((key, i) => ({ id: key, task_key: key, title: '任务 ' + key, completed: i === 0 || i === 2, claimed: false, progress: i === 0 || i === 2 ? 1 : 0, target: i === 1 ? 3 : 1, amount: [5, 10, 15, 5][i] })),
    pending_items: ids.map((id, i) => ({ id, pending_id: id, title: '待领示例 ' + (i + 1), amount: i ? 10 : 5, completed: true, claimed: false, source: 'growth', created_at: '2026-10-16T00:00:00Z' })), ...extra };
}
function helper() { assert.ok(fs.existsSync(helperFile), 'small pure reward protocol helper exists'); return require(helperFile); }
function harness(action, options = {}) {
  let definition, clock = Date.parse('2026-10-16T04:00:00Z'), revision = 1;
  let user = { userId: 'employee-a', shop: { id: 'shop-a' } };
  const calls = [], modals = [], navigations = [], auth = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const wx = { setNavigationBarTitle() {}, stopPullDownRefresh() {}, showModal(p) { modals.push(p); } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require(id) { if (id === '../../shared/page') return { definePage: x => x }; return require(path.resolve(path.dirname(file), id)); },
    Page(p) { definition = p; }, wx, Date: Clock, console
  }, { filename: file });
  const page = Object.assign({}, definition, {
    data: clone(definition.data), preview: !!options.preview,
    session: { get: () => user, revision: () => revision },
    api: { action: async (name, params) => { calls.push({ name, params: clone(params) }); return action(name, params); } },
    setData(x) { Object.assign(this.data, x); }, navigate(url) { navigations.push(url); },
    async run(task, opts = {}) {
      const rev = revision;
      if (!opts.silent) this.setData({ loading: true, error: '' });
      try { return await task(); } catch (error) { if (rev === revision) { if (error.status === 401) auth.push(401); this.setData({ error: error.message }); } return null; }
      finally { if (!opts.silent) this.setData({ loading: false }); }
    }
  });
  page.data.preview = !!options.preview;
  return { page, calls, modals, navigations, auth, load: () => page.onLoad({ kind: 'tasks' }),
    async confirm() { await page.confirmRewards(); assert.ok(modals.length, 'explicit modal required'); return modals.at(-1).success({ confirm: true }); },
    changeIdentity() { user = { ...user, userId: 'employee-b' }; revision++; },
    changeShop() { user = { ...user, shop: { id: 'shop-b' } }; revision++; }, changeRevision() { revision++; },
    midnight() { clock = Date.parse('2026-10-16T16:00:00Z'); }, clockAt(value) { clock = Date.parse(value); } };
}
function standard(options = {}) { return harness(async name => name === 'tasks' ? dto() : { ok: true, amount: 3, total_exp: 103 }, options); }

test('pure queue uses latest pending order then only completed unclaimed daily keys', () => {
  const data = dto(); data.items[2].claimed = true;
  const parsed = helper().parse(data);
  assert.deepEqual(parsed.queue.map(x => x.params), [{ pending_id: ids[0] }, { pending_id: ids[1] }, { task_key: keys[0] }]);
  assert.equal(parsed.pendingCount, 2); assert.equal(parsed.dailyCount, 1); assert.equal(parsed.date, data.date);
});

for (const value of [
  dto({ date: '2026-02-30' }), dto({ pending_items: undefined }), dto({ items: [] }),
  dto({ items: dto().items.map((x, i) => i ? x : { ...x, completed: 'true' }) }),
  dto({ pending_items: [dto().pending_items[0], dto().pending_items[0]] }),
  dto({ pending_items: [{ ...dto().pending_items[0], pending_id: 'not-a-uuid' }] }),
  dto({ pending_items: [{ ...dto().pending_items[0], amount: null }] })
]) test('malformed tasks DTO has no executable queue', () => { const r = helper(); assert.throws(() => r.parse(value)); });

test('receipts accept actual signed integer changes, including SQL zero/null-total, never anticipated sums', () => {
  const r = helper();
  assert.equal(r.receipt({ ok: true, amount: -3, total_exp: 97 }).amount, -3);
  assert.equal(r.receipt({ ok: true, amount: 0, total_exp: null }).amount, 0);
  assert.equal(r.receipt({ ok: true, amount: 8, total_exp: 5000 }).amount, 8);
});
for (const value of [{ ok: true }, { ok: false, amount: 1, total_exp: 1 }, { ok: true, amount: '5', total_exp: 5 }, { ok: true, amount: 1.5, total_exp: 5 }, { ok: true, amount: 1, total_exp: null }]) {
  test('malformed receipt is unknown rather than a fabricated zero reward', () => { const r = helper(); assert.throws(() => r.receipt(value)); });
}

test('actual tasks DTO paints loaded counts and explicit confirmation before any mutation', async () => {
  const h = standard(); await h.load();
  assert.equal(h.page.data.rewardSummary.pendingCount, 2); assert.equal(h.page.data.rewardSummary.dailyCount, 2);
  await h.page.confirmRewards();
  assert.equal(h.calls.length, 1); assert.match(h.modals[0].content, /2026-10-16/);
  assert.match(h.modals[0].content, /2/); assert.match(h.modals[0].content, /非原子|逐项/);
  h.modals[0].success({ confirm: false }); await tick(); assert.equal(h.calls.length, 1);
});

test('native first onLoad/onShow share one in-flight task read', async () => {
  const d = deferred(); const h = harness(() => d.promise);
  const load = h.load(); const show = h.page.onShow(); const count = h.calls.length;
  d.resolve(dto()); await Promise.all([load, show]); assert.equal(count, 1);
});

test('confirmed batch serially submits pending then daily and sums only receipt amounts; exactly one fresh read', async () => {
  let reads = 0, i = 0; const changes = [8, -2, 0, 6];
  const h = harness(async name => {
    if (name === 'tasks') { reads++; return dto(); }
    const amount = changes[i++]; return { ok: true, amount, total_exp: amount === 0 ? null : 700 + i };
  });
  await h.load(); await h.confirm();
  assert.deepEqual(h.calls.filter(c => c.name === 'task-claim').map(c => c.params), [{ pending_id: ids[0] }, { pending_id: ids[1] }, { task_key: keys[0] }, { task_key: keys[2] }]);
  assert.equal(reads, 2); assert.equal(h.page.data.rewardTotal, 12);
  assert.deepEqual(h.page.data.rewardOutcomes.map(x => x.status), ['confirmed', 'confirmed', 'confirmed', 'confirmed']);
  assert.equal(h.page.data.rewardBusy, false);
});

test('duplicate taps/modal callbacks and item navigation cannot overlap the batch', async () => {
  const d = deferred(); const h = harness(async name => name === 'tasks' ? dto() : d.promise);
  await h.load(); await h.page.confirmRewards(); await h.page.confirmRewards(); assert.equal(h.modals.length, 1);
  const batch = h.modals[0].success({ confirm: true }); h.modals[0].success({ confirm: true });
  await h.page.confirmRewards(); h.page.openItem({ currentTarget: { dataset: { id: keys[0] } } }); await h.page.load();
  assert.equal(h.calls.filter(c => c.name === 'task-claim').length, 1); assert.equal(h.navigations.length, 0);
  d.resolve({ ok: true, amount: 1, total_exp: 1 }); await batch;
  assert.equal(h.calls.filter(c => c.name === 'task-claim').length, 4);
});

test('exact 409 claim_rejected is separate and processing can continue without parsing private error text', async () => {
  let writes = 0; const h = harness(async name => {
    if (name === 'tasks') return dto();
    if (++writes === 2) throw Object.assign(new Error('secret raw SQL'), { status: 409, code: 'claim_rejected' });
    return { ok: true, amount: 2, total_exp: 100 };
  });
  await h.load(); await h.confirm();
  assert.equal(writes, 4); assert.equal(h.page.data.rewardTotal, 6);
  assert.deepEqual(h.page.data.rewardOutcomes.map(x => x.status), ['confirmed', 'rejected', 'confirmed', 'confirmed']);
  assert.doesNotMatch(JSON.stringify(h.page.data), /secret raw SQL/);
});

for (const result of ['transport', 'wrong409', 'wrongStatus', '500', 'receipt']) test('unknown ' + result + ' stops remaining requests and is not resolved by list disappearance', async () => {
  let writes = 0, reads = 0;
  const h = harness(async name => {
    if (name === 'tasks') { reads++; return dto({ pending_items: reads > 1 ? [] : dto().pending_items }); }
    writes++;
    if (result === 'receipt') return { ok: true, amount: '5', total_exp: 5 };
    throw Object.assign(new Error('secret'), result === 'wrong409' ? { status: 409, code: 'other' } : result === 'wrongStatus' ? { status: 500, code: 'claim_rejected' } : result === '500' ? { status: 500, code: 'db_error' } : {});
  });
  await h.load(); await h.confirm();
  assert.equal(writes, 1); assert.equal(reads, 2); assert.equal(h.page.data.rewardTotal, 0);
  assert.deepEqual(h.page.data.rewardOutcomes.map(x => x.status), ['unknown', 'untouched', 'untouched', 'untouched']);
  assert.doesNotMatch(JSON.stringify(h.page.data), /secret/);
});

test('failed post-read retains exact confirmed/rejected/unknown/untouched results and total', async () => {
  let reads = 0, writes = 0;
  const h = harness(async name => {
    if (name === 'tasks') { if (++reads > 1) throw new Error('refresh failure'); return dto(); }
    writes++;
    if (writes === 1) return { ok: true, amount: 7, total_exp: 7 };
    if (writes === 2) throw Object.assign(new Error('denied'), { status: 409, code: 'claim_rejected' });
    throw new Error('unknown');
  });
  await h.load(); await h.confirm(); const before = clone(h.page.data.rewardOutcomes);
  assert.deepEqual(before.map(x => x.status), ['confirmed', 'rejected', 'unknown', 'untouched']);
  assert.equal(h.page.data.rewardTotal, 7); assert.ok(h.page.data.rewardRefreshError);
  await h.page.retry(); assert.equal(writes, 3); assert.deepEqual(clone(h.page.data.rewardOutcomes), before);
});

for (const change of ['onHide', 'onUnload', 'changeIdentity', 'changeShop', 'changeRevision', 'midnight', 'refresh']) test('stale confirmation after ' + change + ' cannot write', async () => {
  const h = standard(); await h.load(); await h.page.confirmRewards();
  if (change === 'refresh') await h.page.retry(); else if (h[change]) h[change](); else h.page[change]();
  await h.modals[0].success({ confirm: true }); await tick();
  assert.equal(h.calls.filter(c => c.name === 'task-claim').length, 0);
});

for (const change of ['onHide', 'onUnload', 'changeIdentity', 'changeShop', 'changeRevision']) test('in-flight result after ' + change + ' stops subsequent writes and cannot paint another context', async () => {
  const d = deferred(); const h = harness(async name => name === 'tasks' ? dto() : d.promise);
  await h.load(); await h.page.confirmRewards(); const batch = h.modals[0].success({ confirm: true });
  if (h[change]) h[change](); else h.page[change]();
  d.resolve({ ok: true, amount: 99, total_exp: 99 }); await batch;
  assert.equal(h.calls.filter(c => c.name === 'task-claim').length, 1);
  assert.equal(h.page.data.rewardTotal || 0, 0);
  if (change === 'onHide' || change === 'onUnload') { assert.deepEqual(clone(h.page.data.items), []); assert.deepEqual(clone(h.page.data.rewardOutcomes), []); assert.equal(h.page._taskSnapshot, null); }
});

test('returning while old claim is pending eventually reads current tasks but never resumes writes', async () => {
  const d = deferred(); let reads = 0;
  const h = harness(async name => { if (name === 'tasks') { reads++; return dto(); } return d.promise; });
  await h.load(); await h.page.confirmRewards(); const batch = h.modals[0].success({ confirm: true });
  h.page.onHide(); await h.page.onShow(); d.resolve({ ok: true, amount: 4, total_exp: 4 }); await batch; await tick();
  assert.equal(reads, 2); assert.equal(h.page.data.items.length, 6);
  assert.equal(h.calls.filter(c => c.name === 'task-claim').length, 1); assert.equal(h.page.data.rewardTotal, 0);
});

test('Shanghai midnight after a successful receipt stops the queue and does not attribute it to the old day', async () => {
  let h; h = harness(async name => { if (name === 'tasks') return dto({ date: '2026-10-17' }); h.midnight(); return { ok: true, amount: 9, total_exp: 9 }; });
  const original = h.page.api.action;
  let initial = true; h.page.api.action = async (name, params) => { if (name === 'tasks' && initial) { initial = false; return dto(); } return original(name, params); };
  await h.load(); await h.confirm();
  assert.equal(h.calls.filter(c => c.name === 'task-claim').length, 1); assert.equal(h.page.data.rewardTotal, 9);
  assert.equal(h.page.data.rewardOutcomes[0].dateUnverified, true);
  assert.match(h.page.data.rewardNotice, /跨日|日期/);
  assert.equal(h.page.data.rewardOutcomes.filter(x => x.status === 'untouched').length, 3);
});

for (const status of [401, 403]) test('auth ' + status + ' stops the queue without treating it as a known rejection', async () => {
  const h = harness(async name => { if (name === 'tasks') return dto(); throw Object.assign(new Error('private details'), { status, code: 'forbidden' }); });
  await h.load(); await h.confirm();
  assert.equal(h.calls.filter(c => c.name === 'task-claim').length, 1);
  assert.equal(h.calls.filter(c => c.name === 'tasks').length, 1);
  assert.equal(h.page.data.rewardTotal || 0, 0); assert.doesNotMatch(JSON.stringify(h.page.data), /private details/);
  if (status === 401) assert.deepEqual(h.auth, [401]);
});

test('preview zero writes even by direct confirm handler', async () => {
  const h = standard({ preview: true }); await h.load(); await h.page.confirmRewards();
  assert.equal(h.modals.length, 0); assert.equal(h.calls.filter(c => c.name === 'task-claim').length, 0);
});

test('real native controls show current-loaded scope, outcome states and disable preview/busy', () => {
  const wxml = fs.readFileSync(file.replace('.js', '.wxml'), 'utf8');
  const wxss = fs.readFileSync(file.replace('.js', '.wxss'), 'utf8');
  assert.match(wxml, /领取当前已加载奖励/); assert.match(wxml, /50/); assert.match(wxml, /rewardOutcomes/);
  assert.match(wxml, /bindtap="confirmRewards"[^>]*disabled="\{\{[^}]*preview/);
  assert.match(wxss, /\.reward-action[^}]*min-height:\s*100rpx/);
  for (const match of wxml.matchAll(/wx:(?:if|elif)="([^"]*)"/g)) assert.match(match[1], /^\{\{[\s\S]*\}\}$/);
});

test('raw counters without items retain an explicit statistics-versus-entries error', async () => {
  const h = harness(async () => ({ date: '2026-10-16', today_counts: { scans: 1 } }));
  await h.load(); assert.match(h.page.data.error, /任务.*统计.*条目/);
  assert.equal(h.page.data.rewardCanClaim, false);
});

test('a server date not matching the local Shanghai day explains why claim is disabled', async () => {
  const h = harness(async () => dto({ date: '2026-10-15' })); await h.load();
  assert.equal(h.page.data.rewardCanClaim, false); assert.match(h.page.data.rewardNotice, /日期.*刷新/);
});

test('result card always offers an explicitly read-only refresh, even after successful post-read', () => {
  const wxml = fs.readFileSync(file.replace('.js', '.wxml'), 'utf8');
  const results = wxml.slice(wxml.indexOf('class="card reward-results"'), wxml.indexOf('rewardNotice}}'));
  assert.match(results, /bindtap="retry"[^>]*>只读刷新云端状态/);
});

test('no eligible loaded rows means no confirm modal and never means all historical rewards were received', async () => {
  const h = harness(async () => dto({ pending_items: [], items: dto().items.map(item => ({ ...item, claimed: true })) }));
  await h.load(); await h.page.confirmRewards(); assert.equal(h.modals.length, 0);
  assert.equal(h.page.data.rewardCanClaim, false); assert.equal(h.page.data.rewardSummary.eligibleCount, 0);
});

test('a sent unknown row is never automatically queued again by later read-only refresh', async () => {
  let writes = 0; const h = harness(async name => { if (name === 'tasks') return dto(); writes++; throw new Error('unknown'); });
  await h.load(); await h.confirm(); await h.page.retry();
  assert.equal(writes, 1); assert.equal(h.page.data.rewardOutcomes[0].status, 'unknown');
  await h.page.confirmRewards();
  assert.equal(h.modals.length, 2);
  assert.ok(h.page._rewardModalToken.queue.every(item => item.params.pending_id !== ids[0]));
  h.modals[1].success({ confirm: false });
});

test('a late old-page auth failure cannot sign out or clear a freshly loaded new identity', async () => {
  const d = deferred(); const h = harness(async name => name === 'tasks' ? dto() : d.promise);
  await h.load(); await h.page.confirmRewards(); const batch = h.modals[0].success({ confirm: true });
  h.page.onHide(); h.changeIdentity(); await h.page.onShow();
  d.reject(Object.assign(new Error('old private text'), { status: 401 })); await batch;
  assert.deepEqual(h.auth, []); assert.equal(h.page.data.items.length, 6); assert.equal(h.page.data.error, '');
  assert.equal(h.calls.filter(c => c.name === 'task-claim').length, 1);
});

test('after hide/show, a queued fresh read is cancelled if the page unloads before the old request ends', async () => {
  const d = deferred(); const h = harness(async name => name === 'tasks' ? dto() : d.promise);
  await h.load(); await h.page.confirmRewards(); const batch = h.modals[0].success({ confirm: true });
  h.page.onHide(); await h.page.onShow(); h.page.onUnload(); d.resolve({ ok: true, amount: 9, total_exp: 9 }); await batch;
  assert.equal(h.calls.filter(c => c.name === 'tasks').length, 1); assert.deepEqual(clone(h.page.data.items), []);
});

test('parent synthetic preview DTO paints two pending and one eligible daily without any write', async () => {
  const { createPreview } = require('../miniprogram/shared/preview');
  const preview = createPreview({}), data = await preview.api.action('tasks');
  const h = harness((name, params) => preview.api.action(name, params), { preview: true });
  h.clockAt(data.date + 'T12:00:00+08:00'); await h.load();
  assert.equal(h.page.data.rewardSummary.pendingCount, 2); assert.equal(h.page.data.rewardSummary.dailyCount, 1);
  assert.equal(h.page.data.items.length, 6); assert.equal(h.page.data.error, '');
  await h.page.confirmRewards(); assert.equal(h.calls.length, 1); assert.equal(h.modals.length, 0);
});

test('the fifty-event window is accepted, never paginated or described as all history', () => {
  const r = helper(), pending = Array.from({ length: 50 }, (_, i) => ({ ...dto().pending_items[0], id: '00000000-0000-4000-8000-' + String(i).padStart(12, '0'), pending_id: '00000000-0000-4000-8000-' + String(i).padStart(12, '0') }));
  assert.equal(r.parse(dto({ pending_items: pending })).pendingCount, 50);
  assert.throws(() => r.parse(dto({ pending_items: pending.concat(dto().pending_items[1]) })));
});
