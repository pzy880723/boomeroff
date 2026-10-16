const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('../miniprogram/shared/api');

for (const shop of [null, { id: 'selected-store' }]) test('official library omits automatic shop fields with selected shop ' + !!shop, async () => {
  const sent = [], order = [];
  const api = createApi({ wx: {}, config: {}, session: {
    get: () => ({ userId: 'employee', shop }), revision: () => 1,
    ensureFresh: async () => order.push('fresh')
  }, invoke: async (name, body) => { order.push('read'); sent.push({ name, body }); return { data: { items: [] } }; } });
  const params = { q: ' 瓷器 ', category: 'jp_porcelain', ip_name: '品牌窑口', sort: 'latest' };
  await api.action('official-library', params);
  assert.deepEqual(sent, [{ name: 'go-mini-api', body: { action: 'official-library', params } }]);
  assert.deepEqual(order, ['fresh', 'read']);
  assert.equal(Object.hasOwn(params, 'shop_id'), false);
});

test('official library never masks explicit invalid caller fields from strict backend validation', async () => {
  let sent;
  const api = createApi({ wx: {}, config: {}, session: { get: () => ({ userId: 'employee', shop: { id: 'selected' } }) },
    invoke: async (_, body) => { sent = body.params; throw new Error('invalid_params'); } });
  await assert.rejects(api.action('official-library', { shop_id: 'forged', page: 1 }), /invalid_params/);
  assert.deepEqual(sent, { shop_id: 'forged', page: 1 });
});

test('official library still rejects old identity results and does not request after a stale lease refresh', async () => {
  let revision = 1, requests = 0, finish;
  const session = { get: () => ({ userId: 'employee', shop: { id: 'selected' } }), revision: () => revision };
  const api = createApi({ wx: {}, config: {}, session, invoke: () => { requests++; return new Promise(resolve => { finish = resolve; }); } });
  const read = api.action('official-library', {});
  await new Promise(resolve => setImmediate(resolve));
  revision++; finish({ data: { items: [] } });
  await assert.rejects(read, error => error.code === 'stale_operation');
  assert.equal(requests, 1);
  session.ensureFresh = async () => { revision++; };
  await assert.rejects(api.action('official-library', {}), error => error.code === 'stale_operation');
  assert.equal(requests, 1);
});
