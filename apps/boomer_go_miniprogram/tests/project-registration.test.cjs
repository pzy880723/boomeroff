const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('GO uses its dedicated employee AppID without a private-config override', () => {
  const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  assert.equal(project.appid, 'wx5c4f68873d7f919c');
  const privatePath = path.join(root, 'project.private.config.json');
  if (fs.existsSync(privatePath)) {
    const local = JSON.parse(fs.readFileSync(privatePath, 'utf8'));
    assert.equal(local.appid === undefined || local.appid === project.appid, true);
  }
  assert.equal(project.setting.urlCheck, true);
  assert.equal(project.miniprogramRoot, 'miniprogram/');
});
test('project and client configuration contain no app-secret fields', () => {
  for (const file of ['project.config.json', 'miniprogram/config.js']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(text, /app_?secret|WECHAT_EMPLOYEE_APP_SECRET/i);
  }
});
