const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepare } = require('../tools/prepare-operations.cjs');

test('learning page is native and includes the approved five destinations and authoring page', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-learning-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const built = path.join(root, 'project');
  prepare(built);
  const read = file => fs.readFileSync(path.join(built, 'miniprogram', file), 'utf8');
  const config = JSON.parse(read('app.json'));
  assert.ok(config.pages.includes('pages/learning-card/index'));
  assert.ok(config.pages.includes('pages/learning-detail/index'));
  assert.ok(config.tabBar.custom);
  for (const value of ['pages/learning', 'pages/learning-detail', 'pages/learning-card']) {
    for (const ext of ['wxml', 'wxss', 'js', 'json']) assert.ok(read(value + '/index.' + ext).length);
  }
  const view = read('pages/learning/index.wxml');
  assert.match(view, /wordmark\.png/);
  assert.doesNotMatch(view, /官方知识库|个人知识库|学了就能用/);
  const { tabs, makeLearningClient } = require(path.join(built, 'miniprogram/shared/learning.js'));
  assert.deepEqual(tabs.map(t => t.label), ['知识', '培训', '测试', '记录', '收藏']);
  const requests = [];
  const learning = makeLearningClient((path, data, mime) => { requests.push({ path, data, mime }); return Promise.resolve({}); });
  return (async () => {
    await learning.list('favorites', { q: '蓝 白', category: '', sort: 'latest', page: 1 });
    await learning.save('a'.repeat(32), { title: 'Tea' });
    assert.match(requests[0].path, /^\/learning\?tab=favorites&q=%E8%93%9D%20%E7%99%BD/);
    assert.deepEqual(requests[1], { path: '/learning/drafts/' + 'a'.repeat(32) + '/save', data: { title: 'Tea' }, mime: undefined });
    await assert.rejects(learning.detail('../secrets'), /编号/);
    assert.equal(requests.length, 2);
  })();
});
