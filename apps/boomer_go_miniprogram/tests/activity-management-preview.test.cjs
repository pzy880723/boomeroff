const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPreview } = require('../miniprogram/shared/preview');
const TS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/;
const UUID = /^[0-9a-f-]{36}$/;
const readActions = ['activity-manage-capabilities', 'activity-manage-list', 'activity-manage-voucher-candidates', 'activity-manage-detail'];
function harness() { const p = createPreview({}); return { ...p, shop: p.session.get().shop.id }; }

test('activity management preview capabilities and list use explicit synthetic current-store data', async () => {
  const h = harness(), p = { shop_id: h.shop };
  assert.deepEqual(await h.api.action('activity-manage-capabilities', p), { shop_id: h.shop, can_view: true, can_manage: true });
  const list = await h.api.action('activity-manage-list', p);
  assert.equal(list.shop_id, h.shop); assert.equal(list.limit, 20); assert.equal(list.cursor, null);
  assert.equal(list.has_more, false); assert.equal(list.next_cursor, null); assert.equal(list.items.length, 1);
  const item = list.items[0];
  assert.match(item.id, UUID); assert.match(item.name, /示例/); assert.match(item.created_at, TS); assert.match(item.updated_at, TS);
  assert.deepEqual(Object.keys(item).sort(), ['id', 'name', 'status', 'requires_review', 'starts_at', 'ends_at', 'created_at', 'updated_at', 'voucher'].sort());
  assert.equal(Object.hasOwn(list, 'total'), false);
});

test('activity management preview preserves nullable legacy dates and returns isolated draft data', async () => {
  const h = harness(), list = await h.api.action('activity-manage-list', { shop_id: h.shop });
  const params = { shop_id: h.shop, activity_id: list.items[0].id };
  const detail = await h.api.action('activity-manage-detail', params);
  assert.deepEqual(Object.keys(detail).sort(), ['shop_id', 'activity', 'voucher', 'version', 'server_time'].sort());
  assert.equal(detail.activity.id, params.activity_id); assert.equal(detail.activity.starts_at, null); assert.equal(detail.activity.ends_at, null);
  assert.equal(detail.activity.min_followers, 0); assert.equal(detail.activity.requires_review, false); assert.match(detail.version, /^[a-f0-9]{64}$/);
  assert.match(detail.server_time, TS); assert.equal(detail.voucher.id, detail.activity.voucher_id);
  assert.deepEqual(Object.keys(detail.activity).sort(), ['id', 'name', 'description', 'voucher_id', 'form_fields', 'status', 'requires_review', 'starts_at', 'ends_at', 'min_followers'].sort());
  detail.activity.form_fields[0].label = '本地修改';
  const again = await h.api.action('activity-manage-detail', params);
  assert.notEqual(again.activity.form_fields[0].label, '本地修改');
  assert.equal(Object.hasOwn(again.activity, 'share_token'), false);
});

test('activity management preview candidate page is read-only, exact and linked to the example activity', async () => {
  const h = harness(), params = { shop_id: h.shop, limit: 1, cursor: null };
  const page = await h.api.action('activity-manage-voucher-candidates', params);
  assert.equal(page.limit, 1); assert.equal(page.cursor, null); assert.equal(page.has_more, false); assert.equal(page.next_cursor, null);
  assert.equal(page.items.length, 1); assert.match(page.items[0].name, /示例/); assert.match(page.items[0].created_at, TS);
  assert.deepEqual(Object.keys(page.items[0]).sort(), ['id', 'name', 'threshold_type', 'discount_amount', 'min_spend', 'valid_days', 'starts_at', 'ends_at', 'created_at'].sort());
  const list = await h.api.action('activity-manage-list', { shop_id: h.shop });
  assert.equal(page.items[0].id, list.items[0].voucher.id);
  page.items[0].name = '改券';
  assert.notEqual((await h.api.action('activity-manage-voucher-candidates', params)).items[0].name, '改券');
});

test('activity management preview never permits missing/foreign store or unsupported input', async () => {
  const h = harness();
  for (const name of readActions) {
    await assert.rejects(h.api.action(name, {}), e => e.status === 400 && e.code === 'invalid_params');
    await assert.rejects(h.api.action(name, { shop_id: 'foreign' }), e => e.status === 403 && e.code === 'shop_forbidden');
    await assert.rejects(h.api.action(name, { shop_id: h.shop, actor: 'forged' }), e => e.status === 400 && e.code === 'invalid_params');
  }
  for (const name of ['activity-manage-list', 'activity-manage-voucher-candidates']) {
    for (const limit of [0, 51, '20', 1.1]) await assert.rejects(h.api.action(name, { shop_id: h.shop, limit }), e => e.status === 400);
    await assert.rejects(h.api.action(name, { shop_id: h.shop, cursor: 'not-a-real-preview-cursor' }), e => e.status === 400);
  }
});

test('activity management preview missing activity is not a successful empty detail', async () => {
  const h = harness();
  await assert.rejects(h.api.action('activity-manage-detail', { shop_id: h.shop }), e => e.status === 400 && e.code === 'invalid_params');
  await assert.rejects(h.api.action('activity-manage-detail', { shop_id: h.shop, activity_id: '00000000-0000-4000-8000-000000000999' }), e => e.status === 404 && e.code === 'not_found');
});

test('activity management preview never synthesizes writes or original-request status receipts', async () => {
  const h = harness();
  for (const action of ['activity-manage-write', 'activity-manage-write-status']) {
    for (const operation of ['create', 'update', 'set_status', 'delete']) {
      await assert.rejects(h.api.action(action, { shop_id: h.shop, operation }), /示例模式不会提交/);
    }
  }
});
