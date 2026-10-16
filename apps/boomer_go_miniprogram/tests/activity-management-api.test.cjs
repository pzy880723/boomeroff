const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('../miniprogram/shared/api');

const actions = ['activity-manage-capabilities', 'activity-manage-list', 'activity-manage-voucher-candidates', 'activity-manage-detail', 'activity-manage-write', 'activity-manage-write-status'];

for (const action of actions) test(action + ' requires a verified selected store before transport', async () => {
  let calls = 0;
  const api = createApi({ wx: {}, config: {}, session: { get: () => ({ userId: 'employee', shop: null }) },
    invoke: async () => { calls++; return { data: {} }; } });
  await assert.rejects(api.action(action, { shop_id: 'forged' }), /授权工作门店/);
  assert.equal(calls, 0);
});

for (const action of actions) test(action + ' binds the verified store without changing the original request', async () => {
  const sent = [], order = [];
  const params = { shop_id: 'forged', operation: 'update', activity_id: 'activity', request_id: 'original-request', expected_version: 'a'.repeat(64), patch: { name: '新名称', description: null } };
  const api = createApi({ wx: {}, config: {}, session: {
    get: () => ({ userId: 'employee', shop: { id: 'verified' } }),
    ensureFresh: async () => { order.push('fresh'); }
  }, invoke: async (name, body) => { order.push('request'); sent.push({ name, body }); return { data: {} }; } });
  await api.action(action, params);
  assert.deepEqual(order, ['fresh', 'request']);
  assert.deepEqual(sent, [{ name: 'go-mini-api', body: { action, params: { ...params, shop_id: 'verified' } } }]);
  assert.equal(params.shop_id, 'forged');
  assert.equal(sent[0].body.params.patch.description, null);
  assert.equal(Object.hasOwn(sent[0].body.params.patch, 'form_fields'), false);
});

for (const [status, code] of [[403, 'erp_scope_not_ready'], [403, 'shop_forbidden'], [409, 'version_conflict'], [500, 'db_error'], [0, 'network_error']]) {
  test('activity write does not renew and resend after ' + status + '/' + code, async () => {
    let calls = 0, renewals = 0;
    const failure = Object.assign(new Error('operation failed'), { status, code });
    const api = createApi({ wx: {}, config: {}, session: {
      get: () => ({ userId: 'employee', shop: { id: 'verified' } }), restore: async () => { renewals++; }
    }, invoke: async () => { calls++; throw failure; } });
    await assert.rejects(api.action('activity-manage-write', { operation: 'create', request_id: 'same', patch: {} }), error => error === failure);
    assert.equal(calls, 1);
    assert.equal(renewals, 0);
  });
}

test('activity write rejects a changed identity after an uncertain transport result', async () => {
  let revision = 1, finish, calls = 0;
  const session = { get: () => ({ userId: 'employee', shop: { id: 'verified' } }), revision: () => revision };
  const api = createApi({ wx: {}, config: {}, session, invoke: () => {
    calls++; return new Promise(resolve => { finish = resolve; });
  } });
  const pending = api.action('activity-manage-write', { operation: 'delete', request_id: 'same', activity_id: 'activity', expected_version: 'a'.repeat(64) });
  await new Promise(resolve => setImmediate(resolve));
  revision++;
  finish({ data: { deleted: true } });
  await assert.rejects(pending, error => error.code === 'stale_operation');
  assert.equal(calls, 1);
});

test('activity management preparation rejects stale scope before a request is sent', async () => {
  let revision = 1, calls = 0;
  const session = { get: () => ({ userId: 'employee', shop: { id: 'verified' } }), revision: () => revision,
    ensureFresh: async () => { revision++; } };
  const api = createApi({ wx: {}, config: {}, session, invoke: async () => { calls++; return { data: {} }; } });
  await assert.rejects(api.action('activity-manage-write', { operation: 'create', request_id: 'same', patch: {} }), error => error.code === 'stale_operation');
  assert.equal(calls, 0);
});
