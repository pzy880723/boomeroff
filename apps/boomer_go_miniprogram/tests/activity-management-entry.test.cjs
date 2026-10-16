const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPreview } = require('../miniprogram/shared/preview');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

test('activity editor is a registered native secondary route with exactly the five existing tabs', () => {
  const app = read('miniprogram/app.json');
  assert.ok(app.pages.includes('pages/activity-edit/index'));
  assert.equal(app.pages.filter(p => p === 'pages/activity-edit/index').length, 1);
  assert.deepEqual(app.tabBar.list.map(t => t.text), ['工作台', '学习', '识物', '消息', '我的']);
  assert.equal(app.tabBar.list.some(t => t.pagePath === 'pages/activity-edit/index'), false);
});

test('activity editor DevTools condition is explicit synthetic development preview bound to an existing fixture', async () => {
  const config = read('project.config.json');
  const item = config.condition.miniprogram.list.find(row => row.pathName === 'pages/activity-edit/index');
  assert.ok(item, 'native editor preview condition exists');
  assert.match(item.name, /合成.*预览/);
  const query = new URLSearchParams(item.query);
  assert.equal(query.get('preview'), '1');
  assert.deepEqual(Array.from(query.keys()).sort(), ['id', 'preview']);
  const preview = createPreview({}), shop_id = preview.session.get().shop.id;
  const value = await preview.api.action('activity-manage-detail', { shop_id, activity_id: query.get('id') });
  assert.match(value.activity.name, /示例/);
  assert.equal(config.appid, 'touristappid');
  assert.equal(config.setting.urlCheck, true);
});

test('candidate activity management has no ordinary production list/detail entry before backend acceptance', () => {
  for (const page of ['list', 'activity']) for (const ext of ['js', 'wxml']) {
    const source = fs.readFileSync(path.join(root, 'miniprogram/pages', page, 'index.' + ext), 'utf8');
    assert.equal(source.includes('/pages/activity-edit/index'), false, page + '.' + ext + ' must not open the unfinished backend feature');
  }
});
