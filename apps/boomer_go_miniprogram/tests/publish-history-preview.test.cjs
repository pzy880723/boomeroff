const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createPreview } = require('../miniprogram/shared/preview');

test('native publishing history route is reachable without changing five tabs or embedding H5', () => {
  const app = require('../miniprogram/app.json');
  assert.ok(app.pages.includes('pages/publish-history/index'));
  assert.deepEqual(app.tabBar.list.map(row => row.text), ['工作台', '学习', '识物', '消息', '我的']);
  const wxml = fs.readFileSync(require('node:path').join(__dirname, '../miniprogram/pages/marketing/index.wxml'), 'utf8');
  assert.match(wxml, /data-url="\/pages\/publish-history\/index"[^>]*bindtap="go"/);
});

test('history preview has exact synthetic list/detail and never publishes or rewrites records', async () => {
  const p = createPreview({});
  const list = await p.api.publishHistory();
  assert.equal(list.shopId, p.session.get().shop.id); assert.equal(list.limit, 50); assert.equal(list.items.length, 1);
  assert.match(list.items[0].title, /示例/);
  const detail = await p.api.publishStatus(list.items[0].id);
  assert.equal(detail.job.id, list.items[0].id); assert.equal(detail.shopId, list.shopId); assert.equal(detail.targets.length, 2);
  assert.ok(detail.targets.every(t => /示例/.test(t.name)));
  for (const name of ['dispatch-job-create', 'dispatch-job-retry', 'dispatch-job-cancel']) await assert.rejects(p.api.invoke(name, {}));
  await assert.rejects(p.api.publishStatus('missing'));
  assert.deepEqual(await p.api.publishHistory(), list);
});
