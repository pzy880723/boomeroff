import assert from 'node:assert/strict';
import test from 'node:test';

import { withAuthTimeout } from './authTimeout.ts';

test('returns an auth result that settles before the deadline', async () => {
  const result = await withAuthTimeout(Promise.resolve('ready'), 50, '登录服务响应超时');

  assert.equal(result, 'ready');
});

test('rejects a stalled auth request at the deadline', async () => {
  await assert.rejects(
    withAuthTimeout(new Promise<never>(() => {}), 5, '登录服务响应超时'),
    /登录服务响应超时/,
  );
});
