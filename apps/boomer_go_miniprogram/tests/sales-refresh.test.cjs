const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../miniprogram');
const STAMP = '2026-10-16T01:02:00Z';
const event = (key, value) => ({ currentTarget: { dataset: { [key]: value } } });
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function clock() {
  let now = 0, id = 0; const jobs = new Map();
  return { jobs, get now() { return now; }, set(fn, delay) { const key = ++id; jobs.set(key, { at: now + delay, fn }); return key; }, clear(key) { jobs.delete(key); },
    async advance(ms) { const target = now + ms; for (;;) { const next = [...jobs].filter(([, j]) => j.at <= target).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; now = next[1].at; jobs.delete(next[0]); next[1].fn(); await tick(); } now = target; await tick(); } };
}
function harness(name, handler, options = {}) {
  const time = clock(), calls = [], routes = [], renders = [];
  const env = { current: { userId: 'employee-a', shop: options.noShop ? null : { id: 'shop-a', name: '门店 A' }, profile: { display_name: '同事' }, scopeVersion: 1 }, revision: 1, signOuts: 0 };
  const session = { get: () => env.current, revision: () => env.revision, signOut() { env.signOuts++; env.current = null; env.revision++; }, selectShop(id) { env.current = { ...env.current, shop: { id, name: id } }; } };
  const fallback = async (action, p) => action === 'dashboard' ? { shift: { title: '早班', shop_name: '工作店', start_time: '09:00' }, as_of: STAMP }
    : action === 'tasks' ? { date: '2026-10-16', items: [{ id: 'task-a', title: '任务', completed: false }], pending_items: [] }
    : action === 'sales' ? { revenue: 100, order_count: 2, complete: true, as_of: STAMP, source_label: '付款毛额（未扣退款）' }
    : { items: [{ id: 'person-a', name: '同事', rank: 1, revenue: 100 }], complete: true, as_of: STAMP };
  const request = async (action, p) => { calls.push({ action, p: structuredClone(p), at: time.now, revision: env.revision }); return handler ? handler(action, p, fallback) : fallback(action, p); };
  const app = { session, preview: !!options.preview, ensureSession: async () => !!env.current, api: { action: request, sales: p => request('sales', p), leaderboard: p => request('leaderboard', p) } };
  const wx = { reLaunch(p) { routes.push(structuredClone(p)); }, stopPullDownRefresh() {}, switchTab() {}, navigateTo() {} };
  const shell = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module: shell, wx, getApp: () => app });
  const file = path.join(root, 'pages', name, 'index.js'); let spec;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require(id) { return id === '../../shared/page' ? shell.exports : require(path.resolve(path.dirname(file), id)); }, Page(p) { spec = p; }, getApp: () => app, wx, setTimeout: time.set, clearTimeout: time.clear });
  const page = { ...spec, data: structuredClone(spec.data), setData(p) { assert.notEqual(this._gone, true, 'no unloaded render'); renders.push(p); Object.assign(this.data, p); } };
  return { page, env, calls, time, routes, renders, count(action) { return calls.filter(c => c.action === action).length; }, change(kind = 'shop') { env.revision++; if (kind === 'shop') env.current = { ...env.current, shop: { id: 'shop-b', name: '门店 B' } }; if (kind === 'user') env.current = { ...env.current, userId: 'employee-b' }; }, start() { const load = page.onLoad({}); const show = page.onShow(); return Promise.all([load, show]); } };
}
for (const name of ['workbench', 'sales']) {
  test(name + ' first load/show is single flight and only financial reads repeat thirty seconds after settlement', async () => {
    const h = harness(name); await h.start(); assert.equal(h.count('sales'), 1); if (name === 'sales') assert.equal(h.count('leaderboard'), 1); await h.time.advance(29999); assert.equal(h.count('sales'), 1); await h.time.advance(1); assert.equal(h.count('sales'), 2);
    if (name === 'workbench') { assert.equal(h.count('dashboard'), 1); assert.equal(h.count('tasks'), 1); assert.equal(h.page.data.shift.title, '早班'); } else assert.equal(h.count('leaderboard'), 2);
    h.page.onUnload(); assert.equal(h.time.jobs.size, 0);
  });
  test(name + ' pending financial read never overlaps with timer or repeated manual refresh', async () => {
    const d = deferred(), h = harness(name, (a, p, f) => a === 'sales' ? d.promise : f(a, p)); const initial = h.start(); await tick(); await h.time.advance(120000); const manual = h.page.loadSales(); await tick(); assert.equal(h.count('sales'), 1); d.resolve({ revenue: 10, as_of: STAMP }); await initial; await manual; await h.time.advance(29999); assert.equal(h.count('sales'), 1); await h.time.advance(1); assert.equal(h.count('sales'), 2); h.page.onUnload();
  });
  for (const lifecycle of ['hide', 'unload']) test(name + ' ' + lifecycle + ' cancels timer and rejects late success without rendering or rearming', async () => {
    let d; const h = harness(name, (a, p, f) => a === 'sales' && d ? d.promise : f(a, p)); await h.start(); d = deferred(); await h.time.advance(30000); assert.equal(h.count('sales'), 2); assert.equal(typeof h.page.onHide, 'function'); h.page[lifecycle === 'hide' ? 'onHide' : 'onUnload'](); const renders = h.renders.length; d.resolve({ revenue: 999, as_of: STAMP }); await tick(); await h.time.advance(120000); assert.equal(h.count('sales'), 2); assert.equal(h.time.jobs.size, 0); assert.equal(h.renders.length, renders); assert.notEqual(name === 'sales' ? h.page.data.metrics[0] && h.page.data.metrics[0].value : h.page.data.salesValue, '¥999.00');
  });
  test(name + ' returning immediately reads again without duplicate first-show requests', async () => {
    const h = harness(name); await h.start(); assert.equal(typeof h.page.onHide, 'function'); h.page.onHide(); await h.time.advance(120000); assert.equal(h.count('sales'), 1); await h.page.onShow(); assert.equal(h.count('sales'), 2); h.page.onUnload();
  });
  test(name + ' hide/show immediately reads the fresh visible context without letting an older pending read overwrite it', async () => {
    const d = deferred(); let first = true; const h = harness(name, (a, p, f) => { if (a === 'sales' && first) { first = false; return d.promise; } return f(a, p); }); const initial = h.start(); await tick(); assert.equal(typeof h.page.onHide, 'function'); h.page.onHide(); const shown = h.page.onShow(); await tick(); assert.equal(h.count('sales'), 2); await shown; d.resolve({ revenue: 999 }); await initial; assert.equal(name === 'sales' ? h.page.data.metrics[0].value : h.page.data.salesValue, '¥100.00'); h.page.onUnload();
  });
  for (const kind of ['user', 'shop', 'revision']) test(name + ' late 401 cannot sign out a replacement ' + kind + ' context or install old data', async () => {
    const d = deferred(); let first = true; const h = harness(name, (a, p, f) => { if (a === 'sales' && first) { first = false; return d.promise; } return f(a, p); }); const initial = h.start(); await tick(); h.change(kind); const next = h.page.onShow(); d.reject(Object.assign(Error('old expired'), { status: 401, requestRevision: 1 })); await initial; await next; assert.equal(h.env.signOuts, 0); assert.equal(h.routes.length, 0); assert.equal(name === 'sales' ? h.page.data.metrics[0].value : h.page.data.salesValue, '¥100.00'); h.page.onUnload();
  });
  test(name + ' current financial401 uses shared auth cleanup once and stops future timer reads', async () => {
    const h = harness(name, (a, p, f) => { if (a === 'sales') throw Object.assign(Error('expired'), { status: 401, requestRevision: 1 }); return f(a, p); }); await h.start(); assert.equal(h.env.signOuts, 1); assert.deepEqual(h.routes, [{ url: '/pages/login/index' }]); await h.time.advance(120000); assert.equal(h.count('sales'), 1); assert.equal(h.time.jobs.size, 0); h.page.onUnload();
  });
  for (const options of [{ preview: true }, { noShop: true }]) test(name + ' ' + (options.preview ? 'preview' : 'no shop') + ' never starts financial adapters or timers', async () => {
    const h = harness(name, null, options); await h.start(); await h.time.advance(120000); await h.page.loadSales(); assert.equal(h.count('sales'), 0); assert.equal(h.count('leaderboard'), 0); assert.equal(h.time.jobs.size, 0); h.page.onUnload();
  });
  test(name + ' transient failure clears its financial snapshot rather than relabeling stale revenue as current', async () => {
    let fail = false; const h = harness(name, (a, p, f) => { if (a === 'sales' && fail) throw Error('营业数据读取失败'); return f(a, p); }); await h.start(); const prior = name === 'sales' ? h.page.data.freshness : h.page.data.salesFreshness; assert.match(prior, /10-16 09:02/); fail = true; await h.time.advance(30000); assert.ok(h.page.data.salesError); assert.equal(name === 'sales' ? h.page.data.freshness : h.page.data.salesFreshness, ''); assert.equal(name === 'sales' ? h.page.data.metrics.length : h.page.data.salesValue, name === 'sales' ? 0 : '暂无数据'); h.page.onUnload();
  });
  test(name + ' refresh keeps the actual source timestamp instead of using timer completion as freshness', async () => {
    const h = harness(name); await h.start(); const before = name === 'sales' ? h.page.data.freshness : h.page.data.salesFreshness; await h.time.advance(90000); assert.equal(name === 'sales' ? h.page.data.freshness : h.page.data.salesFreshness, before); h.page.onUnload();
  });
}
for (const blocked of ['sales', 'leaderboard']) test('sales and leaderboard settle and poll independently while ' + blocked + ' stays pending', async () => {
  const d = deferred(), other = blocked === 'sales' ? 'leaderboard' : 'sales'; const h = harness('sales', (a, p, f) => a === blocked ? d.promise : f(a, p)); const initial = h.start(); await tick(); assert.equal(h.count(other), 1); if (other === 'sales') assert.equal(h.page.data.metrics[0].value, '¥100.00'); else assert.equal(h.page.data.items.length, 1); await h.time.advance(30000); assert.equal(h.count(other), 2); assert.equal(h.count(blocked), 1); h.page.onHide(); d.resolve(blocked === 'sales' ? { revenue: 999 } : { items: [] }); await initial; assert.equal(h.time.jobs.size, 0); h.page.onUnload();
});
test('period change clears prior values and immediately replaces both channels without accepting an old-period result', async () => {
  const d = deferred(); let pending = false; const h = harness('sales', (a, p, f) => a === 'sales' && pending && p.period === 'today' ? d.promise : f(a, p)); await h.start(); pending = true; await h.time.advance(30000); const change = h.page.onPeriod(event('period', 'month')); assert.equal(h.page.data.metrics.length, 0); assert.equal(h.page.data.freshness, ''); await tick(); assert.equal(h.calls.filter(c => c.action === 'leaderboard').at(-1).p.period, 'month'); assert.equal(h.calls.filter(c => c.action === 'sales').at(-1).p.period, 'month'); await change; d.resolve({ revenue: 999, as_of: STAMP }); await tick(); assert.equal(h.page.data.metrics[0].value, '¥100.00'); h.page.onUnload();
});
test('invalid/same period and invalid view events do not replace the financial request context', async () => {
  const h = harness('sales'); await h.start(); await h.page.onPeriod(event('period', 'unsupported')); await h.page.onPeriod(event('period', 'today')); h.page.onKind(event('kind', 'bad')); assert.equal(h.page.data.period, 'today'); assert.equal(h.page.data.kind, 'summary'); assert.equal(h.count('sales'), 1); h.page.onUnload();
});
test('scope replacement clears old store values immediately while new read is queued and no old finally unlocks it', async () => {
  const d = deferred(), next = deferred(); let call = 0; const h = harness('sales', (a, p, f) => a === 'sales' ? (++call === 1 ? f(a, p) : call === 2 ? d.promise : next.promise) : f(a, p)); await h.start(); await h.time.advance(30000); h.change(); const loading = h.page.onShow(); await tick(); assert.equal(h.page.data.metrics.length, 0); d.resolve({ revenue: 999 }); await tick(); assert.equal(h.page.data.salesLoading, true); assert.equal(h.page.data.metrics.length, 0); next.resolve({ revenue: 200, as_of: STAMP }); await loading; assert.equal(h.page.data.metrics[0].value, '¥200.00'); h.page.onUnload();
});
test('both templates explain foreground polling and source delay without claiming a real-time stream', async () => {
  for (const name of ['sales', 'workbench']) {
    const xml = fs.readFileSync(path.join(root, 'pages', name, 'index.wxml'), 'utf8'); assert.match(xml, /30\s*秒/); assert.match(xml, /源.*延迟|来源.*延迟|源.*同步/); assert.doesNotMatch(xml, /实时流|WebSocket/);
    const h = harness(name, null, { preview: true }); await h.start(); assert.match(h.page.data.salesNotice, /预览.*不.*ERP/); assert.match(xml, /\{\{salesNotice\}\}/); assert.equal(h.count('sales'), 0); h.page.onUnload();
  }
});
test('workbench preview notice appears only inside its financial card, not in the foreground refresh hint', async () => {
  const h = harness('workbench', null, { preview: true }); await h.start(); assert.match(h.page.data.salesNotice, /预览.*不.*ERP/);
  const xml = fs.readFileSync(path.join(root, 'pages/workbench/index.wxml'), 'utf8'); assert.match(xml, /wx:elif="\{\{salesNotice\}\}"[^>]*>\{\{salesNotice\}\}/);
  assert.match(xml, /<view wx:if="\{\{!preview\}\}" class="muted sales-freshness">仅前台[^<]*30\s*秒[^<]*<\/view>/); assert.doesNotMatch(xml, /\{\{preview\s*\?/); h.page.onUnload();
});
test('workbench return refreshes financials immediately even when fresh bootstrap is slow, without a second financial read at bootstrap settle', async () => {
  const d = deferred(); let returned = false; const h = harness('workbench', (a, p, f) => a === 'dashboard' && returned ? d.promise : f(a, p)); await h.start(); h.page.onHide(); returned = true; const shown = h.page.onShow(); await tick(); assert.equal(h.count('sales'), 2); assert.equal(h.count('tasks'), 1); d.resolve({ shift: { title: '新班次' } }); await shown; assert.equal(h.count('sales'), 2); assert.equal(h.count('tasks'), 2); h.page.onUnload();
});
test('hidden workbench shop-picker callback cannot change store or restart reads', async () => {
  const h = harness('workbench'); h.env.current = { ...h.env.current, isHeadquarters: true, shops: [h.env.current.shop, { id: 'shop-b', name: 'B' }] }; await h.start(); h.page.onHide(); const count = h.calls.length; await h.page.onShopChange({ detail: { value: '1' } }); assert.equal(h.env.current.shop.id, 'shop-a'); assert.equal(h.calls.length, count); h.page.onUnload();
});
test('leaderboard current401 reaches shared auth cleanup and invalidates a still pending sales response', async () => {
  const d = deferred(), h = harness('sales', (a, p, f) => { if (a === 'sales') return d.promise; if (a === 'leaderboard') throw Object.assign(Error('expired'), { status: 401, requestRevision: 1 }); return f(a, p); }); const initial = h.start(); await tick(); assert.equal(h.env.signOuts, 1); d.resolve({ revenue: 999 }); await initial; assert.equal(h.page.data.metrics.length, 0); assert.equal(h.page.data.items.length, 0); assert.equal(h.time.jobs.size, 0); h.page.onUnload();
});
test('leaderboard old401 and old finally cannot clear the replacement scope sales or leaderboard', async () => {
  const d = deferred(); let first = true; const h = harness('sales', (a, p, f) => { if (a === 'leaderboard' && first) { first = false; return d.promise; } return f(a, p); }); const initial = h.start(); await tick(); h.change('user'); await h.page.onShow(); d.reject(Object.assign(Error('old expired'), { status: 401, requestRevision: 1 })); await initial; assert.equal(h.env.signOuts, 0); assert.equal(h.page.data.items.length, 1); assert.equal(h.page.data.metrics[0].value, '¥100.00'); assert.equal(h.page.data.leaderboardLoading, false); h.page.onUnload();
});
test('one leaderboard failure never blocks or clears a successfully refreshed sales channel', async () => {
  const h = harness('sales', (a, p, f) => { if (a === 'leaderboard') throw Error('榜单暂不可用'); return f(a, p); }); await h.start(); assert.equal(h.page.data.metrics[0].value, '¥100.00'); assert.equal(h.page.data.items.length, 0); assert.ok(h.page.data.leaderboardError); await h.time.advance(30000); assert.equal(h.count('sales'), 2); assert.equal(h.count('leaderboard'), 2); h.page.onUnload();
});
