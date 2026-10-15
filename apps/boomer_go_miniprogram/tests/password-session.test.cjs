const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSession, businessDate } = require('../miniprogram/shared/session');
const USER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const SHOP = '10000000-0000-4000-8000-000000000003';
const PASS = ' Synthetic Password ';
const EXP = Math.floor(Date.now() / 1000) + 3600;
const jwt = (sub = USER, exp = EXP) => 'e30.' + Buffer.from(JSON.stringify({ sub, exp })).toString('base64url') + '.synthetic';
const pair = () => ({ access_token: jwt(), refresh_token: 'synthetic-refresh' });
const tick = () => new Promise(resolve => setImmediate(resolve));
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function fixture(handlers = {}) {
  const calls = [], saved = [], storage = {};
  const wx = { getStorageSync: key => storage[key], setStorageSync(key, value) { storage[key] = value; saved.push(structuredClone(value)); }, removeStorageSync: key => { delete storage[key]; } };
  const scope = user => ({ ok: true, data: { authenticated: true, user_id: user }, sync: { status: 'synced', lease_renewed: true, scope_version: 3 },
    bootstrap: { profile: { display_name: '合成员工' }, shop_context: { date: businessDate(), scope: 'store', effective_shop: { id: SHOP, name: '合成门店' }, authorized_shops: [{ id: SHOP, name: '合成门店' }] } } });
  const request = async (name, body, options) => {
    calls.push({ name, body, options });
    if (handlers[name]) return handlers[name](body, options);
    if (name === 'phone-password-login') return { ok: true, ...pair() };
    if (name === 'auth:password') return { ...pair(), user: { id: USER } };
    if (name === 'auth:user') return { id: USER };
    if (name === 'erp-scope-sync') return scope(USER);
    if (name === 'phone-login-verify-otp') return { ok: true, ...pair(), session: { ...pair(), user: { id: USER } } };
    throw new Error('unexpected request ' + name);
  };
  const session = createSession({ wx, request });
  return { session, calls, saved, storage, scope, wx };
}

test('native identity normalization matches the source-defined phone, username and email branches', () => {
  const file = path.resolve(__dirname, '../miniprogram/shared/login-identity.js');
  assert.ok(fs.existsSync(file), 'native account normalization must be implemented');
  const { loginIdentity } = require(file);
  assert.deepEqual(loginIdentity(' 13800138000 '), { phone: '13800138000' });
  assert.deepEqual(loginIdentity(' Store_User '), { email: 'store_user@boomeroff.local' });
  assert.deepEqual(loginIdentity(' STAFF@EXAMPLE.TEST '), { email: 'staff@example.test' });
  for (const account of ['', 'ab', 'name with spaces', '中信门店', 'a@b', 'a@@b.test', 'a'.repeat(33), 'a@' + 'b'.repeat(255) + '.test']) assert.throws(() => loginIdentity(account));
});

test('phone-password tokens are validated remotely before persistence and current ERP authorization', async () => {
  const f = fixture({ 'auth:user': () => { assert.equal(f.saved.length, 0); assert.equal(f.session.token(), null); return { id: USER }; } });
  assert.equal(typeof f.session.signInWithPassword, 'function');
  const result = await f.session.signInWithPassword('13800138000', PASS);
  assert.deepEqual(f.calls.map(c => c.name), ['phone-password-login', 'auth:user', 'erp-scope-sync']);
  assert.deepEqual(f.calls[0].body, { phone: '13800138000', password: PASS });
  assert.equal(f.calls[1].options.accessToken, pair().access_token);
  assert.equal(result.userId, USER); assert.equal(result.shop.id, SHOP); assert.equal(result.scopeVersion, 3);
  assert.doesNotMatch(JSON.stringify(f.saved), /Synthetic Password|password/);
  assert.deepEqual(Object.keys(f.saved[0]).sort(), ['access_token', 'refresh_token', 'user']);
  assert.deepEqual(f.saved[0].user, { id: USER });
});

test('username and email use the original password grant and never trim the password', async () => {
  for (const [account, email] of [[' Store_User ', 'store_user@boomeroff.local'], [' STAFF@EXAMPLE.TEST ', 'staff@example.test']]) {
    const f = fixture(); assert.equal(typeof f.session.signInWithPassword, 'function');
    await f.session.signInWithPassword(account, PASS);
    assert.deepEqual(f.calls[0].body, { email, password: PASS }); assert.equal(f.calls[0].name, 'auth:password');
    assert.equal(f.calls.filter(c => c.name === 'phone-password-login').length, 0);
  }
});

test('invalid account or password performs no remote authentication or credential mutation', async () => {
  for (const [account, password] of [['ab', PASS], ['name with spaces', PASS], ['a@@b.test', PASS], ['13800138000', 'short'], ['13800138000', 'x'.repeat(73)], [null, PASS], ['staff', null]]) {
    const f = fixture(); assert.equal(typeof f.session.signInWithPassword, 'function');
    await assert.rejects(f.session.signInWithPassword(account, password));
    assert.equal(f.calls.length, 0); assert.equal(f.saved.length, 0); assert.equal(f.session.get(), null);
  }
});

test('malformed, missing, expired and mismatched candidate sessions cannot be installed', async () => {
  for (const response of [{ ok: false, ...pair() }, { ok: true }, { ok: true, ...pair(), refresh_token: '' },
    { ok: true, ...pair(), access_token: 'not-a-jwt' }, { ok: true, ...pair(), access_token: jwt(USER, 1) },
    { ok: true, ...pair(), access_token: jwt('not-user-id') }, { ok: true, ...pair(), access_token: jwt(USER, 'future') },
    { ok: true, ...pair(), access_token: jwt(USER, String(EXP)) }]) {
    const f = fixture({ 'phone-password-login': () => response }); assert.equal(typeof f.session.signInWithPassword, 'function');
    await assert.rejects(f.session.signInWithPassword('13800138000', PASS));
    assert.equal(f.saved.length, 0); assert.equal(f.session.token(), null); assert.equal(f.session.get(), null);
    assert.equal(f.calls.filter(c => c.name === 'erp-scope-sync').length, 0);
  }
  for (const user of [{ id: OTHER }, {}, null]) {
    const f = fixture({ 'auth:user': () => user });
    await assert.rejects(f.session.signInWithPassword('13800138000', PASS));
    assert.equal(f.saved.length, 0); assert.equal(f.session.token(), null); assert.equal(f.calls.length, 2);
  }
});

test('accepted authentication with failed ERP synchronization restores without another password or SMS', async () => {
  let ready = false;
  const f = fixture({ 'erp-scope-sync': () => ready ? f.scope(USER) : { ok: true, data: { authenticated: true, user_id: USER }, sync: { status: 'pending', lease_renewed: false, scope_version: 3 } } });
  assert.equal(typeof f.session.signInWithPassword, 'function');
  await assert.rejects(f.session.signInWithPassword('13800138000', PASS));
  assert.equal(f.session.get(), null); assert.equal(f.session.hasCredentials(), true);
  ready = true; const restored = await f.session.restore(); assert.equal(restored.userId, USER);
  assert.equal(f.calls.filter(c => c.name === 'phone-password-login').length, 1);
  assert.equal(f.calls.filter(c => c.name.includes('otp')).length, 0);
});

test('current ERP identity, suspension and lease failures do not grant an operational session', async () => {
  for (const change of [d => { d.data.user_id = OTHER; }, d => { d.bootstrap.user_role = { suspended: true }; }, d => { d.sync.lease_renewed = false; }, d => { d.sync.scope_version = '3'; }, d => { d.sync.status = 'unlinked'; }]) {
    const f = fixture({ 'erp-scope-sync': () => { const d = f.scope(USER); change(d); return d; } });
    assert.equal(typeof f.session.signInWithPassword, 'function');
    await assert.rejects(f.session.signInWithPassword('13800138000', PASS)); assert.equal(f.session.get(), null);
  }
});

test('password and OTP share a single authentication flight', async () => {
  for (const first of ['password', 'otp']) {
    const wait = gate(); const f = fixture({ [first === 'password' ? 'phone-password-login' : 'phone-login-verify-otp']: () => wait.promise });
    assert.equal(typeof f.session.signInWithPassword, 'function');
    const pending = first === 'password' ? f.session.signInWithPassword('13800138000', PASS) : f.session.signInWithCode('13800138000', '123456');
    await tick();
    await assert.rejects(first === 'password' ? f.session.signInWithCode('13800138000', '123456') : f.session.signInWithPassword('13800138000', PASS), /正在进行/);
    f.session.signOut(); wait.resolve(first === 'password' ? { ok: true, ...pair() } : { ok: true, ...pair(), session: { ...pair(), user: { id: USER } } });
    await assert.rejects(pending); assert.equal(f.session.token(), null);
  }
});

test('late authentication, user verification and ERP responses after logout cannot reinstall a session', async () => {
  for (const step of ['phone-password-login', 'auth:user', 'erp-scope-sync']) {
    const wait = gate(); const f = fixture({ [step]: () => wait.promise }); assert.equal(typeof f.session.signInWithPassword, 'function');
    const pending = f.session.signInWithPassword('13800138000', PASS); await tick();
    f.session.signOut();
    wait.resolve(step === 'phone-password-login' ? { ok: true, ...pair() } : step === 'auth:user' ? { id: USER } : f.scope(USER));
    await assert.rejects(pending); assert.equal(f.session.get(), null); assert.equal(f.session.token(), null);
  }
});

test('a late old candidate does not clear a newer accepted account', async () => {
  const wait = gate(); let first = true;
  const f = fixture({ 'auth:user': () => { if (first) { first = false; return wait.promise; } return { id: USER }; } });
  assert.equal(typeof f.session.signInWithPassword, 'function');
  const old = f.session.signInWithPassword('13800138000', PASS); await tick(); f.session.signOut();
  await f.session.signInWithPassword('staff', PASS); const token = f.session.token();
  wait.resolve({ id: USER }); await assert.rejects(old);
  assert.equal(f.session.token(), token); assert.equal(f.session.get().userId, USER);
});

test('real shared transport wires candidate verification and ERP synchronization without installing a candidate early', async () => {
  const { createTransport } = require('../miniprogram/shared/transport');
  for (const account of ['13800138000', 'Staff_User']) {
    const f = fixture(), http = [], candidate = pair(); let session;
    f.wx.request = options => {
      http.push(options);
      if (http.length === 1) {
        assert.equal(options.header.Authorization, 'Bearer PUBLIC');
        assert.equal(options.data.password, PASS);
        options.success({ statusCode: 200, data: account === '13800138000' ? { ok: true, ...candidate } : { ...candidate, user: { id: USER } } });
      } else if (http.length === 2) {
        assert.equal(session.token(), null); assert.equal(f.saved.length, 0);
        assert.equal(options.url, 'https://project.test/auth/v1/user'); assert.equal(options.method, 'GET');
        assert.equal(options.header.Authorization, 'Bearer ' + candidate.access_token);
        options.success({ statusCode: 200, data: { id: USER } });
      } else {
        assert.equal(options.header.Authorization, 'Bearer ' + candidate.access_token);
        assert.match(options.url, /\/erp-scope-sync\?forceFunctionRegion=ap-northeast-2$/);
        options.success({ statusCode: 200, data: f.scope(USER) });
      }
    };
    const request = createTransport(f.wx, { supabaseUrl: 'https://project.test', publicKey: 'PUBLIC', scopeRegion: 'ap-northeast-2' }, () => session.token());
    session = createSession({ wx: f.wx, request });
    const result = await session.signInWithPassword(account, PASS);
    assert.equal(result.userId, USER); assert.equal(http.length, 3);
    assert.equal(http[0].url, account === '13800138000' ? 'https://project.test/functions/v1/phone-password-login' : 'https://project.test/auth/v1/token?grant_type=password');
  }
});
