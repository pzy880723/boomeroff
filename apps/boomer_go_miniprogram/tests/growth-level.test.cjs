const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createApi } = require('../miniprogram/shared/api');

const root = path.resolve(__dirname, '../miniprogram');
const LEVELS = [
  [0, '中古萌新'], [15, '入坑学徒'], [40, '寻宝玩家'], [80, '古物侦探'], [140, '鉴货掌柜'],
  [220, '行家里手'], [320, '时代收藏家'], [450, '中古名士'], [600, '古董宗师'], [780, '一代藏圣'],
  [1000, '鉴宝行家'], [1260, '古玩通'], [1560, '时光匠人'], [1900, '藏界翘楚'], [2280, '古今见证者'],
  [2700, '万物鉴长'], [3160, '古韵宗师'], [3660, '典藏大家'], [4200, '传世名匠'], [4800, '古道掌门'],
  [5440, '鉴古真人'], [6120, '千秋藏圣'], [6840, '古界帝王'], [7600, '万古传奇'], [8400, '中古之神']
];
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const profile = exp => ({ profile: { display_name: '合成员工' }, experience: { total_exp: exp }, role: 'employee' });

function harness(options = {}) {
  let spec;
  const env = { user: { userId: 'employee-a', shop: { id: 'shop-a', name: '门店 A' }, shops: [{ id: 'shop-a', name: '门店 A' }, { id: 'shop-b', name: '门店 B' }], isHeadquarters: !!options.hq, profile: { display_name: '合成员工' }, scopeVersion: 1 }, revision: 1, signouts: 0 };
  const calls = [], renders = [], navigation = [], modals = [], selected = [];
  const session = { get: () => env.user, revision: () => env.revision, ensureFresh: async () => {},
    signOut() { env.signouts++; env.revision++; env.user = null; },
    selectShop(id) { selected.push(id); env.user = { ...env.user, shop: env.user.shops.find(row => row.id === id) }; env.revision++; }
  };
  const wx = { showModal(p) { modals.push(p); }, reLaunch: p => navigation.push(p.url), navigateTo: p => navigation.push(p.url), switchTab: p => navigation.push(p.url), stopPullDownRefresh() {} };
  const api = createApi({ wx, config: {}, session, invoke: async (name, body) => {
    assert.equal(name, 'go-mini-api'); assert.equal(body.action, 'profile', 'only the existing profile read is allowed'); calls.push(body);
    return { data: options.read ? await options.read() : profile(Object.hasOwn(options, 'exp') ? options.exp : 15) };
  } });
  const app = { session, api, preview: !!options.preview, ensureSession: async () => !!env.user };
  const shell = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/page.js'), 'utf8'), { module: shell, wx, getApp: () => app });
  const file = path.join(root, 'pages/mine/index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page(p) { spec = p; }, wx, getApp: () => app,
    require(id) { return id === '../../shared/page' ? shell.exports : require(path.resolve(path.dirname(file), id)); } }, { filename: file });
  const page = { ...spec, data: structuredClone(spec.data), setData(p) { assert.notEqual(this._gone, true, 'no render after unload'); renders.push(p); Object.assign(this.data, p); } };
  return { page, env, calls, renders, navigation, modals, selected, load: () => page.onLoad({}), change(kind = 'user') {
    env.revision++; if (kind === 'user') env.user = { ...env.user, userId: 'employee-b' };
    if (kind === 'shop') env.user = { ...env.user, shop: env.user.shops[1] };
  } };
}

test('initial onLoad and immediate same-scope onShow share the pending profile read', async () => {
  const held = [], h = harness({ read: () => { const gate = deferred(); held.push(gate); return gate.promise; } });
  const load = h.load(), show = h.page.onShow(); await tick();
  const count = h.calls.length; held.forEach(gate => gate.resolve(profile(40)));
  await load; await show;
  assert.equal(count, 1); assert.equal(h.page.data.growth.level, 3);
});

test('initial profile success is not discarded for an unnecessary failing duplicate', async () => {
  const held = [], h = harness({ read: () => { const gate = deferred(); held.push(gate); return gate.promise; } });
  const load = h.load(), show = h.page.onShow(); await tick();
  held[0].resolve(profile(220)); await tick();
  if (held[1]) held[1].reject(Error('unnecessary duplicate failed'));
  await load; await show;
  assert.equal(h.page.data.growth && h.page.data.growth.level, 6);
  assert.equal(h.page.data.error, ''); assert.equal(h.calls.length, 1);
});

test('first same-scope onShow after a completed onLoad does not reread or erase growth', async () => {
  let reads = 0; const h = harness({ read: () => { if (++reads > 1) throw Error('unnecessary duplicate'); return profile(1000); } });
  await h.load(); await h.page.onShow();
  assert.equal(h.calls.length, 1); assert.equal(h.page.data.growth.level, 11); assert.equal(h.page.data.error, '');
});

for (const [index, [threshold, title]] of LEVELS.entries()) test('growth threshold ' + threshold + ' preserves Web level ' + (index + 1) + ' and title', async () => {
  let exp = threshold;
  const h = harness({ read: () => profile(exp) }); await h.load();
  assert.equal(h.page.data.growth && h.page.data.growth.available, true);
  assert.equal(h.page.data.growth.level, index + 1); assert.equal(h.page.data.growth.title, title);
  assert.equal(h.page.data.growth.totalExp, threshold); assert.equal(h.page.data.growth.progress, index === 24 ? 1 : 0);
  assert.equal(h.page.data.growth.nextGap, index === 24 ? 0 : LEVELS[index + 1][0] - threshold);
  if (index) { exp = threshold - 1; await h.page.load(); assert.equal(h.page.data.growth.level, index); assert.equal(h.page.data.growth.nextGap, 1); }
});

test('growth uses exact interval progress, valid zero and max without an invented next level', async () => {
  let exp = 0; const h = harness({ read: () => profile(exp) }); await h.load();
  assert.equal(h.page.data.growth.available, true); assert.equal(h.page.data.growth.level, 1);
  exp = 14; await h.page.load(); assert.equal(h.page.data.growth.progress, 14 / 15); assert.equal(h.page.data.growth.nextGap, 1);
  exp = 8412; await h.page.load(); assert.equal(h.page.data.growth.level, 25); assert.equal(h.page.data.growth.isMax, true); assert.equal(h.page.data.growth.progress, 1); assert.equal(h.page.data.growth.nextGap, 0); assert.equal(h.page.data.growth.totalExp, 8412);
});

for (const [name, exp] of [['missing', undefined], ['null', null], ['string', '15'], ['NaN', NaN], ['Infinity', Infinity], ['negative Infinity', -Infinity], ['boolean', true], ['object', {}], ['array', []]]) {
  test('growth ' + name + ' is unavailable, not fabricated zero EXP or level one', async () => {
    const h = harness({ exp }); await h.load(); assert.equal(h.page.data.growth && h.page.data.growth.available, false);
    assert.equal(h.page.data.growth.level, undefined); assert.equal(h.page.data.profile.experience, '暂无数据');
    assert.match(h.page.data.growth.notice, /未.*同步|暂不可|未.*提供/);
  });
}

test('negative server EXP remains visible as a balance but never silently becomes zero-level progress', async () => {
  const h = harness({ exp: -5 }); await h.load(); assert.equal(h.page.data.profile.experience, '-5');
  assert.equal(h.page.data.growth && h.page.data.growth.available, false); assert.match(h.page.data.growth.notice, /负|异常/); assert.equal(h.page.data.growth.level, undefined);
});

test('rules expand to the exact 25 thresholds and titles, then collapse without extra API calls', async () => {
  const h = harness(); await h.load(); assert.equal(h.page.data.growthRulesOpen, false); h.page.toggleGrowthRules();
  assert.equal(h.page.data.growthRulesOpen, true);
  assert.deepEqual(Array.from(h.page.data.growthRules, row => [row.threshold, row.title]), LEVELS);
  h.page.toggleGrowthRules(); assert.equal(h.page.data.growthRulesOpen, false); assert.equal(h.calls.length, 1);
});

for (const lifecycle of ['hide', 'unload']) test(lifecycle + ' clears private growth and a late profile cannot restore it', async () => {
  const gate = deferred(); let pending = false;
  const h = harness({ read: () => pending ? gate.promise : profile(1000) }); await h.load();
  assert.equal(h.page.data.growth && h.page.data.growth.level, 11); h.page.toggleGrowthRules(); pending = true; const read = h.page.load();
  h.page[lifecycle === 'hide' ? 'onHide' : 'onUnload'](); const count = h.renders.length;
  assert.equal(h.page.data.growth, null); assert.equal(h.page.data.profile, null); assert.equal(h.page.data.growthRulesOpen, false);
  gate.resolve(profile(8400)); await read; assert.equal(h.renders.length, count); assert.equal(h.page.data.growth, null);
});

for (const kind of ['user', 'shop', 'revision']) test(kind + ' change clears growth before new read and old finally cannot unlock it', async () => {
  const old = deferred(), fresh = deferred(); let reads = 0;
  const h = harness({ read: () => ++reads === 1 ? profile(15) : reads === 2 ? old.promise : fresh.promise });
  await h.load(); const pending = h.page.load(); await tick(); h.change(kind); const shown = h.page.onShow(); await tick();
  assert.equal(h.page.data.growth, null); assert.equal(h.page.data.growthRulesOpen, false);
  old.resolve(profile(8400)); await pending; assert.equal(h.page.data.growth, null); assert.equal(h.page.data.loading, true);
  fresh.resolve(profile(40)); await shown; assert.equal(h.page.data.growth.level, 3); assert.equal(h.page.data.loading, false);
});

test('return while an old read is pending restores only fresh growth and rules stay collapsed', async () => {
  const gate = deferred(); let reads = 0; const h = harness({ read: () => ++reads === 1 ? gate.promise : profile(80) });
  const first = h.load(); await tick(); h.page.onHide(); await h.page.onShow(); assert.equal(h.page.data.growth.level, 4);
  gate.resolve(profile(8400)); await first; assert.equal(h.page.data.growth.level, 4); assert.equal(h.page.data.growthRulesOpen, false);
});

test('refresh failure clears growth rather than retaining an apparently current level', async () => {
  let fail = false; const h = harness({ read: () => { if (fail) throw Error('offline'); return profile(140); } });
  await h.load(); fail = true; await h.page.load(); assert.equal(h.page.data.growth, null); assert.equal(h.page.data.profile, null); assert.match(h.page.data.error, /offline/);
});

test('hidden or stale rules and HQ picker callbacks neither expose growth nor change a shop', async () => {
  for (const state of ['hide', 'revision']) {
    const h = harness({ hq: true }); await h.load(); if (state === 'hide') h.page.onHide(); else h.change('revision');
    h.page.toggleGrowthRules(); await h.page.onShopChange({ detail: { value: '1' } });
    assert.equal(h.page.data.growthRulesOpen, false); assert.equal(h.selected.length, 0); assert.equal(h.page.data.growth, null);
  }
});

test('existing HQ switch and Mine menu routes remain available without business writes', async () => {
  const h = harness({ hq: true }); await h.load(); await h.page.onShopChange({ detail: { value: '1' } });
  assert.deepEqual(h.selected, ['shop-b']); assert.equal(h.page.data.profile.shop, '门店 B'); assert.equal(h.page.data.growth.level, 2);
  const urls = h.page.data.groups.flatMap(group => group.entries.map(entry => entry.url));
  for (const url of ['/pages/schedule/index', '/pages/list/index?kind=check-ins', '/pages/list/index?kind=my-library', '/pages/list/index?kind=quiz-history', '/pages/detail/index?kind=profile']) assert.ok(urls.includes(url));
  h.page.go({ currentTarget: { dataset: { url: '/pages/list/index?kind=my-library' } } }); assert.equal(h.navigation[0], '/pages/list/index?kind=my-library');
});

for (const state of ['hide', 'revision']) test('logout modal after ' + state + ' cannot clear another visible context', async () => {
  const h = harness(); await h.load(); h.page.logout(); assert.equal(h.modals.length, 1);
  if (state === 'hide') { h.page.onHide(); await h.page.onShow(); } else h.change('revision');
  h.modals[0].success({ confirm: true }); assert.equal(h.env.signouts, 0); assert.equal(h.navigation.length, 0);
});

test('current logout clears growth, rules and the private stack with the existing login route', async () => {
  const h = harness(); await h.load(); h.page.toggleGrowthRules(); h.page.logout(); h.modals[0].success({ confirm: true });
  assert.equal(h.env.signouts, 1); assert.equal(h.page.data.growth, null); assert.equal(h.page.data.growthRulesOpen, false); assert.equal(h.page.data.profile, null); assert.deepEqual(h.navigation, ['/pages/login/index']);
});

test('current profile 401 uses shared auth cleanup, while stale 401 cannot log out a newer revision', async () => {
  for (const stale of [false, true]) {
    const gate = deferred(), h = harness({ read: () => gate.promise }); const read = h.load(); await tick(); if (stale) h.change('revision');
    gate.reject(Object.assign(Error('expired'), { status: 401 })); await read; assert.equal(h.env.signouts, stale ? 0 : 1); assert.equal(h.page.data.growth, null);
  }
});

test('preview still uses only the supplied profile read and labels growth synthetic', async () => {
  const h = harness({ preview: true, exp: 40 }); await h.load(); assert.equal(h.page.data.preview, true); assert.equal(h.page.data.growth.level, 3); assert.equal(h.calls.length, 1);
  const xml = fs.readFileSync(path.join(root, 'pages/mine/index.wxml'), 'utf8');
  assert.match(xml, /growth\.available/); assert.match(xml, /growthRulesOpen/); assert.match(xml, /bindtap="toggleGrowthRules"/); assert.match(xml, /合成.*成长|成长.*合成/);
  assert.doesNotMatch(xml, /10\s*级体系|销售考核|经验获取方式|\+15/);
});
