const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function prepare(t) {
  const tool = '../tools/prepare-operations.cjs';
  assert.ok(fs.existsSync(path.resolve(__dirname, tool)), 'missing three-target preparation tool');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'go-operations-test-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const output = path.join(tmp, 'project');
  const receipt = require(tool).prepare(output);
  return { output, receipt, code: require(path.join(output, 'miniprogram/shared/operations.js')) };
}

test('one isolated employee source snapshot supports all three build targets', t => {
  const { output, receipt } = prepare(t);
  const read = file => JSON.parse(fs.readFileSync(path.join(output, file), 'utf8'));
  assert.deepEqual(receipt.targets, ['wechat', 'android', 'ios']);
  assert.equal(read('project.config.json').appid, 'wx5c4f68873d7f919c');
  assert.equal(read('project.config.json').projectArchitecture, 'multiPlatform');
  assert.equal(read('app.miniapp.json').appid, '');
  assert.equal(fs.existsSync(path.join(output, 'project.private.config.json')), false);
  const app = read('miniprogram/app.json');
  for (const page of app.pages) {
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      assert.ok(receipt.files['miniprogram/' + page + '.' + ext]);
    }
  }
  assert.ok(!app.pages.some(page => /recognize|marketing/.test(page)));
  assert.throws(() => require('../tools/prepare-operations.cjs').prepare(output), /already exists/);
});

const employee = '8ed15725-9712-447c-acb9-cd98da0c6d31';
function issue() {
  return { user: { id: employee }, access_token: 'erp-access', refresh_token: 'erp-refresh',
    device_token: 'erp-device', expires_at: Date.now() / 1000 + 300 };
}

test('ERP identity is confirmed by Tencent before scoped tasks can load', async t => {
  const { code } = prepare(t);
  const calls = [];
  const auth = { signInWithPassword: async () => issue(), signInWithCode: async () => issue() };
  const wx = { request(req) {
    calls.push(req);
    const data = req.url.endsWith('/session') ?
      { user_id: employee, roles: ['store_staff'], shops: [{ id: 'a', name: 'Store A' }] } :
      { items: [], total: 0, completed: 0 };
    req.success({ statusCode: 200, data: { ok: true, data } });
  } };
  const session = code.createOperations({ wx, auth });
  for (const mode of ['password', 'otp']) {
    assert.equal((await session.signIn(mode, 'x', 'y')).shops[0].id, 'a');
    await assert.rejects(session.tasks('b', '2026-11-21'), /门店/);
    assert.deepEqual(await session.tasks('a', '2026-11-21'), { items: [], total: 0, completed: 0 });
    session.signOut();
  }
  assert.equal(calls.length, 4);
  assert.ok(calls.every(req => req.url.startsWith('https://ai.boomeroff.com/go-operations/')));
  assert.equal(calls[1].header.Authorization, 'Bearer erp-access');
  assert.equal(calls[1].header['X-Device-Token'], 'erp-device');
  await assert.rejects(session.tasks('a', '2026-11-21'), /登录/);
});

test('scope mismatch, ambiguous staff stores and late logout responses fail closed', async t => {
  const { code } = prepare(t);
  let request;
  const wx = { request(req) { request = req; } };
  const session = code.createOperations({ wx, auth: { signInWithPassword: async () => issue() } });
  for (const data of [
    { user_id: 'different', roles: ['store_staff'], shops: [{ id: 'a', name: 'A' }] },
    { user_id: employee, roles: ['store_staff'], shops: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }
  ]) {
    const signed = session.signIn('password', 'x', 'y');
    await Promise.resolve();
    request.success({ statusCode: 200, data: { ok: true, data } });
    await assert.rejects(signed);
    assert.equal(session.current(), null);
  }
  const signed = session.signIn('password', 'x', 'y');
  await Promise.resolve();
  session.signOut();
  request.success({ statusCode: 200, data: { ok: true, data: { user_id: employee,
    roles: ['store_staff'], shops: [{ id: 'a', name: 'A' }] } } });
  await assert.rejects(signed);
  assert.equal(session.current(), null);
});

test('concurrent reads share one refresh and use the reverified session', async t => {
  const { code } = prepare(t);
  const calls = [];
  const shop = { id: 'a', name: 'A' };
  const wx = { request(req) {
    calls.push(req);
    const data = req.url.endsWith('/refresh') ?
      { access_token: 'renewed', refresh_token: 'rotated', expires_at: Date.now() / 1000 + 300 } :
      req.url.endsWith('/session') ? { user_id: employee, roles: ['store_staff'], shops: [shop] } :
      { items: [{ id: 'task', shop_id: 'a', date: '2026-11-21', status: 'completed' }], total: 1, completed: 1 };
    req.success({ statusCode: 200, data: { ok: true, data } });
  } };
  const session = code.createOperations({ wx, auth: { signInWithPassword: async () =>
    ({ ...issue(), expires_at: Date.now() / 1000 + 1 }) } });
  await session.signIn('password', 'x', 'y');
  const rows = await Promise.all([session.tasks('a', '2026-11-21'), session.tasks('a', '2026-11-21')]);
  assert.equal(calls.filter(req => req.url.endsWith('/refresh')).length, 1);
  assert.deepEqual(calls[1].data, { refresh_token: 'erp-refresh' });
  assert.ok(calls.slice(2).every(req => req.header.Authorization === 'Bearer renewed'));
  assert.equal(rows[0].completed, 1);
});

test('foreign task data is rejected and ERP revocation clears the session', async t => {
  const { code } = prepare(t);
  let revoked = false;
  const wx = { request(req) {
    if (req.url.endsWith('/session')) return req.success({ statusCode: 200, data: { ok: true, data: {
      user_id: employee, roles: ['store_staff'], shops: [{ id: 'a', name: 'A' }]
    } } });
    if (revoked) return req.success({ statusCode: 403, data: { ok: false } });
    req.success({ statusCode: 200, data: { ok: true, data: { items: [
      { id: 'foreign', shop_id: 'b', date: '2026-11-21', status: 'pending' }
    ], total: 1, completed: 0 } } });
  } };
  const session = code.createOperations({ wx, auth: { signInWithPassword: async () => issue() } });
  await session.signIn('password', 'x', 'y');
  await assert.rejects(session.tasks('a', '2026-11-21'), /未能确认/);
  revoked = true;
  await assert.rejects(session.tasks('a', '2026-11-21'), { status: 403 });
  assert.equal(session.current(), null);
});
