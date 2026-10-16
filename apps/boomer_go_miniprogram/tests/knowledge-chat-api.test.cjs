const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('../miniprogram/shared/api');
const { createTransport } = require('../miniprogram/shared/transport');
const ID = '00000000-0000-4000-8000-000000000811';
const input = { knowledge_id: ID, messages: [{ role: 'user', content: '怎么介绍底款？' }] };

for (const shop of [null, { id: 'verified-shop' }]) test('knowledge-bound paid Q&A reserves scope once and omits automatic shop with selected shop ' + !!shop, async () => {
  const order = [], calls = [];
  const session = { get: () => ({ userId: ID, shop }), revision: () => 1, restore: async () => order.push('reserve'), ensureFresh: async () => order.push('fresh') };
  const api = createApi({ wx: {}, config: {}, session, invoke: async (name, body) => { order.push('request'); calls.push({ name, body }); return { data: { knowledge_id: ID, reply: '合成回答', persisted: false } }; } });
  await api.action('official-knowledge-chat', input);
  assert.deepEqual(order, ['reserve','request']);
  assert.deepEqual(calls, [{ name: 'go-mini-api', body: { action: 'official-knowledge-chat', params: input } }]);
  assert.equal(Object.hasOwn(input, 'shop_id'), false);
});

test('knowledge Q&A forwards explicit invalid keys to strict server validation without rewriting them', async () => {
  let sent;
  const api = createApi({ wx: {}, config: {}, session: { get: () => ({ userId: ID, shop: { id: 'selected' } }) },
    invoke: async (_, body) => { sent = body.params; throw Object.assign(new Error('invalid'), { status: 400, code: 'invalid_params' }); } });
  await assert.rejects(api.action('official-knowledge-chat', { ...input, shop_id: 'forged' }), e => e.code === 'invalid_params');
  assert.equal(sent.shop_id, 'forged');
});

for (const [status, code] of [[403,'erp_scope_not_ready'],[403,'knowledge_chat_scope_changed'],[401,'unauthorized'],[504,'ai_timeout'],[0,'network_error']]) test('knowledge Q&A never automatically resends after ' + code, async () => {
  let requests = 0, reserves = 0;
  const api = createApi({ wx: {}, config: {}, session: { get: () => ({ userId: ID }), restore: async () => reserves++ },
    invoke: async () => { requests++; throw Object.assign(new Error('safe test error'), { status, code }); } });
  await assert.rejects(api.action('official-knowledge-chat', input), e => e.code === code);
  assert.equal(requests, 1); assert.equal(reserves, 1);
});

test('a changed identity during scope reservation prevents any paid knowledge request', async () => {
  let revision = 1, calls = 0;
  const api = createApi({ wx: {}, config: {}, session: { get: () => ({ userId: ID }), revision: () => revision, restore: async () => { revision++; } }, invoke: async () => { calls++; } });
  await assert.rejects(api.action('official-knowledge-chat', input), e => e.code === 'stale_operation');
  assert.equal(calls, 0);
});

test('knowledge Q&A uses the bounded-generation transport timeout without changing normal reads', async () => {
  const calls = [], transport = createTransport({ request(r) { calls.push(r); r.success({ statusCode: 200, data: { ok: true, data: {} } }); } }, { publicKey: 'test-public', supabaseUrl: 'https://example.test' }, () => 'test-token');
  await transport('go-mini-api', { action: 'official-knowledge-chat', params: input });
  await transport('go-mini-api', { action: 'official-library', params: {} });
  assert.equal(calls[0].timeout, 65000); assert.equal(calls[1].timeout, 20000);
});

for (const code of ['ai_timeout','ai_budget_exhausted','ai_rate_limited','ai_unavailable','ai_invalid_response','knowledge_chat_scope_changed','not_found','db_unavailable','scope_unavailable','erp_scope_not_ready','account_suspended']) test('knowledge Q&A has a safe action-specific message for ' + code, async () => {
  const transport = createTransport({ request(r) { r.success({ statusCode: code === 'not_found' ? 404 : 503, data: { ok: false, code, message: 'PRIVATE_PROVIDER_DETAILS' } }); } }, { publicKey: 'test-public', supabaseUrl: 'https://example.test' }, () => 'test-token');
  await assert.rejects(transport('go-mini-api', { action: 'official-knowledge-chat', params: input }), e => {
    assert.equal(e.code, code); assert.doesNotMatch(e.message, /PRIVATE_PROVIDER|起草|草稿|原稿/);
    assert.notEqual(e.message, '服务暂不可用，请稍后重试'); return true;
  });
});
