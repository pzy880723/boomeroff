const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPreview } = require('../miniprogram/shared/preview');

test('synthetic official detail exposes the stable source version needed by the disabled Q&A card', async () => {
  const preview = createPreview({}), rows = await preview.api.action('official-library', {});
  const id = rows.items[0].id, first = await preview.api.action('knowledge-detail', { kind: 'official', id });
  const second = await preview.api.action('knowledge-detail', { kind: 'official', id });
  assert.equal(first.item.raw.updated_at, rows.items[0].updated_at); assert.ok(Date.parse(first.item.raw.updated_at));
  assert.equal(second.item.raw.updated_at, first.item.raw.updated_at);
  assert.equal(first.persisted, false);
});

test('preview cannot fabricate an AI knowledge reply or persist a conversation', async () => {
  const preview = createPreview({});
  await assert.rejects(preview.api.action('official-knowledge-chat', { knowledge_id: '00000000-0000-4000-8000-000000000831', messages: [{ role: 'user', content: '怎么介绍？' }] }), /不会提交真实数据或付费任务/);
});
