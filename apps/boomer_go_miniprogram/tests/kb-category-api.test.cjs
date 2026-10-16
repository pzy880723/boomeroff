const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('../miniprogram/shared/api');
const { createPreview } = require('../miniprogram/shared/preview');
const actions = ['kb-category-list', 'kb-category-detail', 'kb-category-write', 'kb-category-write-status'];

test('category actions require the selected working shop without rewriting frozen operation fields', async () => {
  let shop = null;
  const calls = [];
  const session = { get: () => ({ userId: 'user', shop }) };
  const api = createApi({ wx: {}, config: {}, session, invoke: async (name, body) => { calls.push({ name, body }); return { data: {} }; } });
  for (const action of actions) await assert.rejects(api.action(action, { shop_id: 'foreign', type: 'qa' }), /授权工作门店/);
  assert.equal(calls.length, 0);
  shop = { id: 'current' };
  const params = Object.freeze({ shop_id: 'foreign', type: 'qa', category_id: 'category', request_id: 'intent', operation: 'update', expected_version: 'version', name: '分类', sort_order: -2 });
  for (const action of actions) await api.action(action, params);
  assert.equal(calls.length, actions.length);
  for (let i = 0; i < calls.length; i++) {
    assert.equal(calls[i].name, 'go-mini-api');
    assert.equal(calls[i].body.action, actions[i]);
    assert.deepEqual(calls[i].body.params, { ...params, shop_id: 'current' });
  }
  assert.equal(params.shop_id, 'foreign');
});

test('category actions stop before IO when a freshness check changes identity', async () => {
  let revision = 1, calls = 0;
  const session = { get: () => ({ userId: 'user', shop: { id: 'current' } }), revision: () => revision, ensureFresh: async () => { revision++; } };
  const api = createApi({ wx: {}, config: {}, session, invoke: async () => { calls++; return { data: {} }; } });
  for (const action of actions) await assert.rejects(api.action(action, { type: 'sop' }), e => e.code === 'stale_operation');
  assert.equal(calls, 0);
});

test('category preview projects same-store and shared read-only fixtures with exact detail identity', async () => {
  const p = createPreview({}), shop_id = p.session.get().shop.id;
  for (const type of ['sop', 'qa']) {
    const input = { shop_id, type, page: 0, page_size: 20 };
    const list = await p.api.action('kb-category-list', input);
    assert.equal(list.shop_id, shop_id); assert.equal(list.type, type);
    assert.equal(list.can_manage, true); assert.equal(list.page, 0); assert.equal(list.page_size, 20); assert.equal(list.has_more, false);
    assert.deepEqual(list.limits, { name_chars: 200, sort_min: -2147483648, sort_max: 2147483647 });
    assert.ok(Date.parse(list.as_of)); assert.equal(list.items.length, 2);
    assert.ok(list.items.some(x => x.shop_id === null)); assert.ok(list.items.some(x => x.shop_id === shop_id));
    for (const row of list.items) {
      assert.equal(row.type, type); assert.match(row.name, /示例/); assert.equal(Number.isInteger(row.sort_order), true); assert.match(row.version, /^[0-9a-f]{64}$/);
      const detail = await p.api.action('kb-category-detail', { shop_id, type, id: row.id });
      assert.deepEqual(detail.category, row); assert.equal(detail.can_manage, row.shop_id === shop_id); assert.deepEqual(detail.limits, list.limits);
    }
    assert.deepEqual((await p.api.action('kb-category-list', { ...input, page: 1 })).items, []);
    list.items[0].name = 'mutated';
    assert.match((await p.api.action('kb-category-list', input)).items[0].name, /示例/);
    await assert.rejects(p.api.action('kb-category-detail', { shop_id, type, id: 'missing' }), e => e.status === 404 && e.code === 'not_found');
    for (const action of ['kb-category-write', 'kb-category-write-status']) await assert.rejects(p.api.action(action, { shop_id, type }), /示例模式/);
  }
});

test('category preview rejects foreign store and invalid type or pagination, never returning an unrelated sample', async () => {
  const p = createPreview({}), shop_id = p.session.get().shop.id;
  await assert.rejects(p.api.action('kb-category-list', { shop_id: 'foreign', type: 'sop' }), e => e.status === 403);
  for (const params of [{ type: 'training' }, { type: 'sop', page: -1 }, { type: 'sop', page: 0.5 }, { type: 'qa', page_size: 21 }]) {
    await assert.rejects(p.api.action('kb-category-list', { shop_id, ...params }), e => e.status === 400 && e.code === 'invalid_params');
  }
});
