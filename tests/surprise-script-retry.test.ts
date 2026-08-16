import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../supabase/functions/surprise-script-job/index.ts', import.meta.url),
  'utf8',
);

test('重试失败脚本时清理当前门店积压的旧失败草稿', () => {
  assert.match(source, /\.eq\("user_id", user\.id\)/);
  assert.match(source, /\.eq\("shop_id", job\.shop_id\)/);
  assert.match(source, /\.eq\("status", "failed"\)/);
  assert.match(source, /\.contains\("meta", \{ flow: "surprise" \}\)/);
});

test('开始新脚本前会清理历史失败草稿，旧失败单不能永久阻塞', () => {
  assert.match(source, /async function clearFailedDrafts/);
  assert.match(source, /await clearFailedDrafts\(admin, user\.id, shopId\)/);
});
