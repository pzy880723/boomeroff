const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPreview } = require('../miniprogram/shared/preview');

test('recognition history preview has exact synthetic source identity and cannot save a favorite', async () => {
  const preview = createPreview({});
  const history = await preview.api.action('scan-history', { page: 0, page_size: 20 });
  assert.equal(history.persisted, false);
  assert.equal(history.page, 0);
  assert.equal(history.has_more, false);
  assert.equal(history.items.length, 1);
  const row = history.items[0];
  assert.match(row.id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.match(row.name, /示例/);
  const detail = await preview.api.action('knowledge-detail', { kind: 'history', id: row.id });
  assert.equal(detail.persisted, false);
  assert.equal(detail.item.id, row.id);
  assert.equal(detail.item.kind, 'recognition');
  assert.equal(detail.item.raw.id, row.id);
  assert.equal(detail.item.raw.created_by, preview.session.get().userId);
  assert.equal(detail.item.quiz_available, false);
  assert.ok(detail.item.raw.story);
  assert.ok(detail.item.raw.selling_points);
  assert.match(detail.item.body, /合成/);
  assert.deepEqual((await preview.api.action('scan-history', { page: 1, page_size: 20 })).items, []);
  await assert.rejects(preview.api.action('knowledge-save', { product_id: row.id }));
  await assert.rejects(preview.api.action('knowledge-detail', { kind: 'history', id: 'missing' }));
  assert.deepEqual((await preview.api.action('scan-history', { page: 0, page_size: 20 })).items, history.items);
});
