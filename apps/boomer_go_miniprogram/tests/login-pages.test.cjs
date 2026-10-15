const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../miniprogram/pages/login');
const context = { userId: 'employee', shop: { id: 'shop', name: '授权门店' } };
const ev = value => ({ detail: { value } });
const mode = value => ({ currentTarget: { dataset: { mode: value } } });
const gate = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function harness(options = {}) {
  const calls = [], routes = [], modals = [], timers = new Map(); let timerId = 0;
  const env = { revision: 1, current: null, credentials: !!options.credentials, previewCalls: 0 };
  const session = options.session || {
    get: () => env.current, revision: () => env.revision, hasCredentials: () => env.credentials,
    signInWithCode(phone, code) { calls.push(['otp', phone, code]); env.revision++; return (options.otp || (() => { env.current = context; env.credentials = true; return Promise.resolve(context); }))(); },
    signInWithPassword(account, password) { calls.push(['password', account, password]); env.revision++; return (options.password || (() => { env.current = context; env.credentials = true; return Promise.resolve(context); }))(); },
    restore() { calls.push(['restore']); return (options.restore || (() => { env.current = context; return Promise.resolve(context); }))(); },
    sendCode(phone) { calls.push(['send', phone]); return (options.send || (() => Promise.resolve(60)))(); }
  };
  const app = { preview: !!options.preview, session, api: {}, ensureSession: async () => true, enablePreview() { env.previewCalls++; app.preview = true; return options.enablePreview !== false; } };
  const wx = { getAccountInfoSync: () => ({ miniProgram: { envVersion: options.production ? 'release' : 'develop' } }), reLaunch(o) { routes.push(o.url); }, showModal(o) { modals.push(o); } };
  let spec;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'index.js'), 'utf8'), { wx, getApp: () => app, Page(p) { spec = p; }, require(id) {
    assert.equal(id, '../../shared/page'); const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.resolve(root, '../../shared/page.js'), 'utf8'), { module: m, wx, getApp: () => app }); return m.exports;
  }, setInterval(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearInterval(id) { timers.delete(id); }, Date });
  const page = { ...spec, data: structuredClone(spec.data), setData(p) { Object.assign(this.data, p); } };
  page.onLoad({}); page.onShow();
  return { page, session, env, app, calls, routes, modals, timers, password() { assert.equal(typeof page.switchMode, 'function'); page.switchMode(mode('password')); }, input(account = ' Existing_User ', password = ' Pass Word ') { page.accountInput(ev(account)); page.passwordInput(ev(password)); } };
}

test('OTP remains default and preserves the existing native login header/card', async () => {
  const h = harness(); assert.equal(h.page.data.mode, 'otp');
  h.page.phoneInput(ev('13800138000')); h.page.codeInput(ev('123456')); await h.page.submit();
  assert.deepEqual(h.calls, [['otp', '13800138000', '123456']]); assert.deepEqual(h.routes, ['/pages/workbench/index']);
  const xml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8'); assert.match(xml, /src="\/assets\/wordmark.png"/); assert.match(xml, /让门店工作<br\/>更轻松一点。/); assert.match(xml, /公司与加盟门店的员工工作台/);
});

test('password mode sends raw account and unmodified password only to the frozen session method', async () => {
  const h = harness(); h.password(); h.input(); await h.page.submit();
  assert.deepEqual(h.calls, [['password', ' Existing_User ', ' Pass Word ']]); assert.deepEqual(h.routes, ['/pages/workbench/index']);
  assert.equal(h.page.data.password, ''); assert.equal(h.page.data.code, '');
});

test('page accepts phone username/email accounts but does not compute an email suffix', async () => {
  for (const account of ['13800138000', 'Existing_User', 'Staff@Example.test']) {
    const h = harness(); h.password(); h.input(account, 'Secret 1'); await h.page.submit(); assert.deepEqual(h.calls, [['password', account, 'Secret 1']]);
  }
});

test('invalid native password or OTP forms do not invoke session authentication', async () => {
  for (const [account, password] of [['', 'Secret1'], ['ab', 'Secret1'], ['bad account', 'Secret1'], ['bad@', 'Secret1'], ['x'.repeat(256), 'Secret1'], ['staff', 'short'], ['staff', 'x'.repeat(73)]]) {
    const h = harness(); h.password(); h.input(account, password); await h.page.submit(); assert.equal(h.calls.length, 0); assert.ok(h.page.data.error);
  }
  const h = harness(); await h.page.submit(); await h.page.send(); assert.equal(h.calls.length, 0);
});

test('null or undefined results from OTP/password/restore never navigate despite stored credentials', async () => {
  for (const action of ['otp', 'password', 'restore']) for (const result of [null, undefined]) {
    const h = harness({ credentials: true, [action]: () => Promise.resolve(result) });
    if (action === 'password') { h.password(); h.input(); } else { h.page.phoneInput(ev('13800138000')); h.page.codeInput(ev('123456')); }
    await (action === 'restore' ? h.page.restore() : h.page.submit());
    assert.deepEqual(h.routes, []); assert.ok(h.page.data.error); assert.equal(h.page.data.retryRestore, true);
  }
});

test('duplicate submission blocks mode switching, preview, SMS, restore and secret edits until completion', async () => {
  const wait = gate(); const h = harness({ password: () => wait.promise }); h.password(); h.input(); const pending = h.page.submit();
  await h.page.submit(); h.page.switchMode(mode('otp')); h.page.enterPreview(); await h.page.send(); await h.page.restore(); h.page.accountInput(ev('other')); h.page.passwordInput(ev('changed'));
  assert.equal(h.page.data.mode, 'password'); assert.equal(h.env.previewCalls, 0); assert.equal(h.calls.length, 1); assert.equal(h.page.data.account, ' Existing_User ');
  wait.resolve(context); await pending; assert.equal(h.routes.length, 1); assert.equal(h.page.data.submitting, false);
});

test('mode switch clears password and code without erasing phone/account or sending requests', () => {
  const h = harness(); h.page.phoneInput(ev('13800138000')); h.page.codeInput(ev('123456')); h.password();
  assert.equal(h.page.data.code, ''); h.input(); h.page.switchMode(mode('otp')); assert.equal(h.page.data.password, ''); assert.equal(h.page.data.phone, '13800138000'); assert.equal(h.page.data.account, ' Existing_User '); assert.equal(h.calls.length, 0);
  h.page.switchMode(mode('bogus')); assert.equal(h.page.data.mode, 'otp');
});

test('hide and unload clear password/OTP and stop the countdown without extra requests', async () => {
  for (const boundary of ['hide', 'unload']) {
    const h = harness(); h.page.phoneInput(ev('13800138000')); await h.page.send(); assert.equal(h.timers.size, 1);
    h.page.codeInput(ev('123456')); h.password(); h.input(); h.page[boundary === 'hide' ? 'onHide' : 'onUnload']();
    assert.equal(h.page.data.password, ''); assert.equal(h.page.data.code, ''); assert.equal(h.timers.size, 0); assert.equal(h.calls.length, 1);
  }
});

test('late login or restore success after hide/show, unload or identity revision changes cannot navigate', async () => {
  for (const action of ['otp', 'password', 'restore']) for (const boundary of ['hide', 'show', 'unload', 'revision', 'session']) {
    const wait = gate(); const h = harness({ [action]: () => wait.promise, credentials: true });
    if (action === 'password') { h.password(); h.input(); } else { h.page.phoneInput(ev('13800138000')); h.page.codeInput(ev('123456')); }
    const pending = action === 'restore' ? h.page.restore() : h.page.submit();
    if (boundary === 'hide' || boundary === 'show') h.page.onHide(); if (boundary === 'show') h.page.onShow();
    if (boundary === 'unload') h.page.onUnload(); if (boundary === 'revision') h.env.revision++;
    if (boundary === 'session') h.app.session = { ...h.session }; if (boundary === 'session') h.page.onShow();
    wait.resolve(context); await pending; assert.equal(h.routes.length, 0, action + '/' + boundary);
  }
});

test('late rejected authentication cannot show an old error or repopulate secrets on a newer page epoch', async () => {
  const wait = gate(); const h = harness({ password: () => wait.promise }); h.password(); h.input(); const pending = h.page.submit(); h.page.onHide(); h.page.onShow();
  wait.reject(Object.assign(Error('OLD_PRIVATE_ERROR'), { status: 401 })); await pending;
  assert.doesNotMatch(h.page.data.error, /OLD_PRIVATE/); assert.equal(h.page.data.password, ''); assert.equal(h.routes.length, 0);
});

test('accepted auth with scope failure offers restore without resending password or OTP', async () => {
  const h = harness({ password: () => { h.env.credentials = true; return Promise.reject(Object.assign(Error('权限暂未同步'), { retryRestore: true })); } });
  h.password(); h.input(); await h.page.submit(); assert.equal(h.page.data.retryRestore, true); assert.equal(h.page.data.password, ''); assert.equal(h.routes.length, 0);
  await h.page.restore(); assert.deepEqual(h.calls.map(c => c[0]), ['password', 'restore']); assert.deepEqual(h.routes, ['/pages/workbench/index']);
});

test('SMS remains singleflight, blocks password/preview changes and resumes its acknowledged cooldown after hide', async () => {
  const wait = gate(); const h = harness({ send: () => wait.promise }); h.page.phoneInput(ev('13800138000')); const sending = h.page.send();
  await h.page.send(); h.page.switchMode(mode('password')); h.page.enterPreview(); await h.page.submit(); assert.equal(h.page.data.mode, 'otp'); assert.equal(h.env.previewCalls, 0); assert.equal(h.calls.length, 1);
  h.page.onHide(); wait.resolve(60); await sending; assert.equal(h.timers.size, 0); h.page.onShow(); assert.ok(h.page.data.seconds > 0); assert.equal(h.timers.size, 1);
  await h.page.send(); assert.equal(h.calls.length, 1); h.page.onUnload();
});

test('native forgot-password explanation has no reset endpoint, URL navigation or credentials', () => {
  const h = harness(); h.password(); h.page.forgotPassword(); assert.equal(h.modals.length, 1); assert.match(h.modals[0].content, /门店管理员/); assert.match(h.modals[0].content, /不.*(?:短信|邮件)|无法.*(?:短信|邮件)/); assert.equal(h.calls.length, 0); assert.equal(h.routes.length, 0);
});

test('explicit preview never authenticates; release builds cannot open the preview entry', async () => {
  const h = harness({ preview: true }); h.password(); h.input(); await h.page.submit(); await h.page.send(); await h.page.restore(); assert.equal(h.calls.length, 0);
  const production = harness({ production: true }); production.page.enterPreview(); assert.equal(production.env.previewCalls, 0); assert.equal(production.routes.length, 0);
  const development = harness(); development.page.enterPreview(); assert.equal(development.env.previewCalls, 1); assert.deepEqual(development.routes, ['/pages/workbench/index']);
});

test('native markup has masked password, two disabled-aware 44px mode buttons and no registration/H5/storage', () => {
  const xml = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8'), css = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8'), js = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  assert.equal((xml.match(/bindtap="switchMode"/g) || []).length, 2); assert.match(xml, /password="\{\{true\}\}"/); assert.match(xml, /bindinput="accountInput"/); assert.match(xml, /bindinput="passwordInput"/); assert.match(xml, /bindtap="forgotPassword"/); assert.match(css, /\.mode-button[^}]*min-height:\s*88rpx/);
  assert.doesNotMatch(xml, /<web-view|&amp;&amp;|注册账号/); assert.doesNotMatch(js, /setStorage|writeFile|api\.action|phone-password-login|boomeroff\.local|navigateTo\(|console\./);
});

test('unconfirmed SMS responses and old-identity callbacks never claim delivery or start a countdown', async () => {
  for (const result of [null, 0, NaN]) {
    const h = harness({ send: () => Promise.resolve(result) }); h.page.phoneInput(ev('13800138000')); await h.page.send();
    assert.equal(h.page.data.message, ''); assert.ok(h.page.data.error); assert.equal(h.timers.size, 0);
  }
  const wait = gate(); const h = harness({ send: () => wait.promise }); h.page.phoneInput(ev('13800138000')); const sending = h.page.send(); h.env.revision++;
  wait.resolve(60); await sending; assert.equal(h.page.data.seconds, 0); assert.equal(h.page.data.message, ''); assert.equal(h.timers.size, 0);
});

test('cooldown uses the original deadline across mode changes and expires without an extra SMS', async () => {
  const h = harness(); h.page.phoneInput(ev('13800138000')); await h.page.send(); const deadline = h.page._until;
  h.password(); assert.equal(h.timers.size, 0); h.page.switchMode(mode('otp')); assert.equal(h.page._until, deadline); assert.equal(h.timers.size, 1);
  const now = Date.now;
  try { Date.now = () => deadline + 1; for (const update of Array.from(h.timers.values())) update(); assert.equal(h.page.data.seconds, 0); assert.equal(h.timers.size, 0); assert.equal(h.calls.length, 1); }
  finally { Date.now = now; h.page.onUnload(); }
});

test('real shared password session and page agree on synchronous revision changes and verified navigation', async () => {
  const { createSession, businessDate } = require('../miniprogram/shared/session');
  const userId = '00000000-0000-4000-8000-000000000011', shopId = '00000000-0000-4000-8000-000000000012';
  for (const account of ['13800138000', ' Existing_User ', 'Staff@Example.test']) {
    const requests = [], saved = new Map();
    const session = createSession({ wx: { getStorageSync: k => saved.get(k), setStorageSync: (k, v) => saved.set(k, v), removeStorageSync: k => saved.delete(k) }, request: async (name) => {
      requests.push(name);
      if (name === 'phone-password-login' || name === 'auth:password') return { ok: true, access_token: 'e30.' + Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.synthetic', refresh_token: 'synthetic-refresh' };
      if (name === 'auth:user') return { id: userId };
      if (name === 'erp-scope-sync') return { ok: true, data: { authenticated: true, user_id: userId }, sync: { status: 'synced', lease_renewed: true, scope_version: 3 }, bootstrap: { profile: { display_name: '合成员工' }, shop_context: { date: businessDate(), scope: 'store', effective_shop: { id: shopId, name: '合成门店' }, authorized_shops: [{ id: shopId, name: '合成门店' }] } } };
      throw Error('unexpected synthetic request');
    } });
    const h = harness({ session }); h.password(); h.input(account, ' Synthetic Password '); await h.page.submit();
    assert.deepEqual(requests, [account === '13800138000' ? 'phone-password-login' : 'auth:password', 'auth:user', 'erp-scope-sync']);
    assert.deepEqual(h.routes, ['/pages/workbench/index']); assert.equal(h.page.data.password, ''); assert.equal(session.get().shop.id, shopId);
  }
});
