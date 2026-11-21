const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../miniprogram/shared/erp-auth.js');
const USER = '00000000-0000-4000-8000-000000000001';
const DEVICE = '00000000-0000-4000-8000-000000000002';
const INSTALL = 'synthetic-install-id';
function issued() {
  return { access_token: 'ERP_ACCESS', refresh_token: 'ERP_REFRESH', device_token: 'ERP_DEVICE',
    expires_at: Math.floor(Date.now() / 1000) + 300, user: { id: USER, user_id: USER },
    device: { id: DEVICE }, locations: [] };
}
function fixture(respond) {
  assert.ok(fs.existsSync(file), 'ERP auth adapter is not implemented');
  const calls = [];
  const wx = { request(r) {
    calls.push(r);
    if (respond) return respond(r, calls);
    const data = r.url.endsWith('/send') ? { ttl: 300 }
      : r.url.endsWith('/me') ? { user: { user_id: USER }, device: { id: DEVICE } } : issued();
    r.success({ statusCode: 200, data: { ok: true, data } });
  } };
  return { calls, auth: require(file).createErpAuth({ wx, installId: INSTALL }) };
}
test('ERP password bootstrap keeps credentials exact and independently verifies the issued identity', async () => {
  const f = fixture(); const result = await f.auth.signInWithPassword(' 13800138000 ', ' original password ');
  assert.equal(f.calls[0].url, 'https://erp.boomeroff.com/api/public/handheld/auth/bootstrap');
  assert.deepEqual(f.calls[0].data, { phone: '13800138000', password: ' original password ', install_id: INSTALL });
  assert.equal(f.calls[1].url, 'https://erp.boomeroff.com/api/public/handheld/auth/me');
  assert.equal(f.calls[1].method, 'GET'); assert.equal(f.calls[1].data, undefined);
  assert.equal(f.calls[1].header.Authorization, 'Bearer ERP_ACCESS');
  assert.equal(f.calls[1].header['X-Device-Token'], 'ERP_DEVICE');
  assert.equal(result.user.id, USER);
  assert.ok(f.calls.every(r => r.url.startsWith('https://erp.boomeroff.com/api/public/')));
  assert.ok(f.calls.every(r => !r.header.apikey));
});
test('ERP email login never invents GO username aliases or applies the old GO password minimum', async () => {
  const f = fixture(); await f.auth.signInWithPassword('staff@example.test', 'short');
  assert.equal(f.calls[0].data.email, 'staff@example.test');
  const bad = fixture(); await assert.rejects(bad.auth.signInWithPassword('staff', 'password'));
  assert.equal(bad.calls.length, 0);
});
test('SMS send uses ERP login purpose and distinguishes expiry from resend cooldown', async () => {
  const f = fixture(); const result = await f.auth.sendCode('13800138000');
  assert.equal(f.calls[0].url, 'https://erp.boomeroff.com/api/public/auth/otp/send');
  assert.deepEqual(f.calls[0].data, { phone: '13800138000', purpose: 'login' });
  assert.equal(result.ttlSeconds, 300); assert.equal(result.cooldownSeconds, 60);
});
test('WeChat request-domain rejection is not an uncertain SMS delivery', async () => {
  const f = fixture(r => r.fail({ errMsg: 'request:fail url not in domain list' }));
  await assert.rejects(f.auth.sendCode('13800138000'), e =>
    e.code === 'erp_request_domain_blocked' && e.uncertain === false &&
    e.message.includes('erp.boomeroff.com'));
  assert.equal(f.calls.length, 1);
});
test('code and password use the same ERP installation and canonical employee', async () => {
  const f = fixture(); const code = await f.auth.signInWithCode('13800138000', '123456');
  assert.deepEqual(f.calls[0].data, { phone: '13800138000', code: '123456', install_id: INSTALL });
  assert.equal(f.calls[0].url, 'https://erp.boomeroff.com/api/public/auth/otp/verify');
  const password = await f.auth.signInWithPassword('13800138000', 'password');
  assert.equal(code.user.id, password.user.id);
});
test('invalid inputs do not start network requests', async () => {
  const f = fixture();
  for (const phone of ['123', '13800138000\n', null, {}]) await assert.rejects(f.auth.sendCode(phone));
  for (const code of ['123', '123456\n', null]) await assert.rejects(f.auth.signInWithCode('13800138000', code));
  await assert.rejects(f.auth.signInWithPassword('13800138000', ''));
  assert.equal(f.calls.length, 0);
});
test('pending same-phone SMS sends share one request without replacing another phone', async () => {
  let reply; const f = fixture(r => { reply = r; });
  const a = f.auth.sendCode('13800138000'), b = f.auth.sendCode('13800138000');
  assert.equal(f.calls.length, 1); await assert.rejects(f.auth.sendCode('13900139000'));
  reply.success({ statusCode: 200, data: { ok: true, data: { ttl: 300 } } });
  assert.deepEqual(await a, await b); assert.equal(f.calls.length, 1);
});
test('pending login blocks repeated OTP and password submission', async () => {
  let reply; const f = fixture(r => { reply = r; });
  const pending = f.auth.signInWithCode('13800138000', '123456');
  await assert.rejects(f.auth.signInWithCode('13800138000', '123456'));
  await assert.rejects(f.auth.signInWithPassword('13800138000', 'password'));
  assert.equal(f.calls.length, 1); reply.fail({ errMsg: 'private transport detail' });
  await assert.rejects(pending, e => e.uncertain === true && !e.message.includes('private'));
  assert.equal(f.calls.length, 1);
});
test('different ERP user or device readback cannot confirm a login', async () => {
  for (const kind of ['user', 'device']) {
    const f = fixture(r => {
      const data = r.url.endsWith('/me') ? { user: { user_id: kind === 'user' ? DEVICE : USER },
        device: { id: kind === 'device' ? USER : DEVICE } } : issued();
      r.success({ statusCode: 200, data: { ok: true, data } });
    });
    await assert.rejects(f.auth.signInWithCode('13800138000', '123456'), e => e.uncertain === true);
    assert.equal(f.calls.length, 2);
  }
});
test('malformed sessions and header-injection credentials fail before readback', async () => {
  for (const change of [d => d.user.id = DEVICE, d => d.access_token = 'TOKEN\r\nBad: value',
    d => d.refresh_token = '', d => d.device_token = '', d => d.expires_at = 1, d => delete d.device]) {
    const data = issued(); change(data);
    const f = fixture(r => r.success({ statusCode: 200, data: { ok: true, data } }));
    await assert.rejects(f.auth.signInWithCode('13800138000', '123456'), e => e.uncertain === true);
    assert.equal(f.calls.length, 1);
  }
});
test('network failure never means SMS success and never retries or leaks provider details', async () => {
  const f = fixture(r => r.fail({ errMsg: 'private' }));
  await assert.rejects(f.auth.sendCode('13800138000'), e => e.uncertain === true && !e.message.includes('private'));
  assert.equal(f.calls.length, 1); assert.ok(f.calls[0].timeout > 0 && f.calls[0].timeout <= 20000);
});
test('server errors remain safe; possibly consumed OTP failures are uncertain', async () => {
  for (const status of [400, 401, 429, 500, 502]) {
    const f = fixture(r => r.success({ statusCode: status, data: { ok: false, error: 'private database detail', code: 'otp_invalid' } }));
    await assert.rejects(f.auth.signInWithCode('13800138000', '123456'), e => {
      assert.equal(e.status, status); assert.equal(e.uncertain, status >= 500);
      assert.doesNotMatch(e.message, /private database/); return true;
    });
    assert.equal(f.calls.length, 1);
  }
});
test('invalid JSON or missing SMS TTL cannot be treated as success', async () => {
  for (const data of ['not json', { ok: true }, { ok: true, data: { ttl: 0 } }, { ok: 'true', data: { ttl: 300 } }]) {
    const f = fixture(r => r.success({ statusCode: 200, data }));
    await assert.rejects(f.auth.sendCode('13800138000'), e => e.uncertain === true);
  }
});
test('stable installation identity is required and the adapter never persists credentials', () => {
  fixture(); const { createErpAuth } = require(file);
  for (const installId of ['', 'short', 'x'.repeat(65), INSTALL + '\n']) assert.throws(() => createErpAuth({ wx: {}, installId }));
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /setStorageSync|writeFile|console\.(?:log|error)/);
});
test('UUIDs must be exact strings, not newline-suffixed or coercible values', async () => {
  for (const change of [d => { d.user.id = d.user.user_id = USER + '\n'; }, d => { d.device.id = [DEVICE]; }]) {
    const data = issued(); change(data);
    const f = fixture(r => r.success({ statusCode: 200, data: { ok: true, data } }));
    await assert.rejects(f.auth.signInWithPassword('13800138000', 'password'));
    assert.equal(f.calls.length, 1);
  }
});
test('failed identity readback does not resend an already consumed code', async () => {
  for (const status of [401, 403, 500]) {
    const f = fixture(r => r.url.endsWith('/me')
      ? r.success({ statusCode: status, data: { ok: false, code: 'unauthorized' } })
      : r.success({ statusCode: 200, data: { ok: true, data: issued() } }));
    await assert.rejects(f.auth.signInWithCode('13800138000', '123456'), e => e.uncertain === true);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls.filter(r => r.url.endsWith('/verify')).length, 1);
  }
});
test('valid JSON response strings use the same exact ERP identity readback', async () => {
  const f = fixture(r => r.success({ statusCode: 200, data: JSON.stringify({ ok: true,
    data: r.url.endsWith('/me') ? { user: { user_id: USER }, device: { id: DEVICE } } : issued() }) }));
  assert.equal((await f.auth.signInWithPassword('13800138000', 'password')).user.id, USER);
});
