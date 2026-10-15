const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSession, businessDate } = require('../miniprogram/shared/session');
const { createApi } = require('../miniprogram/shared/api');
const { definePage } = require('../miniprogram/shared/page');

const KEY = 'boomer-go-mini.session.v1';
const USERS = { A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
const PHONES = { A: '13800138000', B: '13900138000' };
const SHOPS = [{ id: '11111111-1111-4111-8111-111111111111', name: 'S1' }, { id: '22222222-2222-4222-8222-222222222222', name: 'S2' }];

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function observe(promise) {
  const result = { status: 'pending' };
  result.done = Promise.resolve(promise).then(
    value => { result.status = 'fulfilled'; result.value = value; },
    error => { result.status = 'rejected'; result.error = error; }
  );
  return result;
}

const turn = () => new Promise(resolve => setImmediate(resolve));
async function reached(signal, operation) {
  await Promise.race([signal.promise, operation.done.then(() => {
    if (operation.status === 'rejected') throw operation.error;
    assert.fail('operation completed before reaching the controlled async boundary');
  })]);
}

function rejected(result, message) {
  assert.equal(result.status, 'rejected', message);
  assert.ok(result.error instanceof Error);
}

function credentials(userId) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  return { access_token: 'e30.' + payload + '.test', refresh_token: 'refresh-' + userId, user: { id: userId } };
}

function otp(userId) {
  const session = credentials(userId);
  return { ok: true, access_token: session.access_token, refresh_token: session.refresh_token, session };
}

function scope(userId) {
  return {
    ok: true, data: { authenticated: true, user_id: userId },
    sync: { status: 'synced', lease_renewed: true, scope_version: 3 },
    bootstrap: { profile: { display_name: userId }, permissions: [], shop_context: {
      date: businessDate(), scope: 'hq', status: 'hq', effective_shop: null, authorized_shops: SHOPS
    } }
  };
}

function fixture({ storedUser, handlers = {}, wx: overrides = {} } = {}) {
  const storage = new Map(storedUser ? [[KEY, credentials(USERS[storedUser])]] : []);
  const calls = [];
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    ...overrides
  };
  const session = createSession({ wx, request: async (name, body) => {
    const token = session.token();
    const userId = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub : null;
    const call = { name, body, userId };
    calls.push(call);
    if (handlers[name]) return handlers[name](call);
    if (name === 'phone-login-verify-otp') {
      const user = Object.keys(PHONES).find(key => PHONES[key] === body.phone);
      assert.ok(user, 'unexpected test phone');
      return otp(USERS[user]);
    }
    if (name === 'erp-scope-sync') return scope(userId);
    throw new Error('Unexpected local request: ' + name);
  } });
  return { session, wx, storage, calls };
}

async function login(f, user = 'A', shop = SHOPS[0]) {
  await f.session.signInWithCode(PHONES[user], '123456');
  assert.equal(f.session.get().userId, USERS[user]);
  if (shop) f.session.selectShop(shop.id);
}

function apiFor(f, invoke, wx = {}) {
  return createApi({ wx: { ...f.wx, ...wx }, config: { erpUrl: 'https://erp.invalid' }, session: f.session, invoke });
}

function photos(compressImage = request => request.success({ tempFilePath: request.src })) {
  return { compressImage, getFileSystemManager: () => ({ readFile: request => request.success({ data: '/9j/AAAA' }) }) };
}

test('revision is numeric and changes at login start, shop selection and logout', async () => {
  const gate = deferred(), started = deferred();
  const f = fixture({ handlers: { 'phone-login-verify-otp': () => { started.resolve(); return gate.promise; } } });
  assert.equal(typeof f.session.revision, 'function', 'session must expose revision()');
  const before = f.session.revision();
  assert.equal(typeof before, 'number');
  assert.ok(Number.isFinite(before));
  const signingIn = observe(f.session.signInWithCode(PHONES.A, '123456'));
  try {
    await reached(started, signingIn);
    assert.equal(typeof f.session.revision(), 'number');
    assert.notEqual(f.session.revision(), before, 'login start must invalidate older operations before OTP returns');
  } finally {
    gate.resolve(otp(USERS.A));
    await signingIn.done;
  }
  assert.equal(signingIn.status, 'fulfilled');
  const loggedIn = f.session.revision();
  f.session.selectShop(SHOPS[0].id);
  const selected = f.session.revision();
  assert.notEqual(selected, loggedIn);
  assert.equal(typeof selected, 'number');
  f.session.signOut();
  assert.equal(typeof f.session.revision(), 'number');
  assert.notEqual(f.session.revision(), selected);
});

test('B OTP supersedes a pending A restore and a late A restore cannot overwrite B', async () => {
  const gate = deferred(), started = deferred();
  const f = fixture({ storedUser: 'A', handlers: { 'erp-scope-sync': call => {
    if (call.userId === USERS.A) { started.resolve(); return gate.promise; }
    return scope(call.userId);
  } } });
  const restoring = observe(f.session.restore());
  await reached(started, restoring);
  const signingIn = observe(f.session.signInWithCode(PHONES.B, '654321'));
  try {
    await turn();
    assert.ok(f.calls.some(call => call.name === 'phone-login-verify-otp' && call.body.phone === PHONES.B), 'B OTP must be dispatched while A restore is still blocked');
    assert.equal(signingIn.status, 'fulfilled', 'B must not wait for the superseded A restore');
    assert.equal(f.session.get().userId, USERS.B);
    gate.resolve(scope(USERS.A));
    await restoring.done;
    assert.equal(f.session.get().userId, USERS.B, 'late A restore must not clear or replace B');
    assert.equal(f.storage.get(KEY).user.id, USERS.B);
  } finally {
    gate.resolve(scope(USERS.A));
    await Promise.all([restoring.done, signingIn.done]);
  }
});

test('a different explicit login rejects while the first OTP login is busy', async () => {
  const gate = deferred(), started = deferred();
  const f = fixture({ handlers: { 'phone-login-verify-otp': () => { started.resolve(); return gate.promise; } } });
  const first = observe(f.session.signInWithCode(PHONES.A, '123456'));
  await reached(started, first);
  const second = observe(Promise.resolve().then(() => f.session.signInWithCode(PHONES.B, '654321')));
  try {
    await turn();
    rejected(second, 'different explicit logins must not share the first login promise');
    assert.equal(f.calls.filter(call => call.name === 'phone-login-verify-otp').length, 1);
  } finally {
    gate.resolve(otp(USERS.A));
    await Promise.all([first.done, second.done]);
  }
});

for (const action of ['learning', 'objectives', 'marketing-assets', 'marketing-detail']) {
  test(action + ' requires a selected shop and sends nothing without one', async () => {
    const f = fixture();
    await login(f, 'A', null);
    assert.equal(f.session.get().shop, null);
    const sent = [];
    const api = apiFor(f, async (name, body) => { sent.push({ name, body }); return { ok: true, data: { items: [] } }; }, photos());
    const result = observe(api.action(action, { id: 'asset', result: { name: 'cup' }, photos: ['wxfile://photo'] }));
    await result.done;
    assert.equal(sent.length, 0, 'missing shop must fail before transport');
    rejected(result, action + ' must not silently become an unfiltered request');
  });
}

test('recognition-save without a shop sends only personal photos under the current employee identity', async () => {
  const f = fixture();
  await login(f, 'A', null);
  assert.equal(f.session.get().shop, null);
  const sent = [];
  const saved = { item: { id: 'personal-scan', created_by: USERS.A } };
  const api = apiFor(f, async (name, body) => {
    sent.push({ name, body, token: f.session.token() });
    return { ok: true, data: saved };
  }, photos());
  const result = { name: 'personal cup' };
  assert.deepEqual(await api.action('recognition-save', {
    result, photos: ['wxfile://personal-photo'], shop_id: SHOPS[1].id,
    created_by: USERS.B, user_id: USERS.B, storage_path: USERS.B + '/forged.jpg'
  }), saved);
  assert.equal(sent.length, 1);
  const request = sent[0];
  assert.equal(request.name, 'go-mini-api');
  assert.equal(request.body.action, 'recognition-save');
  assert.equal(JSON.parse(Buffer.from(request.token.split('.')[1], 'base64url').toString()).sub, USERS.A);
  const payload = request.body.params;
  assert.deepEqual(Object.keys(payload).sort(), ['image_data_urls', 'request_id', 'result']);
  assert.deepEqual(payload.result, result);
  assert.deepEqual(payload.image_data_urls, ['data:image/jpeg;base64,/9j/AAAA']);
  assert.match(payload.request_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

for (const action of ['profile', 'my-library']) {
  test(action + ' remains available as an own-user global read without a shop', async () => {
    const f = fixture();
    await login(f, 'A', null);
    const sent = [];
    const data = action === 'profile' ? { profile: { display_name: 'A' } } : { items: [] };
    const api = apiFor(f, async (name, body) => { sent.push({ name, body }); return { ok: true, data }; });
    assert.deepEqual(await api.action(action), data);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.params.shop_id, undefined);
  });
}

test('a profile response dispatched as A rejects after B logs in', async () => {
  const f = fixture();
  await login(f);
  const gate = deferred(), sent = deferred();
  const api = apiFor(f, async () => { sent.resolve(); return gate.promise; });
  const reading = observe(api.action('profile'));
  await reached(sent, reading);
  f.session.signOut();
  await login(f, 'B');
  gate.resolve({ ok: true, data: { profile: { display_name: 'private A' } } });
  await reading.done;
  rejected(reading, 'A data must not resolve into B session');
  assert.equal(f.session.get().userId, USERS.B);
});

function salesReply() {
  const completeness = { complete: true, kind: 'net', source_fresh: true };
  return { date: businessDate(), scope: { location_ids: ['erp-s1'] },
    stores: [{ location_id: 'erp-s1', status: 'ok', completeness }],
    totals: { actual_fen: 777700, order_count: 7 }, completeness };
}

for (const changeShop of [false, true]) {
  test(changeShop ? 'S1 sales response rejects after selecting S2' : 'S1 sales response succeeds while identity and selected shop are unchanged', async () => {
    const f = fixture();
    await login(f);
    const gate = deferred(), sent = deferred();
    const api = apiFor(f, () => assert.fail('ERP sales must not use GO action transport'), { request(request) {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/session')) {
        request.success({ statusCode: 200, data: { ok: true, data: {
          shops: [{ go_shop_id: SHOPS[0].id, erp_location_id: 'erp-s1' }], visible_locations: [{ id: 'erp-s1' }]
        } } });
      } else {
        assert.equal(url.pathname, '/api/public/go/daily-summary');
        assert.equal(url.searchParams.get('location_id'), 'erp-s1');
        sent.resolve();
        gate.promise.then(data => request.success({ statusCode: 200, data: { ok: true, data } }));
      }
    } });
    const reading = observe(api.sales());
    await reached(sent, reading);
    if (changeShop) f.session.selectShop(SHOPS[1].id);
    gate.resolve(salesReply());
    await reading.done;
    if (changeShop) rejected(reading, 'an internally valid S1 response is stale after switching to S2');
    else {
      assert.equal(reading.status, 'fulfilled');
      assert.equal(reading.value.revenue, 7777);
      assert.equal(reading.value.sales_assessment, false);
    }
  });
}

test('same-user logout and re-login invalidates an old photo save before transport', async () => {
  const f = fixture();
  await login(f);
  const gate = deferred(), started = deferred(), sent = [];
  const api = apiFor(f, async (name, body) => { sent.push({ name, body }); return { ok: true, data: { item: { id: 'saved' } } }; }, photos(request => {
    started.resolve();
    gate.promise.then(() => request.success({ tempFilePath: request.src }));
  }));
  const saving = observe(api.action('recognition-save', { result: { name: 'old cup' }, photos: ['wxfile://old-photo'] }));
  await reached(started, saving);
  f.session.signOut();
  await login(f, 'A');
  gate.resolve();
  await saving.done;
  assert.equal(sent.length, 0, 'matching user/shop IDs do not authorize work from an older login revision');
  rejected(saving, 'old photo work must reject after same-user re-login');
});

test('parallel different photo saves retain distinct local idempotency IDs', async () => {
  const f = fixture();
  await login(f);
  const gate = deferred(), started = deferred(), sent = [];
  const api = apiFor(f, async (name, body) => { sent.push(body.params); return { ok: true, data: { item: { id: body.params.result.name } } }; }, photos(request => {
    if (request.src === 'wxfile://first') {
      started.resolve();
      gate.promise.then(() => request.success({ tempFilePath: request.src }));
    } else request.success({ tempFilePath: request.src });
  }));
  const first = observe(api.action('recognition-save', { result: { name: 'first' }, photos: ['wxfile://first'] }));
  await reached(started, first);
  try {
    await api.action('recognition-save', { result: { name: 'second' }, photos: ['wxfile://second'] });
  } finally {
    gate.resolve();
    await first.done;
  }
  assert.equal(first.status, 'fulfilled');
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map(row => row.result.name).sort(), ['first', 'second']);
  for (const row of sent) assert.match(row.request_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(sent[0].request_id, sent[1].request_id, 'the second fingerprint must not replace the first in-flight request ID');
});

test('retrying the same photo fingerprint keeps its idempotency ID', async () => {
  const f = fixture();
  await login(f);
  const ids = [];
  const api = apiFor(f, async (name, body) => { ids.push(body.params.request_id); return { ok: true, data: { item: { id: 'saved' } } }; }, photos());
  const input = { result: { name: 'same cup' }, photos: ['wxfile://same'] };
  await api.action('recognition-save', input);
  await api.action('recognition-save', input);
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
});

const pageCases = [
  { name: 'unloaded page, unchanged session', unload: true },
  { name: 'unloaded page after B login', unload: true, nextUser: 'B' },
  { name: 'live page from an older revision after B login', nextUser: 'B' },
  { name: 'live page from an older revision after same-user re-login', nextUser: 'A' },
  { name: 'live page with the current revision', shouldLogout: true }
];

for (const scenario of pageCases) {
  test('401 guard: ' + scenario.name, async t => {
    const f = fixture();
    await login(f);
    const previousWx = global.wx, routes = [];
    global.wx = { reLaunch: request => routes.push(request.url) };
    t.after(() => { if (previousWx === undefined) delete global.wx; else global.wx = previousWx; });
    const page = Object.assign({}, definePage({}), { session: f.session, setData(value) { Object.assign(this.data, value); } });
    const gate = deferred();
    const running = page.run(() => gate.promise);
    if (scenario.unload) page.onUnload();
    if (scenario.nextUser) {
      f.session.signOut();
      await login(f, scenario.nextUser);
    }
    gate.reject(Object.assign(new Error('old request unauthorized'), { status: 401 }));
    await running;
    if (scenario.shouldLogout) {
      assert.equal(f.session.get(), null);
      assert.equal(f.session.token(), null);
      assert.deepEqual(routes, ['/pages/login/index']);
    } else {
      assert.equal(f.session.get() && f.session.get().userId, USERS[scenario.nextUser || 'A'], 'stale/unloaded task must preserve the current account');
      assert.deepEqual(routes, [], 'stale/unloaded task must not reopen login');
    }
  });
}
