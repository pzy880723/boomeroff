const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTransport } = require('../miniprogram/shared/transport');
const config = { supabaseUrl: 'https://project.test', publicKey: 'PUBLIC', scopeRegion: 'ap-northeast-2' };
function fixture(response = { statusCode: 200, data: {} }) {
  const calls = [];
  const request = createTransport({ request(o) { calls.push(o); o.success(response); } }, config, () => 'EXISTING');
  return { calls, request };
}
test('password grant uses only the fixed Auth endpoint and public-key authorization', async () => {
  const f = fixture(); await f.request('auth:password', { email: 'synthetic@example.test', password: 'synthetic' });
  assert.equal(f.calls[0].url, 'https://project.test/auth/v1/token?grant_type=password');
  assert.equal(f.calls[0].header.Authorization, 'Bearer PUBLIC'); assert.equal(f.calls[0].method, 'POST');
});
test('candidate verification is GET with a private per-request token and no body or query credential', async () => {
  const f = fixture(); await f.request('auth:user', undefined, { accessToken: 'CANDIDATE' });
  const r = f.calls[0]; assert.equal(r.url, 'https://project.test/auth/v1/user'); assert.equal(r.method, 'GET');
  assert.equal(r.header.Authorization, 'Bearer CANDIDATE'); assert.equal(r.data, undefined);
  await f.request('go-mini-api', {}, { accessToken: 'MUST_NOT_LEAK' });
  assert.equal(f.calls[1].header.Authorization, 'Bearer EXISTING');
  const missing = fixture(); await assert.rejects(missing.request('auth:user', {})); assert.equal(missing.calls.length, 0);
  for (const accessToken of ['', 'token\r\nInjected: bad', {}, null]) {
    const invalid = fixture(); await assert.rejects(invalid.request('auth:user', undefined, { accessToken })); assert.equal(invalid.calls.length, 0);
  }
});
test('password errors do not expose server messages or falsely report an expired employee session', async () => {
  for (const name of ['phone-password-login', 'auth:password']) {
    for (const status of [400, 401, 429, 500]) {
      const f = fixture({ statusCode: status, data: { error: 'private directory data must not escape', code: status === 400 ? 'invalid_credentials' : undefined } });
      await assert.rejects(f.request(name, {}), error => {
        assert.equal(error.status, status); assert.doesNotMatch(error.message, /private directory|已过期/);
        assert.match(error.message, status === 429 ? /频繁|稍后/ : status >= 500 ? /服务.*不可用|繁忙/ : /账号或密码/); return true;
      });
    }
  }
});
